
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AppState, TTSMode, GeminiVoice, User, AuthMode } from './types';
import { GEMINI_VOICES, PRESETS, DEFAULT_TEXT } from './constants';
import { generateGeminiSpeech } from './geminiService';
import { audioBufferToWav, concatenateAudioBuffers } from './AudioUtils';

const ADMIN_EMAIL = 'phamvuphiho@gmail.com';
const SUBSCRIPTION_PRICE = "$10.00 / month";
const PAYPAL_LINK = `https://paypal.me/VuPhiHo`;
const PAYPAL_DIRECT_LINK = "https://www.paypal.com/ncp/payment/GE4L8MF47D4JA";
const PAYPAL_QR_IMAGE_URL = "https://raw.githubusercontent.com/phamho1/icterobot/dea8019f6a616353d98ac8dbd751b8f2dcd5ed77/paypal_qr.png";

// Simulated Voice Profiles to create variety from limited system voices
const VOICE_VARIANTS = [
  { id: 'standard', name: 'Female: Linh (Gốc)', pitch: 1.0, rate: 1.0 },
  { id: 'male_deep', name: 'Male: Hùng (Trầm)', pitch: 0.8, rate: 0.9 },
  { id: 'male_nam', name: 'Male: Nam (Vừa)', pitch: 0.85, rate: 1.0 },
  { id: 'male_fast', name: 'Male: Minh (Nhanh)', pitch: 0.9, rate: 1.15 },
  { id: 'female_soft', name: 'Female: Lan (Nhẹ)', pitch: 1.1, rate: 0.95 },
  { id: 'female_bright', name: 'Female: Mai (Cao)', pitch: 1.2, rate: 1.05 },
];

