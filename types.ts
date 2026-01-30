
export enum AppState {
  IDLE = 'idle',
  SPEAKING = 'speaking',
  PAUSED = 'paused',
  QUEUEING = 'queueing',
  GENERATING = 'generating',
  ERROR = 'error'
}

export enum TTSMode {
  BROWSER = 'browser',
  GEMINI = 'gemini'
}

export interface Preset {
  id: string;
  label: string;
  text: string;
}

export interface GeminiVoice {
  name: string;
  label: string;
  gender: 'male' | 'female' | 'neutral';
}

export interface User {
  username: string;
  email: string;
  password?: string;
  isActivated: boolean;
  isSubscribed?: boolean;
  subscriptionStatus?: 'inactive' | 'pending' | 'active';
  role?: 'admin' | 'user';
  subscriptionDate?: string;
}

export enum AuthMode {
  LOGIN = 'login',
  REGISTER = 'register',
  ACTIVATE = 'activate',
  FORGOT_PASSWORD = 'forgot_password',
  RESET_PASSWORD = 'reset_password'
}
