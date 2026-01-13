
import React from 'react';
import { SessionStatus } from '../types';

interface StatusIndicatorProps {
  status: SessionStatus;
}

const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status }) => {
  return (
    <div className="flex items-center gap-3">
      {status.error && (
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-900/30 border border-red-500/30 text-red-400 text-xs font-medium">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {status.error}
        </div>
      )}
      
      <div className="flex items-center gap-4 bg-slate-900/50 rounded-full px-4 py-1.5 border border-slate-700/50">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${status.isActive ? 'bg-emerald-500' : 'bg-slate-600'}`}></div>
          <span className="text-xs font-semibold text-slate-300">
            {status.isActive ? 'Guard Active' : 'Standby'}
          </span>
        </div>
        
        <div className="w-px h-3 bg-slate-700"></div>
        
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${status.isMicActive ? 'bg-indigo-500 pulse-animation' : 'bg-slate-600'}`}></div>
          <span className="text-xs font-semibold text-slate-300">
            {status.isMicActive ? 'Mic Hot' : 'Mic Closed'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default StatusIndicator;
