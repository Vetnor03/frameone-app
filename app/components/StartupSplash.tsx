// Server-renderable fallback for Next.js streaming and the initial client boot.
// Reuses the exact RE:MIND wordmark animation used by the normal app splash.
export function StartupSplash({ language = 'en' }: { language?: 'en' | 'no' }) {
  return (
    <div className="flex-1 flex items-center justify-center" role="status" aria-live="polite" aria-label={language === 'no' ? 'Laster RE:MIND' : 'Loading RE:MIND'}>
      <div className="remind-splash text-[color:var(--fg)]">
        <svg className="remind-splash-logo" viewBox="-29 0 400 100" aria-hidden="true">
          <defs>
            <clipPath id="remind-e-reveal">
              <rect className="remind-logo-e-clip" x="72" y="12" width="58" height="76" />
            </clipPath>
            <clipPath id="remind-mind-reveal">
              <rect className="remind-logo-mind-clip" x="166" y="12" width="218" height="76" />
            </clipPath>
          </defs>
          <g className="remind-logo-wordmark">
            <text className="remind-logo-letter remind-logo-r" x="18" y="72">R</text>
            <text className="remind-logo-letter remind-logo-e" x="76" y="72" clipPath="url(#remind-e-reveal)">E</text>
            <g className="remind-logo-colon">
              <circle cx="0" cy="39" r="3.25" />
              <circle cx="0" cy="62" r="3.25" />
            </g>
            <text className="remind-logo-letter remind-logo-mind" x="174" y="72" clipPath="url(#remind-mind-reveal)">MIND</text>
          </g>
        </svg>
      </div>
    </div>
  )
}

export function StartupSplashScreen() {
  return <main className="remind-app flex min-h-[100dvh] items-center justify-center text-[color:var(--fg)]" style={{ background:'var(--app-bg)' }}>
    <StartupSplash />
  </main>
}
