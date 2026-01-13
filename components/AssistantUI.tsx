
import React, { useRef, useEffect } from 'react';
import { Message, Suggestion } from '../types';

interface AssistantUIProps {
  messages: Message[];
  suggestions: Suggestion[];
  isActive: boolean;
  streamingInput: string;
  streamingOutput: string;
}

const AssistantUI: React.FC<AssistantUIProps> = ({ 
  messages, 
  suggestions, 
  isActive, 
  streamingInput, 
  streamingOutput 
}) => {
  const messageEndRef = useRef<HTMLDivElement>(null);
  const suggestionEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingInput]);

  useEffect(() => {
    suggestionEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [suggestions, streamingOutput]);

  if (!isActive && messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-12 space-y-10">
        <div className="relative">
          <div className="absolute -inset-4 bg-indigo-500 rounded-full blur-2xl opacity-10 animate-pulse"></div>
          <div className="relative w-24 h-24 rounded-[2rem] bg-slate-800 flex items-center justify-center text-indigo-400 border border-white/5 shadow-2xl">
            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
        </div>
        <div className="space-y-3">
          <h2 className="text-3xl font-black text-white tracking-tight">Intelligence Guard</h2>
          <p className="text-slate-400 max-w-md mx-auto text-sm leading-relaxed">
            Listening to <span className="text-indigo-400 font-bold">Microphone + Speakers</span> to provide real-time viva assistance.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-3xl">
          {[
            { title: "Dual-Source Capture", icon: "🎙️", desc: "Mic + System Audio" },
            { title: "Real-time Answers", icon: "⚡", desc: "Instant visual hints" },
            { title: "Proactive Guard", icon: "🛡️", desc: "Detects interviewer questions" }
          ].map((item, idx) => (
            <div key={idx} className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all group">
              <div className="text-3xl mb-4 group-hover:scale-110 transition-transform">{item.icon}</div>
              <div className="text-sm font-bold text-slate-200 mb-1">{item.title}</div>
              <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex gap-6 overflow-hidden">
      {/* Transcription Column */}
      <div className="flex-[0.4] flex flex-col bg-black/40 rounded-3xl border border-white/5 overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]"></div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Full Audio Stream</h3>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {messages.map((m) => (
            <div key={m.id} className={`flex flex-col ${m.role === 'assistant' ? 'items-start' : 'items-end'}`}>
              <div className={`max-w-[90%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                m.role === 'assistant' 
                  ? 'bg-slate-800/80 text-slate-200 rounded-tl-none border border-white/5 shadow-lg' 
                  : 'bg-indigo-600/10 border border-indigo-500/30 text-indigo-100 rounded-tr-none shadow-[0_8px_20px_-10px_rgba(99,102,241,0.3)]'
              }`}>
                {m.text}
              </div>
              <span className="text-[10px] text-slate-600 mt-2 font-bold uppercase tracking-widest">
                {m.role === 'assistant' ? 'AI Response' : 'Audio Captured'}
              </span>
            </div>
          ))}
          
          {streamingInput && (
            <div className="flex flex-col items-end animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="max-w-[90%] px-4 py-3 rounded-2xl text-sm leading-relaxed bg-indigo-500/5 border border-indigo-500/20 text-indigo-200/60 italic rounded-tr-none">
                {streamingInput}...
              </div>
            </div>
          )}
          
          <div ref={messageEndRef} />
        </div>
      </div>

      {/* Intelligence Column */}
      <div className="flex-[0.6] flex flex-col gap-4 overflow-hidden">
        <div className="px-2 flex items-center justify-between">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Live Assistance Hub</h3>
          <span className="text-[10px] font-bold text-slate-600">Proactive Analysis Enabled</span>
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar pr-2 pb-6">
          {streamingOutput && (
            <div className="relative group overflow-hidden">
              <div className="absolute -inset-px bg-gradient-to-r from-indigo-500/50 to-purple-600/50 rounded-2xl blur-sm opacity-50"></div>
              <div className="relative bg-[#161b2c] border border-indigo-500/30 rounded-2xl p-6 shadow-2xl">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full bg-indigo-400 animate-ping"></div>
                  <span className="text-indigo-400 text-[10px] font-black uppercase tracking-widest">Generating Live Answer...</span>
                </div>
                <div className="text-indigo-100 text-lg font-bold leading-relaxed whitespace-pre-wrap animate-in fade-in duration-500">
                  {streamingOutput}
                  <span className="inline-block w-2 h-5 ml-1 bg-indigo-500 animate-pulse"></span>
                </div>
              </div>
            </div>
          )}

          {suggestions.length === 0 && !streamingOutput ? (
            <div className="h-full flex flex-col items-center justify-center space-y-4 opacity-30 text-center p-12 border-2 border-dashed border-white/5 rounded-[2.5rem]">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <p className="text-sm font-medium italic">Monitoring conversation for questions...</p>
            </div>
          ) : (
            suggestions.map((s, idx) => (
              <div 
                key={s.id} 
                className={`relative group bg-[#111827] border border-white/5 hover:border-indigo-500/30 rounded-2xl p-6 transition-all duration-300 shadow-xl ${idx === 0 ? 'ring-2 ring-indigo-500/40 bg-slate-800/40 shadow-indigo-500/10' : ''}`}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest ${idx === 0 ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-500'}`}>
                      {idx === 0 ? 'Immediate Action' : 'Historical Insight'}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-600 font-bold">{s.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                </div>
                <div className="text-slate-100 text-base font-semibold leading-relaxed whitespace-pre-wrap selection:bg-indigo-500/30">
                  {s.content}
                </div>
              </div>
            ))
          )}
          <div ref={suggestionEndRef} />
        </div>
      </div>
    </div>
  );
};

export default AssistantUI;
