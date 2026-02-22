'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import CloudDojoLogo from '@/components/CloudDojoLogo';
import ThemeToggle from '@/components/ThemeToggle';

const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5">
        <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm.75 4.25a.75.75 0 00-1.5 0v4.5l-2.47 2.47a.75.75 0 101.06 1.06l2.72-2.72a.75.75 0 00.19-.49V6.25z" />
      </svg>
    ),
    text: 'Gemini 2.5 Pro — real scenario-based questions',
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5">
        <path d="M2 4.5A2.5 2.5 0 014.5 2h11A2.5 2.5 0 0118 4.5v11a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 012 15.5v-11zM4.5 4a.5.5 0 00-.5.5V6h12V4.5a.5.5 0 00-.5-.5h-11zM4 8v7.5a.5.5 0 00.5.5h11a.5.5 0 00.5-.5V8H4z" />
      </svg>
    ),
    text: 'RAG over official GCP & Workspace exam guides',
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-amber-400 shrink-0 mt-0.5">
        <path fillRule="evenodd" d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm9-4a1 1 0 10-2 0v4.586L7.707 12.88a1 1 0 101.414 1.414L11 12.414V6a1 1 0 00-1 0V6z" clipRule="evenodd" />
      </svg>
    ),
    text: 'Performance analytics & weak-topic insights',
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5">
        <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" />
      </svg>
    ),
    text: 'RLHF feedback loop — every answer improves the model',
  },
];

export default function LoginPage() {
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    await signIn('google', { callbackUrl: '/dashboard' });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4"
      style={{
        backgroundImage: 'radial-gradient(ellipse 80% 60% at 50% -10%, hsl(var(--primary) / 0.12) 0%, transparent 70%)',
      }}
    >
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="p-8 rounded-2xl border border-white/8 bg-card shadow-2xl
                        ring-1 ring-indigo-500/10 backdrop-blur-sm">

          {/* ── Brand ────────────────────────────────────── */}
          <div className="flex flex-col items-center mb-8 gap-4">
            <CloudDojoLogo size="lg" />
            <p className="text-muted-foreground text-sm text-center leading-snug">
              AI-powered training for<br />
              <span className="text-indigo-300 font-medium">GCP &amp; Google Workspace</span> certifications
            </p>
          </div>

          {/* ── Features ─────────────────────────────────── */}
          <ul className="space-y-3 mb-8">
            {FEATURES.map(({ icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                {icon}
                <span className="text-sm text-muted-foreground">{text}</span>
              </li>
            ))}
          </ul>

          {/* ── Divider ──────────────────────────────────── */}
          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card px-3 text-xs text-muted-foreground">Sign in to start training</span>
            </div>
          </div>

          {/* ── Google login button ───────────────────────── */}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl
                       bg-white text-gray-800 font-semibold text-sm
                       hover:bg-gray-50 active:scale-[0.98] transition-all duration-150
                       disabled:opacity-60 disabled:cursor-not-allowed
                       shadow-lg shadow-black/20"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 100 16v-4l-3 3 3 3v-4a8 8 0 01-8-8z"/>
                </svg>
                Redirecting…
              </span>
            ) : 'Continue with Google'}
          </button>

          <p className="text-center text-xs text-muted-foreground mt-5 leading-relaxed">
            Sign in with your Google account.<br />
            No passwords stored — ever.
          </p>
        </div>

        {/* Footer tag */}
        <p className="text-center text-xs text-muted-foreground/40 mt-6">
          Powered by Gemini · Vertex AI · BigQuery
        </p>
        <div className="flex justify-center mt-3">
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
