type AppLanguage = 'en' | 'no'

export default function SensitiveInformationHelper({ language }: { language: AppLanguage }) {
  const description = language === 'no'
    ? 'Av hensyn til sikkerheten og personvernet ditt bør du ikke dele passord, betalingsopplysninger, fødselsnummer, helseopplysninger eller annen sensitiv eller fortrolig informasjon.'
    : 'For your security and privacy, don’t share passwords, payment details, national ID numbers, health information, or other sensitive or confidential information.'

  return (
    <aside
      aria-label={language === 'no' ? 'Personverninformasjon' : 'Privacy information'}
      className="mt-3 flex items-start gap-3 rounded-2xl border border-[#2aa3ff]/15 bg-[#2aa3ff]/[0.07] px-3.5 py-3 max-[340px]:gap-2 max-[340px]:px-3"
    >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-[#2aa3ff]/35 text-[#2aa3ff]" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" className="size-[18px]" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3 5.5 5.8v5.4c0 4.4 2.7 7.9 6.5 9.8 3.8-1.9 6.5-5.4 6.5-9.8V5.8L12 3Z" />
            <path d="m9.4 12.1 1.7 1.7 3.7-4" />
          </svg>
        </span>
        <div className="min-w-0">
          <h2 className="text-xs font-semibold leading-4 text-[color:var(--fg-95)]">
            {language === 'no' ? 'Ta vare på opplysningene dine' : 'Keep your information safe'}
          </h2>
          <p className="mt-0.5 text-[11px] leading-4 text-[color:var(--fg-65)]">
            {description}
          </p>
        </div>
    </aside>
  )
}