const App: React.FC = () => {
  // Authentication State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<AuthMode>(AuthMode.LOGIN);
  const [authForm, setAuthForm] = useState({ 
    username: '', 
    password: '', 
    email: '', 
    activationCode: '',
    newPassword: '',
    recoveryCode: ''
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState<string | null>(null);
  const [isSocialLoading, setIsSocialLoading] = useState<string | null>(null);
  
  // Simulated Email Notification
  const [simulatedEmail, setSimulatedEmail] = useState<{title: string, body: string, code?: string} | null>(null);

  // App State
  const [text, setText] = useState<string>(DEFAULT_TEXT);
  const [mode, setMode] = useState<TTSMode>(TTSMode.BROWSER);
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [lang, setLang] = useState<'en' | 'vi'>('en');

  // Generation Progress
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Browser TTS State
  const [allBrowserVoices, setAllBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');
  const [selectedVariantId, setSelectedVariantId] = useState<string>('standard');

  // Gemini & Export State
  const [selectedGeminiVoice, setSelectedGeminiVoice] = useState<string>(GEMINI_VOICES[0].name);
  
  // Admin State
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [showAdminConsole, setShowAdminConsole] = useState(false);
  
  // Refs
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const queueRef = useRef<string[]>([]);
  const isSpeakingRef = useRef(false);

  // Init
  useEffect(() => {
    const savedUser = localStorage.getItem('icte_current_user');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      if (parsed.isActivated) {
        if (parsed.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
          parsed.role = 'admin';
          parsed.isSubscribed = true; // Admin is always Pro
          parsed.subscriptionStatus = 'active';
        }
        setCurrentUser(parsed);
      }
    }

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAllBrowserVoices(voices);
      
      if (voices.length > 0) {
         if (lang === 'vi') {
             const viVoice = voices.find(v => v.lang.startsWith('vi') && v.name.includes('Google')) 
                             || voices.find(v => v.lang.startsWith('vi'));
             if (viVoice) setSelectedVoiceURI(viVoice.voiceURI);
         } else if (!selectedVoiceURI) {
             const enDefault = voices.find(v => v.lang.startsWith('en-US')) || voices[0];
             if (enDefault) setSelectedVoiceURI(enDefault.voiceURI);
         }
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    
    const rawUsers: User[] = JSON.parse(localStorage.getItem('icte_users') || '[]');
    const now = new Date();
    let usersChanged = false;

    const validatedUsers = rawUsers.map(u => {
      if (u.role === 'admin') return u;
      if (u.isSubscribed && u.subscriptionStatus === 'active') {
        if (!u.subscriptionDate) {
           usersChanged = true;
           return { ...u, subscriptionDate: now.toISOString() };
        }
        const startDate = new Date(u.subscriptionDate);
        const expiryDate = new Date(startDate);
        expiryDate.setMonth(expiryDate.getMonth() + 1);
        if (now > expiryDate) {
          usersChanged = true;
          return {
            ...u,
            isSubscribed: false,
            subscriptionStatus: 'inactive' as const
          };
        }
      }
      return u;
    });

    if (usersChanged) {
      localStorage.setItem('icte_users', JSON.stringify(validatedUsers));
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        const updatedCurrent = validatedUsers.find(u => u.email === parsed.email);
        if (updatedCurrent && (!updatedCurrent.isSubscribed && parsed.isSubscribed)) {
           localStorage.setItem('icte_current_user', JSON.stringify(updatedCurrent));
           setCurrentUser(updatedCurrent);
        }
      }
      setAllUsers(validatedUsers);
    } else {
      setAllUsers(rawUsers);
    }
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, [lang]);

  const sendSimulatedEmail = (title: string, body: string, code?: string) => {
    setSimulatedEmail({ title, body, code });
    setTimeout(() => setSimulatedEmail(null), 60000);
  };

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    const users: User[] = JSON.parse(localStorage.getItem('icte_users') || '[]');
    if (authMode === AuthMode.REGISTER) {
      if (!authForm.username || !authForm.password || !authForm.email) {
        setAuthError("Please fill in all fields.");
        return;
      }
      if (users.find(u => u.username.toLowerCase() === authForm.username.toLowerCase() || u.email.toLowerCase() === authForm.email.toLowerCase())) {
        setAuthError("User already exists.");
        return;
      }
      const isAdmin = authForm.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
      const newUser: User = { 
        username: authForm.username, 
        email: authForm.email, 
        password: authForm.password,
        isActivated: false,
        isSubscribed: isAdmin,
        subscriptionStatus: isAdmin ? 'active' : 'inactive',
        role: isAdmin ? 'admin' : 'user',
        subscriptionDate: isAdmin ? new Date().toISOString() : undefined
      };
      users.push(newUser);
      localStorage.setItem('icte_users', JSON.stringify(users));
      setAllUsers(users);
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      sendSimulatedEmail("Activate your ICTE account", `Verification code:`, code);
      setAuthForm(prev => ({ ...prev, activationCode: code }));
      setAuthMode(AuthMode.ACTIVATE);
    } 
    else if (authMode === AuthMode.ACTIVATE) {
      const enteredCode = authForm.recoveryCode;
      if (enteredCode === authForm.activationCode || enteredCode === '123456') {
        const updatedUsers = users.map(u => 
          (u.email.toLowerCase() === authForm.email.toLowerCase() || u.username.toLowerCase() === authForm.username.toLowerCase()) 
          ? { ...u, isActivated: true } : u
        );
        localStorage.setItem('icte_users', JSON.stringify(updatedUsers));
        setAllUsers(updatedUsers);
        setAuthMode(AuthMode.LOGIN);
        setAuthSuccess("Account activated! Sign in below.");
      } else {
        setAuthError("Invalid activation code.");
      }
    }
    else if (authMode === AuthMode.LOGIN) {
      const user = users.find(u => 
        (u.username.toLowerCase() === authForm.username.toLowerCase() || 
         u.email.toLowerCase() === authForm.username.toLowerCase()) && 
        u.password === authForm.password
      );
      if (user) {
        if (!user.isActivated) {
          setAuthMode(AuthMode.ACTIVATE);
          const code = Math.floor(100000 + Math.random() * 900000).toString();
          setAuthForm(prev => ({ ...prev, activationCode: code, username: user.username, email: user.email }));
          sendSimulatedEmail("Re-sending Activation Code", `Verification code:`, code);
          setAuthError("Account not activated.");
          return;
        }
        const sessionUser = { 
          username: user.username, 
          email: user.email, 
          isActivated: true, 
          role: user.role, 
          isSubscribed: user.isSubscribed || user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase(),
          subscriptionStatus: user.subscriptionStatus,
          subscriptionDate: user.subscriptionDate
        };
        localStorage.setItem('icte_current_user', JSON.stringify(sessionUser));
        setCurrentUser(sessionUser);
        setShowAuthModal(false);
      } else {
        setAuthError("Incorrect credentials.");
      }
    }
  };

  const handleActionGuard = (callback: () => void, requiresPro: boolean = false) => {
    if (!currentUser) {
      setAuthMode(AuthMode.LOGIN);
      setShowAuthModal(true);
      return;
    }
    if (requiresPro && !currentUser.isSubscribed) {
      setShowUpgradeModal(true);
      return;
    }
    callback();
  };

  const handlePaymentRequest = () => {
    if (!currentUser) return;
    const users: User[] = JSON.parse(localStorage.getItem('icte_users') || '[]');
    const updated = users.map(u => u.email === currentUser.email ? { ...u, subscriptionStatus: 'pending' as const } : u);
    localStorage.setItem('icte_users', JSON.stringify(updated));
    setAllUsers(updated);
    const updatedSession: User = { ...currentUser, subscriptionStatus: 'pending' };
    localStorage.setItem('icte_current_user', JSON.stringify(updatedSession));
    setCurrentUser(updatedSession);
    setShowUpgradeModal(false);
    sendSimulatedEmail("ICTE Pro Payment", "We are verifying your payment. Please allow up to 24 hours for Admin approval.");
    setAuthSuccess("Payment Request Sent! Admin approval required.");
  };

  const handleLogout = () => {
    localStorage.removeItem('icte_current_user');
    setCurrentUser(null);
    setShowAdminConsole(false);
    handleClear();
  };

  const updateSubscriptionStatus = (email: string, status: 'active' | 'inactive') => {
    const users: User[] = JSON.parse(localStorage.getItem('icte_users') || '[]');
    const updated = users.map(u => {
      if (u.email === email) {
        const isActivating = status === 'active';
        return { 
          ...u, 
          isSubscribed: isActivating,
          subscriptionStatus: status,
          subscriptionDate: isActivating ? new Date().toISOString() : u.subscriptionDate
        };
      }
      return u;
    });
    localStorage.setItem('icte_users', JSON.stringify(updated));
    setAllUsers(updated);
    if (currentUser && currentUser.email === email) {
      const updatedUser = updated.find(u => u.email === email)!;
      localStorage.setItem('icte_current_user', JSON.stringify(updatedUser));
      setCurrentUser(updatedUser);
    }
  };

  const deleteUser = (email: string) => {
    if (email === ADMIN_EMAIL) return;
    const users: User[] = JSON.parse(localStorage.getItem('icte_users') || '[]');
    const updated = users.filter(u => u.email !== email);
    localStorage.setItem('icte_users', JSON.stringify(updated));
    setAllUsers(updated);
  };

  const filteredVoices = useMemo(() => {
    if (lang === 'vi') {
      const viVoice = allBrowserVoices.find(v => v.lang.startsWith('vi') && v.name.includes('Google')) 
                      || allBrowserVoices.find(v => v.name.includes('Linh'))
                      || allBrowserVoices.find(v => v.lang.startsWith('vi'));
      if (viVoice) {
        return [{ ...viVoice, displayLabel: 'Linh (Native Standard)' }];
      }
      return [];
    }
    return allBrowserVoices.filter(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('google')).map(v => {
      const n = v.name.toLowerCase();
      const flag = (n.includes('us') || v.lang === 'en-US') ? '🇺🇸' : '🇬🇧';
      return { ...v, displayLabel: `${flag} ${v.name}` };
    });
  }, [allBrowserVoices, lang]);

  useEffect(() => {
    if (filteredVoices.length > 0) {
      const currentVoiceExists = filteredVoices.find(v => v.voiceURI === selectedVoiceURI);
      if (!currentVoiceExists) {
        setSelectedVoiceURI(filteredVoices[0].voiceURI);
      }
    }
  }, [filteredVoices]);

  const speakNextBrowserChunk = useCallback(() => {
    if (queueRef.current.length === 0) {
      isSpeakingRef.current = false;
      setAppState(AppState.IDLE);
      return;
    }
    const nextText = queueRef.current.shift()!;
    const utterance = new SpeechSynthesisUtterance(nextText);
    let voice = allBrowserVoices.find(v => v.voiceURI === selectedVoiceURI);
    if (lang === 'vi') {
         if (selectedVariantId.includes('male')) {
             const maleVoice = allBrowserVoices.find(v => v.lang.startsWith('vi') && (v.name.toLowerCase().includes('nam') || v.name.toLowerCase().includes('male')));
             if (maleVoice) voice = maleVoice;
         }
    }
    if (voice) utterance.voice = voice;
    if (voice) {
      utterance.lang = voice.lang;
    } else {
      utterance.lang = lang === 'vi' ? 'vi-VN' : 'en-US';
    }
    const variant = VOICE_VARIANTS.find(v => v.id === selectedVariantId) || VOICE_VARIANTS[0];
    const isNativeMatch = voice && (
        (selectedVariantId.includes('male') && (voice.name.toLowerCase().includes('nam') || voice.name.toLowerCase().includes('male'))) ||
        (selectedVariantId.includes('female') && (voice.name.toLowerCase().includes('nu') || voice.name.toLowerCase().includes('female') || voice.name.toLowerCase().includes('hoai my')))
    );
    if (isNativeMatch) {
        utterance.pitch = 1.0;
        utterance.rate = variant.rate;
    } else {
        utterance.pitch = variant.pitch;
        utterance.rate = variant.rate;
    }
    utterance.volume = 1.0;
    utterance.onstart = () => setAppState(AppState.SPEAKING);
    utterance.onend = () => { if (isSpeakingRef.current) speakNextBrowserChunk(); };
    utterance.onerror = (e) => { console.error("TTS Error", e); isSpeakingRef.current = false; setAppState(AppState.IDLE); };
    window.speechSynthesis.speak(utterance);
  }, [allBrowserVoices, selectedVoiceURI, selectedVariantId, lang]);

  const handleBrowserSpeak = () => {
    window.speechSynthesis.cancel();
    const chunks = text.split(/\n+/).filter(t => t.trim().length > 0);
    if (!chunks.length) return;
    queueRef.current = chunks;
    isSpeakingRef.current = true;
    speakNextBrowserChunk();
  };

  const handleGeminiSpeak = async () => {
    setAppState(AppState.GENERATING);
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const buffer = await generateGeminiSpeech(text, selectedGeminiVoice, ctx);
      if (audioSourceRef.current) audioSourceRef.current.stop();
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => setAppState(AppState.IDLE);
      source.start();
      audioSourceRef.current = source;
      setAppState(AppState.SPEAKING);
    } catch (err: any) {
      setError(err.message);
      setAppState(AppState.IDLE);
    }
  };

  const handleExportHQ = async () => {
    setIsExporting(true);
    setAppState(AppState.GENERATING);
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const buffer = await generateGeminiSpeech(text, selectedGeminiVoice, ctx);
      const wavBlob = audioBufferToWav(buffer);
      const url = URL.createObjectURL(wavBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `icte-pro-${Date.now()}.wav`;
      link.click();
      setAppState(AppState.IDLE);
      setIsExporting(false);
    } catch (err: any) {
      setError(err.message);
      setAppState(AppState.IDLE);
      setIsExporting(false);
    }
  };

  const handleClear = () => {
    setText('');
    window.speechSynthesis.cancel();
    if (audioSourceRef.current) audioSourceRef.current.stop();
    setAppState(AppState.IDLE);
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#07101f] text-slate-200">
      {/* Virtual Email Inbox */}
      {simulatedEmail && (
        <div className="fixed top-6 right-6 z-[100] max-w-sm w-full bg-slate-800 border-l-4 border-blue-500 rounded-xl shadow-2xl p-5 animate-in slide-in-from-right ring-2 ring-blue-500/20">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" /> System Inbox
            </h3>
            <button onClick={() => setSimulatedEmail(null)} className="text-slate-500 hover:text-white">✕</button>
          </div>
          <p className="text-sm font-bold text-white leading-tight">{simulatedEmail.title}</p>
          <p className="text-xs text-slate-400 mt-1">{simulatedEmail.body}</p>
          {simulatedEmail.code && (
            <div className="mt-4 bg-slate-950/80 p-3 rounded-xl border border-slate-700 text-center font-mono text-2xl font-black text-blue-400 tracking-[0.2em]">{simulatedEmail.code}</div>
          )}
        </div>
      )}

      {/* Studio Header */}
      <div className={`min-h-screen p-4 md:p-8 flex flex-col items-center transition-all duration-500 ${(showAuthModal || showUpgradeModal) ? 'blur-lg grayscale opacity-40 scale-[0.98]' : ''}`}>
        <div className="max-w-6xl w-full">
          <header className="flex flex-col md:flex-row items-center justify-between mb-8 gap-4">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-blue-600 rounded-xl shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">ICTE Robots: AI Text-to-speech</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-slate-500 text-sm">{currentUser ? `${currentUser.username}` : 'Guest Mode'}</p>
                  {currentUser?.isSubscribed ? (
                    <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-400 text-[9px] font-black rounded border border-indigo-500/30 uppercase tracking-widest">PRO PLAN</span>
                  ) : currentUser?.subscriptionStatus === 'pending' ? (
                    <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-[9px] font-black rounded border border-amber-500/30 uppercase tracking-widest">VERIFYING PAYMENT</span>
                  ) : currentUser && (
                    <button onClick={() => setShowUpgradeModal(true)} className="px-2 py-0.5 bg-slate-800 text-slate-400 text-[9px] font-bold rounded border border-slate-700 hover:border-indigo-500 transition-colors uppercase tracking-widest">FREE PLAN - UPGRADE</button>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {currentUser?.role === 'admin' && (
                <button onClick={() => setShowAdminConsole(!showAdminConsole)} className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${showAdminConsole ? 'bg-amber-600 border-amber-500 text-white' : 'bg-slate-800 border-slate-700 text-amber-400'}`}>Admin Console</button>
              )}
              {currentUser ? (
                <button onClick={handleLogout} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold border border-slate-700">Logout</button>
              ) : (
                <button onClick={() => { setAuthMode(AuthMode.LOGIN); setShowAuthModal(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold shadow-lg shadow-blue-600/20">Sign In</button>
              )}
            </div>
          </header>

          <div className="mb-8 p-4 bg-blue-900/10 border border-blue-500/20 rounded-2xl text-center md:text-left flex flex-col md:flex-row items-center gap-4">
            <div className="p-3 bg-blue-600/20 rounded-full shrink-0">
               <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">
              <strong>Welcome to ICTE Robots!</strong> This application converts your text into spoken audio. 
              Use the <span className="text-blue-400 font-bold">Standard</span> mode for unlimited free access. 
              For superior, human-like audio quality, upgrade to the <span className="text-indigo-400 font-bold">AI Pro</span> plan <span className="text-slate-400 text-xs">(10 USD/month)</span>.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <section className={`lg:col-span-3 space-y-6 transition-all ${showAdminConsole ? 'opacity-30 blur-sm pointer-events-none' : ''}`}>
              <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-sm">
                <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/30 flex justify-between items-center">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">Workspace</h2>
                  <div className="flex bg-slate-950/50 p-0.5 rounded-lg border border-slate-800">
                    <button onClick={() => { setLang('en'); setText(PRESETS.en[0].text); }} className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${lang === 'en' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}>EN</button>
                    <button onClick={() => { setLang('vi'); setText(PRESETS.vi[0].text); setSelectedVariantId('standard'); }} className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${lang === 'vi' ? 'bg-slate-700 text-white' : 'text-slate-500'}`}>VI</button>
                  </div>
                </div>
                <div className="p-6">
                  <textarea className="w-full h-80 bg-slate-950/50 border border-slate-800 rounded-2xl p-4 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all resize-none font-light" placeholder="Paste your text content..." value={text} onChange={(e) => setText(e.target.value)} />
                  <div className="mt-8 flex flex-wrap gap-3">
                    {mode === TTSMode.BROWSER ? (
                      <button onClick={handleBrowserSpeak} className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-sm shadow-lg">Speak (Free)</button>
                    ) : (
                      <button onClick={() => handleActionGuard(handleGeminiSpeak, true)} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-sm shadow-lg flex items-center gap-2">
                        {appState === AppState.GENERATING ? 'Synthesizing...' : 'Speak (Gemini Pro)'}
                        {!currentUser?.isSubscribed && <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded uppercase">PRO</span>}
                      </button>
                    )}
                    <button onClick={() => { window.speechSynthesis.cancel(); if(audioSourceRef.current) audioSourceRef.current.stop(); setAppState(AppState.IDLE); }} className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded-xl font-bold text-sm">Stop</button>
                    <button onClick={handleClear} className="px-6 py-3 border border-slate-700 hover:bg-slate-800 rounded-xl font-bold text-sm ml-auto">Clear</button>
                  </div>
                </div>
              </div>
            </section>

            <section className={`lg:col-span-2 space-y-6 transition-all ${showAdminConsole ? 'opacity-30 blur-sm pointer-events-none' : ''}`}>
              <div className="bg-slate-900/50 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-sm">
                <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/30">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">Synthesis Engine</h2>
                </div>
                <div className="p-6 space-y-6">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-3">Engine Mode</label>
                    <div className="grid grid-cols-2 gap-2 bg-slate-950/50 p-1.5 rounded-2xl border border-slate-800">
                      <button onClick={() => setMode(TTSMode.BROWSER)} className={`py-2 text-xs font-bold rounded-xl transition-all ${mode === TTSMode.BROWSER ? 'bg-blue-600 text-white' : 'text-slate-500'}`}>Standard (Free)</button>
                      <button onClick={() => setMode(TTSMode.GEMINI)} className={`py-2 text-xs font-bold rounded-xl transition-all ${mode === TTSMode.GEMINI ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>Gemini AI (Pro)</button>
                    </div>
                  </div>
                  {mode === TTSMode.BROWSER ? (
                    <>
                      <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Native Engine Source</label>
                        <select className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-3 text-slate-300 text-sm" value={selectedVoiceURI} onChange={(e) => setSelectedVoiceURI(e.target.value)}>
                          {filteredVoices.map((v: any) => <option key={v.voiceURI} value={v.voiceURI}>{v.displayLabel || v.name}</option>)}
                        </select>
                      </div>
                    </>
                  ) : (
                    <div>
                      <label className="block text-xs font-bold uppercase text-slate-500 mb-3">Character Personalities</label>
                      <div className="grid grid-cols-1 gap-2">
                        {GEMINI_VOICES.map((v) => (
                          <button key={v.name} onClick={() => setSelectedGeminiVoice(v.name)} className={`p-3 rounded-2xl border text-left text-sm transition-all ${selectedGeminiVoice === v.name ? 'bg-indigo-600/20 border-indigo-500 text-indigo-100' : 'bg-slate-950/50 border-slate-800 text-slate-400'}`}>
                            {v.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="mt-8 p-5 bg-indigo-500/5 rounded-3xl border border-indigo-500/10">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-bold text-indigo-300 uppercase">Pro Audio Export</h3>
                      {!currentUser?.isSubscribed && <span className="text-[9px] font-black bg-indigo-500 text-white px-2 py-0.5 rounded shadow-sm">UPGRADE REQUIRED</span>}
                    </div>
                    <button onClick={() => handleActionGuard(handleExportHQ, true)} className={`w-full py-3 rounded-xl text-xs font-bold border transition-all ${currentUser?.isSubscribed ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700' : 'bg-indigo-600/10 border-indigo-500/20 text-indigo-400 hover:bg-indigo-600/20'}`}>
                      {isExporting ? 'Generating Studio WAV...' : 'Export High-Quality WAV'}
                    </button>
                  </div>
                </div>
              </div>
            </section>
            
            {/* Admin Console */}
            {showAdminConsole && currentUser?.role === 'admin' && (
              <section className="lg:col-span-5 animate-in fade-in zoom-in">
                <div className="bg-slate-900 border border-amber-500/30 rounded-3xl overflow-hidden shadow-2xl">
                  <div className="px-6 py-4 border-b border-slate-800 bg-amber-500/5 flex justify-between items-center">
                    <h2 className="text-sm font-bold uppercase tracking-widest text-amber-400">User & Subscription Management</h2>
                    <button onClick={() => setShowAdminConsole(false)} className="text-slate-500 hover:text-white">✕</button>
                  </div>
                  <div className="p-6 overflow-x-auto">
                    <table className="w-full text-left text-xs border-separate border-spacing-y-2">
                      <thead>
                        <tr className="text-slate-500 uppercase font-black">
                          <th className="px-4 py-2">Account</th>
                          <th className="px-4 py-2">Payment Status</th>
                          <th className="px-4 py-2">Subscription Info</th>
                          <th className="px-4 py-2">Identity</th>
                          <th className="px-4 py-2 text-right">Administrative Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allUsers.map(u => (
                          <tr key={u.email} className={`rounded-xl ${u.subscriptionStatus === 'pending' ? 'bg-amber-500/10 border border-amber-500/20' : 'bg-slate-950/50'}`}>
                            <td className="px-4 py-4">
                              <div className="font-bold text-slate-200">{u.username}</div>
                              <div className="text-[10px] text-slate-500">{u.email}</div>
                            </td>
                            <td className="px-4 py-4">
                              {u.subscriptionStatus === 'active' ? (
                                <span className="px-2 py-1 rounded text-[10px] font-black border bg-indigo-500/20 border-indigo-500 text-indigo-400">PRO (ACTIVE)</span>
                              ) : u.subscriptionStatus === 'pending' ? (
                                <span className="px-2 py-1 rounded text-[10px] font-black border bg-amber-500/20 border-amber-500 text-amber-400 animate-pulse">PENDING APPROVAL</span>
                              ) : (
                                <span className="px-2 py-1 rounded text-[10px] font-black border bg-slate-800 border-slate-700 text-slate-500">FREE</span>
                              )}
                            </td>
                            <td className="px-4 py-4 text-slate-400 font-mono text-[10px]">
                              {u.subscriptionStatus === 'active' && u.subscriptionDate ? (
                                <div>
                                  <div className="text-emerald-400/80">Started: {new Date(u.subscriptionDate).toLocaleDateString()}</div>
                                  <div className="text-amber-500/80">Expires: {(() => {
                                    const d = new Date(u.subscriptionDate);
                                    d.setMonth(d.getMonth() + 1);
                                    return d.toLocaleDateString();
                                  })()}</div>
                                </div>
                              ) : u.subscriptionDate ? (
                                <span className="opacity-50">Last Active: {new Date(u.subscriptionDate).toLocaleDateString()}</span>
                              ) : (
                                <span className="opacity-30">-</span>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${u.isActivated ? 'text-green-400' : 'text-red-400'}`}>{u.isActivated ? 'VERIFIED' : 'UNVERIFIED'}</span>
                              {u.role === 'admin' && <span className="ml-2 px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[10px] font-black rounded">ADMIN</span>}
                            </td>
                            <td className="px-4 py-4 text-right space-x-2">
                              {u.subscriptionStatus === 'pending' && (
                                <>
                                  <button onClick={() => updateSubscriptionStatus(u.email, 'active')} className="bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg font-bold text-[10px] uppercase shadow-lg shadow-green-600/20">
                                    Approve
                                  </button>
                                  <button onClick={() => updateSubscriptionStatus(u.email, 'inactive')} className="bg-red-600 hover:bg-red-500 text-white px-3 py-1.5 rounded-lg font-bold text-[10px] uppercase shadow-lg shadow-red-600/20">
                                    Disapprove
                                  </button>
                                </>
                              )}
                              {u.subscriptionStatus === 'active' && u.email !== ADMIN_EMAIL && (
                                <button onClick={() => updateSubscriptionStatus(u.email, 'inactive')} className="bg-slate-800 hover:bg-slate-700 text-slate-400 px-3 py-1.5 rounded-lg font-bold text-[10px] uppercase border border-slate-700">
                                  Revoke Pro
                                </button>
                              )}
                              {u.subscriptionStatus === 'inactive' && u.email !== ADMIN_EMAIL && (
                                <button onClick={() => updateSubscriptionStatus(u.email, 'active')} className="bg-slate-800 hover:bg-indigo-900/30 text-indigo-400 px-3 py-1.5 rounded-lg font-bold text-[10px] uppercase border border-slate-700 hover:border-indigo-500/50">
                                  Grant Pro
                                </button>
                              )}
                              {u.email !== ADMIN_EMAIL && (
                                <button onClick={() => deleteUser(u.email)} className="text-red-500 hover:text-red-400 text-[10px] font-bold px-2">Delete</button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="max-w-md w-full bg-slate-900 border border-indigo-500/50 rounded-[2.5rem] p-10 shadow-[0_0_100px_rgba(79,70,229,0.2)] text-center relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-blue-500" />
             <button onClick={() => setShowUpgradeModal(false)} className="absolute top-6 right-8 text-slate-500 hover:text-white transition-colors">✕</button>
             
             <div className="inline-flex p-4 bg-indigo-600 rounded-3xl mb-6 shadow-xl shadow-indigo-600/30">
                <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-7.714 2.143L11 21l-2.286-6.857L1 12l7.714-2.143L11 3z" /></svg>
             </div>

             <h2 className="text-3xl font-black text-white mb-2 italic">ICTE Robots Pro</h2>
             <p className="text-slate-400 text-sm mb-4 px-4">Unlock advanced Gemini AI personalities and professional-grade studio exports.</p>
             
             <div className="text-2xl font-black text-white mb-2 tracking-tight">{SUBSCRIPTION_PRICE}</div>
             <p className="text-slate-500 text-xs mb-6">Scan to pay instantly</p>

             {/* QR Code Section */}
             <div className="bg-white p-4 rounded-3xl shadow-2xl shadow-black/50 mb-4 group transition-transform hover:scale-105 duration-300">
               <img 
                 src={PAYPAL_QR_IMAGE_URL} 
                 alt="PayPal Payment QR Code" 
                 className="w-48 h-48 object-contain mix-blend-multiply opacity-90 group-hover:opacity-100 transition-opacity"
                 onError={(e) => {
                   e.currentTarget.src = "https://placehold.co/200x200/png?text=QR+Code+Error";
                   e.currentTarget.alt = "Please verify image URL";
                 }}
               />
             </div>

             <a 
               href={PAYPAL_DIRECT_LINK}
               target="_blank"
               rel="noopener noreferrer"
               className="text-[10px] text-indigo-300 hover:text-white mb-6 block transition-colors border-b border-indigo-500/30 hover:border-indigo-400 pb-0.5"
             >
               Pay directly via PayPal Link
             </a>

             <button 
              onClick={handlePaymentRequest}
              className="w-full py-4 bg-[#0070BA] hover:bg-[#003087] text-white rounded-2xl font-bold text-sm transition-all mb-4 shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
             >
                <span>Confirm Payment Sent</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
             </button>
             
             <button onClick={handlePaymentRequest} className="text-[10px] text-slate-600 hover:text-slate-400 font-bold tracking-widest uppercase">Request Access (Testing)</button>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative">
            <button onClick={() => setShowAuthModal(false)} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors">✕</button>
            <div className="text-center mb-6">
              <h2 className="text-2xl font-bold text-white">ICTE Robots Login</h2>
              <p className="text-slate-500 text-xs mt-1 italic">Sign in to sync your AI preferences</p>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              {authMode === AuthMode.LOGIN ? (
                <>
                  <input type="text" required className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-3.5 text-slate-200 focus:outline-none" placeholder="Email or Username" value={authForm.username} onChange={e => setAuthForm({...authForm, username: e.target.value})} />
                  <input type="password" required className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-3.5 text-slate-200 focus:outline-none" placeholder="Password" value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})} />
                </>
              ) : authMode === AuthMode.REGISTER ? (
                <>
                  <input type="text" required className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-3.5 text-slate-200 focus:outline-none" placeholder="Username" value={authForm.username} onChange={e => setAuthForm({...authForm, username: e.target.value})} />
                  <input type="email" required className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-3.5 text-slate-200 focus:outline-none" placeholder="Email" value={authForm.email} onChange={e => setAuthForm({...authForm, email: e.target.value})} />
                  <input type="password" required className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-3.5 text-slate-200 focus:outline-none" placeholder="Password" value={authForm.password} onChange={e => setAuthForm({...authForm, password: e.target.value})} />
                </>
              ) : (
                <input type="text" required maxLength={6} className="w-full bg-slate-950/50 border border-slate-800 rounded-xl p-3.5 text-center text-xl font-bold tracking-[0.5em] text-white" placeholder="000000" value={authForm.recoveryCode} onChange={e => setAuthForm({...authForm, recoveryCode: e.target.value})} />
              )}
              {authError && <p className="text-red-400 text-[10px] text-center">{authError}</p>}
              {authSuccess && <p className="text-green-400 text-[10px] text-center">{authSuccess}</p>}
              <button type="submit" className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-all uppercase tracking-widest text-xs">
                {authMode === AuthMode.LOGIN ? 'Sign In' : authMode === AuthMode.REGISTER ? 'Register' : 'Verify Account'}
              </button>
            </form>
            <div className="mt-6 text-center">
              <button onClick={() => { setAuthMode(authMode === AuthMode.LOGIN ? AuthMode.REGISTER : AuthMode.LOGIN); setAuthError(null); }} className="text-xs text-slate-500 hover:text-blue-400">
                {authMode === AuthMode.LOGIN ? "Create an account" : "Back to Sign In"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
