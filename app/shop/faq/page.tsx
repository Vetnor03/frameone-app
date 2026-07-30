import type { Metadata } from 'next'
import ShopLegalPage from '../../components/ShopLegalPage'
import { shopMetadata } from '../seo'
import { formatNok, pickShopLocale } from '../productData'

export const metadata: Metadata = shopMetadata({
  title: 'FAQ | RE:MIND',
  description: 'Answers to common questions about the RE:MIND display.',
  path: '/shop/faq',
})

const detailLinkClass = 'shop-footer-link font-medium text-black/80 underline decoration-black/25 underline-offset-4 hover:text-black'

export default async function FaqPage({ searchParams }: { searchParams?: Promise<{ lang?: string }> }) {
  const language = pickShopLocale((await searchParams)?.lang)
  const isNorwegian = language === 'no'
  const localizedHref = (href: string) => isNorwegian ? `${href}?lang=no` : href

  return (
    <ShopLegalPage
      backHref={localizedHref('/shop')}
      backLabel={isNorwegian ? 'TILBAKE TIL FORSIDEN' : 'Back to home'}
      title={isNorwegian ? 'Ofte stilte spørsmål' : 'Frequently asked questions'}
      updatedText={isNorwegian ? 'Her finner du nyttig informasjon før RE:MIND kommer hjem til deg.' : 'A few helpful details before your RE:MIND arrives.'}
      sections={[
        {
          title: isNorwegian ? 'Hva er RE:MIND?' : 'What is RE:MIND?',
          text: isNorwegian ? 'RE:MIND er en diskret e-papirskjerm som samler det viktigste fra hverdagen på ett sted – som påminnelser, vær, arrangementer og oppdateringer fra tjenester du bruker. Informasjonen er alltid synlig, uten enda en lysende skjerm som krever oppmerksomheten din.' : 'RE:MIND is a low-power e-paper display for useful everyday information such as reminders, weather, events and other connected updates. It keeps what matters in view without behaving like a normal glowing screen.',
        },
        {
          title: isNorwegian ? 'Hva følger med RE:MIND?' : 'What comes with RE:MIND?',
          text: isNorwegian ? `En komplett RE:MIND koster fra ${formatNok(2299, language)} og inkluderer RE:MIND-enheten, én valgfri ramme, ett valgfritt innlegg, ladekabel og oppstartsveiledning. Enkelte premiumvalg kan øke totalprisen, og flere rammer og innlegg kan kjøpes separat senere.` : `A complete RE:MIND starts at ${formatNok(2299, language)} and includes the RE:MIND display, one selected frame, one selected matte, a charging cable and a setup guide. Premium frame or matte choices may add to the total, and additional styles can be purchased separately later.`,
        },
        {
          title: isNorwegian ? 'Hvordan setter jeg den opp?' : 'How do I set it up?',
          text: isNorwegian ? 'Under oppsettet kobler du RE:MIND til Wi-Fi og parer den med RE:MIND-appen. Appen veileder deg gjennom oppstarten og de enkle valgene underveis.' : 'During setup, connect RE:MIND to Wi-Fi and pair it with the RE:MIND app. The app guides you through choosing what appears on the display.',
        },
        {
          title: isNorwegian ? 'Trenger RE:MIND Wi-Fi?' : 'Does RE:MIND need Wi-Fi?',
          text: isNorwegian ? 'RE:MIND bruker Wi-Fi for å motta oppdatert informasjon. Bildet på e-papirskjermen forblir synlig uten kontinuerlig strømtilførsel, så den fungerer ikke som en vanlig lysende skjerm.' : 'RE:MIND uses Wi-Fi to receive updated information. Its e-paper image remains visible without continuous power, so it does not behave like a normal glowing screen.',
        },
        {
          title: isNorwegian ? 'Hvor ofte oppdateres den?' : 'How often does it update?',
          text: isNorwegian ? 'RE:MIND oppdateres med jevne mellomrom, avhengig av hva som vises og hvordan produktet er konfigurert.' : 'RE:MIND updates periodically based on the information being displayed and how the product is configured.',
        },
        {
          title: isNorwegian ? 'Trenger jeg appen?' : 'Do I need the app?',
          text: isNorwegian ? 'RE:MIND-appen brukes til å sette opp og administrere enheten, velge hva som vises og konfigurere tilkoblede funksjoner. Etter oppsettet trenger du ikke å ha appen åpen eller bruke den hele tiden.' : 'The RE:MIND app is used to set up and manage the display, choose what appears on it and configure connected features. You do not need to keep the app open or constantly use it after setup.',
        },
        {
          title: isNorwegian ? 'Kan flere bruke samme RE:MIND?' : 'Can more than one person use the same RE:MIND?',
          text: isNorwegian ? 'Ja. RE:MIND er utviklet for delte hjem, og flere personer kan dele og administrere samme enhet der dette støttes i appen.' : 'Yes. RE:MIND is designed to work well in shared homes, and multiple people can share and manage a display where supported by the app.',
        },
        {
          title: isNorwegian ? 'Kan jeg ha mer enn én RE:MIND?' : 'Can I have more than one RE:MIND?',
          text: isNorwegian ? 'Ja. Appen er utviklet for å støtte flere RE:MIND-enheter.' : 'Yes. The app is designed to support multiple RE:MIND displays.',
        },
        {
          title: isNorwegian ? 'Kan jeg bytte ramme eller innlegg senere?' : 'Can I change the frame or matte later?',
          text: isNorwegian ? 'Ja. Rammer og innlegg er laget for å kunne byttes, slik at du kan endre uttrykket uten å erstatte RE:MIND-enheten. Flere varianter kan kjøpes separat.' : 'Yes. Frames and mattes are designed to be changed, so you can restyle RE:MIND without replacing the display. Additional styles can be purchased separately.',
        },
        {
          title: isNorwegian ? 'Kan RE:MIND henges på veggen?' : 'Can RE:MIND be wall mounted?',
          text: isNorwegian ? 'RE:MIND er laget for å passe naturlig på en hylle, et bord eller en vegg. Vi deler endelige detaljer om plassering og veggmontering før lansering.' : 'RE:MIND is designed to live naturally on a shelf, desk or wall. We will share final placement and mounting details before launch.',
        },
        {
          title: isNorwegian ? 'Må RE:MIND stå tilkoblet strøm?' : 'Do I need to keep it plugged in?',
          text: isNorwegian ? 'Nei. RE:MIND drives av batteri og er laget for å være frakoblet mesteparten av tiden. E-papir bruker svært lite strøm, og RE:MIND er utviklet for lang batteritid.' : 'No. RE:MIND is battery powered and designed to spend most of its time unplugged. E-paper uses very little power, and RE:MIND is designed for long battery life.',
        },
        {
          title: isNorwegian ? 'Hvordan lader jeg den?' : 'How do I charge it?',
          text: isNorwegian ? 'RE:MIND lades med ladekabelen som følger med.' : 'Recharge RE:MIND using the included charging cable.',
        },
        {
          title: isNorwegian ? 'Hva skjer når batteriet blir utslitt?' : 'What happens when the battery wears out?',
          text: isNorwegian ? (
            <>
              Batterier mister naturlig kapasitet over tid. RE:MIND er laget for å beholdes, ikke erstattes, og målet vårt er å tilby rimelig batteribytte når batteriet en dag må skiftes. Les mer om tilnærmingen vår på{' '}
              <a className={detailLinkClass} href={localizedHref('/shop/sustainability')}>siden om bærekraft</a>.
            </>
          ) : (
            <>
              Batteries naturally lose capacity over time. RE:MIND is intended to be kept rather than replaced, and our goal is to offer an affordable battery replacement service when an aging battery eventually needs replacing. Read more about our approach on the{' '}
              <a className={detailLinkClass} href="/shop/sustainability">Sustainability page</a>.
            </>
          ),
        },
        {
          title: isNorwegian ? 'Krever RE:MIND et abonnement?' : 'Does RE:MIND require a subscription?',
          text: isNorwegian ? 'Nei. Kjernefunksjonene i RE:MIND fungerer uten abonnement. AI Follow inkluderer en gratis prøveperiode på 30 dager. Etter prøveperioden kreves et betalt abonnement dersom du ønsker å fortsette å bruke AI Follow.' : 'No. RE:MIND’s core features work without a subscription. AI Follow includes a 30-day free trial. After the trial, a paid subscription is required if you want to continue using AI Follow.',
        },
        {
          title: isNorwegian ? 'Hva skjer hvis noe går i stykker?' : 'What happens if something breaks?',
          text: isNorwegian ? (
            <>
              Alle RE:MIND-enheter dekkes av vår begrensede 5-årsgaranti. Hvis noe ikke fungerer som det skal, kan du kontakte oss, så hjelper vi deg med å finne riktig løsning. Se{' '}
              <a className={detailLinkClass} href={localizedHref('/shop/warranty')}>garantisiden</a> for mer informasjon.
            </>
          ) : (
            <>
              Every RE:MIND is backed by our 5-year limited warranty. If something isn&apos;t working as it should, contact us and we&apos;ll help determine the right next step. See the{' '}
              <a className={detailLinkClass} href="/shop/warranty">Warranty page</a> for details.
            </>
          ),
        },
        {
          title: isNorwegian ? 'Hvordan fungerer åpent kjøp?' : 'What is the return policy?',
          text: isNorwegian ? (
            <>
              Du har 30 dager fra du mottar bestillingen til å be om retur. Se{' '}
              <a className={detailLinkClass} href={localizedHref('/shop/returns')}>retursiden</a> for detaljer og veiledning.
            </>
          ) : (
            <>
              You have 30 days to request a return after receiving your order. See the{' '}
              <a className={detailLinkClass} href="/shop/returns">Returns page</a> for details and instructions.
            </>
          ),
        },
        {
          title: isNorwegian ? 'Hvor sender dere?' : 'Where do you ship?',
          text: isNorwegian ? (
            <>
              Tilgjengelige leveringsalternativer og kostnader vises i kassen. Du finner oppdatert leveringsinformasjon på{' '}
              <a className={detailLinkClass} href={localizedHref('/shop/shipping')}>fraktsiden</a>.
            </>
          ) : (
            <>
              Available delivery options and costs are shown at checkout. For the latest delivery information, visit the{' '}
              <a className={detailLinkClass} href="/shop/shipping">Shipping page</a>.
            </>
          ),
        },
        {
          title: isNorwegian ? 'Trenger du mer hjelp?' : 'Need more help?',
          text: isNorwegian ? (
            <>
              Send oss en melding gjennom <a className={detailLinkClass} href={localizedHref('/shop/contact')}>kontaktsiden</a>. Dersom spørsmålet gjelder en eksisterende bestilling, bør du inkludere ordrenummeret, slik at vi kan hjelpe deg raskere.
            </>
          ) : (
            <>
              Send us a message through the <a className={detailLinkClass} href="/shop/contact">contact page</a>. If your question is about an existing order, please include your order number so we can help quickly.
            </>
          ),
        },
      ]}
    />
  )
}
