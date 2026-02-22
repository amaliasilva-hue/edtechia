'use client';

/**
 * CloudDojo — Logo System
 * 
 * Mark: Cloud silhouette with a torii-gate portal inside, rendered in
 *       an indigo→cyan gradient with an amber accent highlight.
 * Wordmark: "Cloud" (white, semibold) + "Dojo" (amber gradient, bold).
 * 
 * Usage:
 *   <CloudDojoLogo />               — icon + wordmark (default)
 *   <CloudDojoLogo iconOnly />      — just the icon badge
 *   <CloudDojoLogo size="lg" />     — lg | md (default) | sm
 */

type LogoProps = {
  iconOnly?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizes = {
  sm: { badge: 28, font: 'text-base',  gap: 'gap-2' },
  md: { badge: 40, font: 'text-xl',    gap: 'gap-2.5' },
  lg: { badge: 56, font: 'text-3xl',   gap: 'gap-3' },
};

export default function CloudDojoLogo({ iconOnly = false, size = 'md', className = '' }: LogoProps) {
  const { badge, font, gap } = sizes[size];

  return (
    <div className={`inline-flex items-center ${gap} ${className}`}>
      {/* ── Icon badge ───────────────────────────────────── */}
      <svg
        width={badge}
        height={badge}
        viewBox="0 0 56 56"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-label="CloudDojo icon"
      >
        <defs>
          {/* Badge background gradient */}
          <linearGradient id="cdBg" x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#312e81" />
            <stop offset="100%" stopColor="#1e3a5f" />
          </linearGradient>
          {/* Cloud gradient */}
          <linearGradient id="cdCloud" x1="0" y1="0" x2="56" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#a5b4fc" />
            <stop offset="100%" stopColor="#67e8f9" />
          </linearGradient>
          {/* Gate amber gradient */}
          <linearGradient id="cdGate" x1="14" y1="26" x2="42" y2="46" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
          {/* Glow filter */}
          <filter id="cdGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* Rounded badge background */}
        <rect width="56" height="56" rx="14" fill="url(#cdBg)" />

        {/* Subtle inner border glow */}
        <rect width="56" height="56" rx="14" fill="none" stroke="#6366f1" strokeWidth="1" strokeOpacity="0.4" />

        {/* ── Cloud shape ─────────────────────────────────── */}
        {/* Main cloud body — drawn as a single path for crispness */}
        <path
          d="M38 34H19c-3.3 0-6-2.7-6-6 0-2.9 2-5.3 4.8-5.9C18.5 19.1 21 17 24 17c2.5 0 4.7 1.4 5.8 3.5C30.5 20.2 31.2 20 32 20c3.3 0 6 2.7 6 6v0.1C40.2 26.6 42 28.6 42 31c0 1.7-1.3 3-3 3h-1z"
          fill="url(#cdCloud)"
          opacity="0.95"
        />

        {/* ── Torii gate (portal) inside cloud ────────────── */}
        {/* Top horizontal bar (kasagi) */}
        <rect x="17" y="29" width="22" height="2.8" rx="1.4" fill="url(#cdGate)" filter="url(#cdGlow)" />
        {/* Second horizontal bar (nuki) */}
        <rect x="19.5" y="33.5" width="17" height="2" rx="1" fill="url(#cdGate)" opacity="0.85" />
        {/* Left pillar */}
        <rect x="19.5" y="29" width="2.5" height="9" rx="1.25" fill="url(#cdGate)" opacity="0.9" />
        {/* Right pillar */}
        <rect x="34" y="29" width="2.5" height="9" rx="1.25" fill="url(#cdGate)" opacity="0.9" />

        {/* Sparkle / star hint on top-right of cloud */}
        <circle cx="38" cy="19" r="1.8" fill="#c7d2fe" opacity="0.6" />
        <circle cx="42" cy="23" r="1.2" fill="#a5f3fc" opacity="0.5" />
      </svg>

      {/* ── Wordmark ─────────────────────────────────────── */}
      {!iconOnly && (
        <span className={`${font} font-bold tracking-tight leading-none select-none`}>
          <span className="text-white">Cloud</span>
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: 'linear-gradient(135deg, #fbbf24 0%, #f97316 100%)' }}
          >
            Dojo
          </span>
        </span>
      )}
    </div>
  );
}
