
export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

export interface Suggestion {
  id: string;
  title: string;
  content: string;
  confidence: number;
  timestamp: Date;
}

export interface SessionStatus {
  isActive: boolean;
  isConnecting: boolean;
  isMicActive: boolean;
  error: string | null;
}
