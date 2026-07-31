type AppLanguage = 'en' | 'no'

export default function SensitiveInformationHelper({ language, card = false }: { language: AppLanguage; card?: boolean }) {
  const description = language === 'no'
    ? 'Ikke legg inn passord, betalingsinformasjon, fødselsnummer, helseopplysninger eller annen sensitiv eller konfidensiell informasjon.'
    : card
      ? 'For your security and privacy, don’t share passwords, payment details, national ID numbers, health information, or other sensitive or confidential information.'
      : 'Do not enter passwords, payment information, national identification numbers, health information, or other sensitive or confidential information.'

  if (card) {
    return (
      <aside
        aria-label={language === 'no' ? 'Personverninformasjon' : 'Privacy information'}
        className="mt-2.5 flex items-center gap-3 rounded-2xl border border-[#6689a6]/25 bg-[#17344b]/55 px-3 py-2.5"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#168fe8]/20 text-[#53b4ff]" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" className="size-[18px]" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3 5.5 5.8v5.4c0 4.4 2.7 7.9 6.5 9.8 3.8-1.9 6.5-5.4 6.5-9.8V5.8L12 3Z" />
            <path d="m9.4 12.1 1.7 1.7 3.7-4" />
          </svg>
        </span>
        <div className="min-w-0">
          <h2 className="text-xs font-semibold leading-4 text-[color:var(--fg-95)]">
            {language === 'no' ? 'Ta vare på informasjonen din' : 'Keep your information safe'}
          </h2>
          <p className="mt-0.5 text-[10px] leading-[15px] text-[color:var(--fg-60)] sm:text-[11px] sm:leading-4">
            {description}
          </p>
        </div>
      </aside>
    )
  }

  return (
    <p className="mt-1.5 text-[11px] leading-4 text-[color:var(--fg-55)]">
      {description}
    </p>
  )
}
