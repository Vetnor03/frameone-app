type AppLanguage = 'en' | 'no'

export default function SensitiveInformationHelper({ language }: { language: AppLanguage }) {
  return (
    <p className="mt-1.5 text-[11px] leading-4 text-[color:var(--fg-55)]">
      {language === 'no'
        ? 'Ikke legg inn passord, betalingsinformasjon, fødselsnummer, helseopplysninger eller annen sensitiv eller konfidensiell informasjon.'
        : 'Do not enter passwords, payment information, national identification numbers, health information, or other sensitive or confidential information.'}
    </p>
  )
}
