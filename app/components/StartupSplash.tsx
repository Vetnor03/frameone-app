// Shared RE:MIND monoline wordmark for sustained in-app startup only.
// Native iOS startup artwork is intentionally disabled to prevent brief flashes.
export function StartupWordmark() {
  return (
    <div className="remind-splash-reveal">
      <div className="remind-splash text-[color:var(--fg)]">
        <svg className="remind-splash-logo" viewBox="0 0 300 60" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M0 60V0H17C37 0 38 31 17 31H0" />
          <path d="M17 31L34 60" />
          <path d="M76 0H46V60H76 M46 30H73" />
          <circle cx="99" cy="21" r="2.4" fill="currentColor" stroke="none" />
          <circle cx="99" cy="43" r="2.4" fill="currentColor" stroke="none" />
          <path d="M123 60V0L145 33L167 0V60" />
          <path d="M184 0V60" />
          <path d="M205 60V0L245 60V0" />
          <path d="M261 0V60H275C293 60 300 47 300 30C300 13 293 0 275 0H261" />
        </svg>
      </div>
    </div>
  )
}

// Both the Next server fallback and authenticated boot render the same image.
export function StartupSplash({ language = 'en' }: { language?: 'en' | 'no' }) {
  return (
    <div className="flex-1 flex items-center justify-center" role="status" aria-live="polite" aria-label={language === 'no' ? 'Laster RE:MIND' : 'Loading RE:MIND'}>
      <StartupWordmark />
    </div>
  )
}

export function StartupSplashScreen() {
  return <main className="remind-app flex min-h-[100dvh] items-center justify-center text-[color:var(--fg)]" style={{ background:'var(--app-bg)' }}>
    <StartupSplash />
  </main>
}
