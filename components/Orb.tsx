export type OrbState = "idle" | "thinking" | "speaking" | "listening";

/** Núcleo tipo "arc reactor" animado. */
export function Orb({ state = "idle", size = 220 }: { state?: OrbState; size?: number }) {
  return (
    <div className={`orb orb--${state}`} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 200 200" className="orb__svg">
        <defs>
          <radialGradient id="orbCore" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="35%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g className="orb__ring orb__ring--outer">
          <circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 6" />
        </g>
        <g className="orb__ring orb__ring--a">
          <circle cx="100" cy="100" r="80" fill="none" stroke="currentColor" strokeWidth="3"
            strokeDasharray="120 40 30 40 60 212" strokeLinecap="round" />
        </g>
        <g className="orb__ring orb__ring--b">
          <circle cx="100" cy="100" r="66" fill="none" stroke="currentColor" strokeWidth="1.5"
            strokeDasharray="8 4" opacity="0.7" />
        </g>
        <g className="orb__ring orb__ring--c">
          <circle cx="100" cy="100" r="54" fill="none" stroke="currentColor" strokeWidth="6"
            strokeDasharray="40 30" opacity="0.55" />
        </g>
        <circle cx="100" cy="100" r="42" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.8" />
        <circle className="orb__core" cx="100" cy="100" r="34" fill="url(#orbCore)" />
      </svg>
      <div className="orb__glow" />
    </div>
  );
}
