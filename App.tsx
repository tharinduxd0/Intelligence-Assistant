
import React, { useState, useCallback, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Blob as GeminiBlob } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import { Message, Suggestion, SessionStatus } from './types';
import StatusIndicator from './components/StatusIndicator';
import AssistantUI from './components/AssistantUI';

const App: React.FC = () => {
  const [status, setStatus] = useState<SessionStatus>({
    isActive: false,
    isConnecting: false,
    isMicActive: false,
    error: null,
  });
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [knowledgeBase, setKnowledgeBase] = useState<string>('');
  
  const [streamingInput, setStreamingInput] = useState('');
  const [streamingOutput, setStreamingOutput] = useState('');
  
  const sessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const systemStreamRef = useRef<MediaStream | null>(null);
  
  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');

  const encode = (bytes: Uint8Array) => {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const createBlob = (data: Float32Array): GeminiBlob => {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }
    return {
      data: encode(new Uint8Array(int16.buffer)),
      mimeType: 'audio/pcm;rate=16000',
    };
  };

  const stopSession = useCallback(() => {
    if (sessionRef.current) {
      try {
        sessionRef.current.close();
      } catch (e) {
        console.error("Error closing session:", e);
      }
      sessionRef.current = null;
    }
    [micStreamRef, systemStreamRef].forEach(ref => {
      if (ref.current) {
        ref.current.getTracks().forEach(track => track.stop());
        ref.current = null;
      }
    });
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setStatus(prev => ({ ...prev, isActive: false, isMicActive: false }));
    setStreamingInput('');
    setStreamingOutput('');
  }, []);

  const startSession = async () => {
    setStatus({ isActive: false, isConnecting: true, isMicActive: false, error: null });

    if (window.aistudio && !(await window.aistudio.hasSelectedApiKey())) {
      await window.aistudio.openSelectKey();
    }

    if (!process.env.API_KEY) {
      setStatus(prev => ({ ...prev, error: "API Key missing.", isConnecting: false }));
      return;
    }

    try {
      // 1. Get Microphone (Candidate Voice)
      const micStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      }).catch(err => {
        throw new Error(`Microphone Access Denied: ${err.message}`);
      });
      micStreamRef.current = micStream;

      // 2. Get System Audio (Professor Voice via Speakers/WhatsApp)
      let systemStream: MediaStream | null = null;
      try {
        const displayConstraints = {
          video: {
            displaySurface: "browser",
            width: { max: 1 },
            height: { max: 1 },
            frameRate: { max: 1 }
          },
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          }
        };

        systemStream = await navigator.mediaDevices.getDisplayMedia(displayConstraints as any);
        
        const audioTracks = systemStream.getAudioTracks();
        if (audioTracks.length === 0) {
          systemStream.getTracks().forEach(t => t.stop());
          throw new Error("System audio share was NOT enabled. Please restart and check the 'Share Audio' box in the browser dialog.");
        }
        systemStreamRef.current = systemStream;
      } catch (e: any) {
        if (e.name === 'NotAllowedError') {
          throw new Error("Permission Denied: You must allow sharing and check 'Share Audio' to capture the professor's voice.");
        }
        throw e;
      }

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;

      const mixerNode = audioCtx.createGain();
      
      const micSource = audioCtx.createMediaStreamSource(micStream);
      const micGain = audioCtx.createGain();
      micGain.gain.value = 1.0; 
      micSource.connect(micGain);
      micGain.connect(mixerNode);

      if (systemStream) {
        const systemSource = audioCtx.createMediaStreamSource(systemStream);
        const systemGain = audioCtx.createGain();
        systemGain.gain.value = 1.8; // High priority for Professor's voice comprehension
        systemSource.connect(systemGain);
        systemGain.connect(mixerNode);
      }

      const scriptProcessor = audioCtx.createScriptProcessor(4096, 1, 1);
      mixerNode.connect(scriptProcessor);
      scriptProcessor.connect(audioCtx.destination);

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setStatus(prev => ({ ...prev, isActive: true, isConnecting: false, isMicActive: true }));
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createBlob(inputData);
              sessionPromise.then(session => {
                if (session) session.sendRealtimeInput({ media: pcmBlob });
              });
            };
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              currentOutputTranscription.current += text;
              setStreamingOutput(currentOutputTranscription.current);
            } else if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              currentInputTranscription.current += text;
              setStreamingInput(currentInputTranscription.current);
            }

            if (message.serverContent?.turnComplete) {
              const inputText = currentInputTranscription.current;
              const outputText = currentOutputTranscription.current;

              if (inputText.trim()) {
                setMessages(prev => [...prev, {
                  id: uuidv4(),
                  role: 'user',
                  text: inputText,
                  timestamp: new Date()
                }]);
              }

              if (outputText.trim()) {
                const newMsgId = uuidv4();
                setMessages(prev => [...prev, {
                  id: newMsgId,
                  role: 'assistant',
                  text: outputText,
                  timestamp: new Date()
                }]);

                setSuggestions(prev => [{
                  id: newMsgId,
                  title: 'AI Insight',
                  content: outputText,
                  confidence: 0.99,
                  timestamp: new Date()
                }, ...prev].slice(0, 15));
              }

              currentInputTranscription.current = '';
              currentOutputTranscription.current = '';
              setStreamingInput('');
              setStreamingOutput('');
            }
          },
          onerror: (e: any) => {
            console.error("Session Error:", e);
            setStatus(prev => ({ ...prev, error: "Connection interrupted. Please refresh.", isConnecting: false }));
            stopSession();
          },
          onclose: () => stopSession()
        },
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          systemInstruction: `You are a specialized Viva Intelligence Guard. 
            
            PARTIES:
            1. PROFESSOR (Priority voice, captured via system audio).
            2. STUDENT (The user you are helping, captured via microphone).
            3. YOU (Silent agent providing VISUAL-ONLY answers and hints).
            
            OPERATIONAL PROTOCOL:
            - MONITOR PROFESSOR: When the professor asks a question, IMMEDIATELY show a comprehensive answer and key talking points in the transcription/suggestions area.
            - MONITOR STUDENT: Listen to the student's response. If they are incorrect or miss a major detail, provide a correction hint immediately.
            - IGNORE YOURSELF: You are analyzing a mixed audio stream. DO NOT respond to your own previous hints or transcriptions. Only analyze the Professor's and Student's human voices.
            - OUTPUT FORMAT: Use Bold, Bullet points, and concise text for speed.
            - YOUR GOAL: Be the student's invisible encyclopedia. Do not talk back verbally.
            
            CONTEXT: ${knowledgeBase || 'Advanced Academic Viva Session.'}`,
        }
      });

      sessionRef.current = await sessionPromise;

    } catch (err: any) {
      console.error("Startup Error:", err);
      setStatus(prev => ({ ...prev, error: err.message || "Failed to start capture.", isConnecting: false }));
      stopSession();
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#0a0f1e] text-slate-100 overflow-hidden font-['Inter']">
      <header className="flex items-center justify-between px-6 py-4 bg-[#111827]/80 backdrop-blur-md border-b border-white/5 shadow-2xl z-10">
        <div className="flex items-center gap-4">
          <div className="group relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
            <div className="relative w-11 h-11 rounded-xl bg-slate-900 flex items-center justify-center border border-white/10">
              <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">Viva Guard</h1>
            <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-[0.2em]">Capture Mode: System Audio + Mic</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <StatusIndicator status={status} />
          {!status.isActive ? (
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={startSession}
                disabled={status.isConnecting}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-bold transition-all flex items-center gap-2 shadow-xl shadow-indigo-600/20 active:scale-95"
              >
                {status.isConnecting ? "Connecting..." : "Enable Viva Guard"}
              </button>
            </div>
          ) : (
            <button
              onClick={stopSession}
              className="px-6 py-2.5 rounded-xl bg-rose-600/10 border border-rose-500/50 hover:bg-rose-600/20 text-rose-400 text-sm font-bold transition-all flex items-center gap-2"
            >
              <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
              End Guarding
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden p-6 gap-6 relative">
        {!status.isActive && (
          <div className="w-80 flex flex-col gap-5 bg-white/[0.03] backdrop-blur-sm rounded-3xl p-6 border border-white/5 shadow-inner">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 bg-indigo-500 rounded-full"></div>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Knowledge Prep</h2>
            </div>
            <div className="flex-1 flex flex-col gap-3">
              <textarea
                value={knowledgeBase}
                onChange={(e) => setKnowledgeBase(e.target.value)}
                placeholder="Knowledge base/Context for AI..."
                className="flex-1 bg-black/40 border border-white/5 rounded-2xl p-4 text-sm focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 outline-none resize-none transition-all custom-scrollbar placeholder:text-slate-600"
              />
              <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 space-y-3">
                <p className="text-[11px] text-indigo-300 font-bold">⚠️ CAPTURE INSTRUCTIONS:</p>
                <div className="text-[10px] text-slate-400 space-y-2 leading-relaxed">
                  <p>When the sharing popup appears:</p>
                  <ol className="list-decimal list-inside ml-1 space-y-1">
                    <li>Select <b>'Entire Screen'</b> or the specific <b>'WhatsApp Call Tab'</b>.</li>
                    <li><b>IMPORTANT:</b> Locate and check the <b>'Share audio'</b> checkbox at the bottom left.</li>
                    <li>Click <b>'Share'</b>.</li>
                  </ol>
                  <p className="mt-2 text-indigo-400 italic font-medium">This allows the AI to hear the Professor's voice through your system.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 flex gap-6 overflow-hidden">
          <AssistantUI 
            messages={messages} 
            suggestions={suggestions} 
            isActive={status.isActive}
            streamingInput={streamingInput}
            streamingOutput={streamingOutput}
          />
        </div>
      </main>

      <div className="fixed bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent"></div>
    </div>
  );
};

export default App;
