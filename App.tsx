
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

    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      setStatus(prev => ({ 
        ...prev, 
        error: "Media capture is not supported in this browser or environment (ensure HTTPS/Localhost).", 
        isConnecting: false 
      }));
      return;
    }

    if (window.aistudio && !(await window.aistudio.hasSelectedApiKey())) {
      await window.aistudio.openSelectKey();
    }

    if (!process.env.API_KEY) {
      setStatus(prev => ({ ...prev, error: "API Key missing.", isConnecting: false }));
      return;
    }

    try {
      // 1. Get Microphone
      const micStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      }).catch(err => {
        throw new Error(`Microphone denied: ${err.message}`);
      });
      micStreamRef.current = micStream;

      // 2. Get System Audio (Refined constraints for better 'Share Audio' visibility)
      let systemStream: MediaStream | null = null;
      try {
        const displayConstraints = {
          video: true, // Most browsers require video:true to offer audio share
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
          }
        };

        systemStream = await navigator.mediaDevices.getDisplayMedia(displayConstraints);
        
        const audioTracks = systemStream.getAudioTracks();
        if (audioTracks.length === 0) {
          systemStream.getTracks().forEach(t => t.stop());
          throw new Error("AUDIO NOT SHARED: You must check the 'Share audio' box in the browser popup (usually bottom-left).");
        }
        systemStreamRef.current = systemStream;
      } catch (e: any) {
        if (e.name === 'NotAllowedError') {
          throw new Error("PERMISSION DENIED: You cancelled the share or denied permission. Please try again and ensure 'Share Audio' is checked.");
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
        systemGain.gain.value = 2.0; // Higher gain for the professor
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
            setStatus(prev => ({ ...prev, error: "Connection error. Please restart Guard.", isConnecting: false }));
            stopSession();
          },
          onclose: () => stopSession()
        },
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          systemInstruction: `You are the Viva Intelligence Guard. 
            
            PARTIES IN STREAM:
            - PROFESSOR (System Audio): Asking questions.
            - STUDENT (Microphone): Answering questions.
            - YOU: Silent visual assistant.
            
            TASKS:
            1. Transcribe the Professor's questions and IMMEDIATELY provide the best possible technical answer visually.
            2. Monitor the Student's verbal response. If they stutter, fail to explain a concept, or give a wrong answer, provide a "Corrective Hint" or "Key Fact" box immediately.
            3. Use formatted text: **Bold**, bullet points, or short numbered lists for high readability.
            4. STAY SILENT. Do not use your voice. 
            5. IMPORTANT: Ignore your own previous outputs in the audio stream to avoid feedback loops.
            
            CONTEXT: ${knowledgeBase || 'Professional viva/interview session.'}`,
        }
      });

      sessionRef.current = await sessionPromise;

    } catch (err: any) {
      console.error("Startup Error:", err);
      setStatus(prev => ({ ...prev, error: err.message, isConnecting: false }));
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
            <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-[0.2em]">Silent Companion v2.1</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <StatusIndicator status={status} />
          {!status.isActive ? (
            <button
              onClick={startSession}
              disabled={status.isConnecting}
              className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-sm font-bold transition-all flex items-center gap-2 shadow-xl shadow-indigo-600/20 active:scale-95"
            >
              {status.isConnecting ? "Initializing..." : "Enable Viva Guard"}
            </button>
          ) : (
            <button
              onClick={stopSession}
              className="px-6 py-2.5 rounded-xl bg-rose-600/10 border border-rose-500/50 hover:bg-rose-600/20 text-rose-400 text-sm font-bold transition-all flex items-center gap-2"
            >
              <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
              Terminate Guard
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden p-6 gap-6 relative">
        {!status.isActive && (
          <div className="w-96 flex flex-col gap-5 bg-white/[0.03] backdrop-blur-sm rounded-3xl p-6 border border-white/5 shadow-inner">
            <div className="flex items-center gap-2">
              <div className="w-1 h-4 bg-indigo-500 rounded-full"></div>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Setup Guide</h2>
            </div>
            <div className="flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
              <textarea
                value={knowledgeBase}
                onChange={(e) => setKnowledgeBase(e.target.value)}
                placeholder="Paste Job Description or Study Notes for better AI accuracy..."
                className="h-32 bg-black/40 border border-white/5 rounded-2xl p-4 text-sm focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/10 outline-none resize-none transition-all placeholder:text-slate-600"
              />
              
              <div className="p-5 rounded-2xl bg-indigo-500/5 border border-indigo-500/20 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="mt-1 w-5 h-5 rounded-full bg-indigo-500 flex-shrink-0 flex items-center justify-center text-[10px] font-bold">1</div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Click <b>'Enable Viva Guard'</b>. You will see a browser sharing popup.
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-1 w-5 h-5 rounded-full bg-indigo-500 flex-shrink-0 flex items-center justify-center text-[10px] font-bold">2</div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Select the <b>'Chrome Tab'</b> (or Tab) containing your Viva/WhatsApp call. 
                    <span className="block mt-1 text-indigo-400 font-bold">Tab sharing is the most reliable for audio.</span>
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <div className="mt-1 w-5 h-5 rounded-full bg-amber-500 flex-shrink-0 flex items-center justify-center text-[10px] font-bold text-black">!</div>
                  <p className="text-[11px] text-amber-200 leading-relaxed font-bold">
                    CRITICAL: Look for the 'Share tab audio' (or 'Share audio') checkbox at the bottom left of the popup and CHECK IT.
                  </p>
                </div>
              </div>
              
              {status.error && (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 animate-in slide-in-from-top-2">
                  <h3 className="text-xs font-bold text-rose-400 mb-1 flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Capture Error
                  </h3>
                  <p className="text-[10px] text-rose-300 leading-relaxed">{status.error}</p>
                  <button 
                    onClick={startSession}
                    className="mt-3 text-[10px] font-black uppercase text-indigo-400 hover:text-indigo-300 underline"
                  >
                    Click here to retry capture
                  </button>
                </div>
              )}
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
