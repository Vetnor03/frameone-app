import type { Metadata } from 'next'
import ShopLegalPage from '../../components/ShopLegalPage'
import { pickShopLocale } from '../productData'
import { shopMetadata } from '../seo'

export const metadata: Metadata = shopMetadata({
  title: '5 Year Warranty | RE:MIND',
  description: 'Details of the 5-year limited RE:MIND product warranty.',
  path: '/shop/warranty',
})

export default async function WarrantyPage({ searchParams }: { searchParams?: Promise<{ lang?: string }> }) {
  const language = pickShopLocale((await searchParams)?.lang)
  const isNorwegian = language === 'no'

  return (
    <ShopLegalPage
      backHref={isNorwegian ? '/shop?lang=no' : '/shop'}
      backLabel={isNorwegian ? 'TILBAKE TIL FORSIDEN' : 'Back to home'}
      title={isNorwegian ? '5 ÅRS GARANTI' : '5 YEAR WARRANTY'}
      updatedText={isNorwegian ? 'Laget for å vare.' : 'Built to stay.'}
      sections={[
        {
          title: isNorwegian ? 'LAGET FOR Å VARE' : 'Built to stay',
          text: (
            <div className="space-y-4">
              <p>{isNorwegian ? 'Alle RE:MIND-enheter omfattes av vår 5-årsgaranti.' : 'Every RE:MIND display is backed by our 5-year limited warranty.'}</p>
              <p>{isNorwegian ? 'Dersom det oppstår en feil på RE:MIND som skyldes en produksjons- eller materialfeil ved normal bruk, hjelper vi deg med å finne en løsning.' : <>If your RE:MIND develops a fault caused by a manufacturing or material defect during normal use, we&apos;ll work with you to make it right.</>}</p>
            </div>
          ),
        },
        {
          title: isNorwegian ? 'DETTE DEKKES' : "What's covered",
          text: (
            <div className="space-y-4">
              <p>{isNorwegian ? 'Garantien dekker material- og produksjonsfeil som påvirker normal bruk av RE:MIND-enheten i løpet av garantiperioden på fem år.' : 'The warranty covers defects in materials and workmanship affecting the normal operation of the RE:MIND device during the 5-year warranty period.'}</p>
              <p>{isNorwegian ? 'Avhengig av feilen kan RE:MIND reparere produktet, erstatte den berørte komponenten eller erstatte enheten.' : 'Depending on the issue, RE:MIND may repair the product, replace the affected component, or replace the device.'}</p>
            </div>
          ),
        },
        {
          title: isNorwegian ? 'DETTE DEKKES IKKE' : "What's not covered",
          text: (
            <div>
              <p>{isNorwegian ? 'Garantien dekker ikke:' : 'The commercial warranty does not cover:'}</p>
              <ul className="mt-4 list-disc space-y-1 pl-5">
                <li>{isNorwegian ? 'Skader som følge av uhell eller fysisk påvirkning' : 'Accidental or physical damage'}</li>
                <li>{isNorwegian ? 'Skader som skyldes feil bruk eller uforsvarlig håndtering' : 'Damage caused by misuse or improper handling'}</li>
                <li>{isNorwegian ? 'Skader som skyldes uautoriserte endringer eller reparasjoner' : 'Damage caused by unauthorized modifications or repairs'}</li>
                <li>{isNorwegian ? 'Normal kosmetisk slitasje' : 'Normal cosmetic wear'}</li>
                <li>{isNorwegian ? 'Forbruksvarer eller utskiftbart tilbehør der problemet skyldes normal slitasje' : 'Consumable or replaceable accessories where the issue is normal wear'}</li>
                <li>{isNorwegian ? 'Normal reduksjon i batterikapasitet som følge av alder og bruk' : 'Normal battery capacity degradation caused by aging and use'}</li>
                <li>{isNorwegian ? 'Skader som skyldes bruk utenfor produktets tiltenkte driftsforhold' : <>Damage caused by use outside the product&apos;s intended operating conditions</>}</li>
              </ul>
            </div>
          ),
        },
        {
          title: isNorwegian ? 'BATTERIBYTTE' : 'Battery replacement',
          text: (
            <div className="space-y-4">
              <p className="font-medium text-black/80">{isNorwegian ? 'Laget for å vare lenge.' : 'Made to keep going.'}</p>
              <p>{isNorwegian ? 'Batterier mister naturlig kapasitet over tid. Normal reduksjon i batterikapasitet regnes derfor ikke som en feil som dekkes av vår 5-årsgaranti.' : 'Batteries naturally lose capacity as they age. Normal battery degradation is therefore not considered a defect under our 5-year limited warranty.'}</p>
              <p>{isNorwegian ? 'Et batteri som eldes, bør likevel ikke bety at hele RE:MIND må byttes ut.' : <>But an aging battery shouldn&apos;t mean replacing your RE:MIND.</>}</p>
              <p>{isNorwegian ? 'Når batteriet til slutt når slutten av levetiden, er målet vårt å tilby batteribytte til en lav kostnad, slik at du kan fortsette å bruke din eksisterende RE:MIND fremfor å erstatte hele produktet.' : 'If the battery eventually reaches the end of its useful life, we intend to offer a low-cost battery replacement service so you can keep using your existing RE:MIND rather than replacing the entire product.'}</p>
              <p>{isNorwegian ? 'En unormalt tidlig batterifeil skiller seg fra vanlig aldring og kan være dekket av RE:MIND-garantien og/eller gjeldende lovfestede forbrukerrettigheter.' : 'A premature battery fault is different from normal battery aging and may be covered by the RE:MIND warranty and/or applicable statutory consumer rights.'}</p>
            </div>
          ),
        },
        {
          title: isNorwegian ? 'DINE FORBRUKERRETTIGHETER' : 'Your consumer rights',
          text: (
            <div className="space-y-4">
              <p>{isNorwegian ? 'Vår 5-årsgaranti kommer i tillegg til dine lovfestede forbrukerrettigheter.' : 'Our 5-year warranty is provided in addition to your statutory consumer rights.'}</p>
              <p>{isNorwegian ? 'Ingenting i denne garantien begrenser, erstatter eller reduserer rettigheter du har etter gjeldende forbrukerlovgivning, inkludert norsk forbrukerlovgivning der den gjelder.' : 'Nothing in this warranty limits, replaces or reduces any rights you may have under applicable consumer protection law, including Norwegian consumer law where applicable.'}</p>
            </div>
          ),
        },
        {
          title: isNorwegian ? 'TRENGER DU HJELP?' : 'Need help?',
          text: (
            <div className="space-y-4">
              <p>{isNorwegian ? 'Dersom noe ikke fungerer som det skal, kan du kontakte oss på ' : <>If something isn&apos;t working as it should, contact us at </>}<a className="underline underline-offset-4" href="mailto:support@re-mind.no">support@re-mind.no</a>{isNorwegian ? '. Legg ved ordreinformasjonen din og en kort beskrivelse av problemet.' : ' with your order information and a short description of the problem.'}</p>
              <p>{isNorwegian ? 'Vi kan be om bilder eller ytterligere informasjon dersom det er nødvendig for å finne årsaken til problemet.' : 'Photos or additional information may be requested where useful to diagnose the issue.'}</p>
              <p>{isNorwegian ? 'Vi hjelper deg med å finne riktig løsning videre.' : <>We&apos;ll help determine the appropriate next step.</>}</p>
            </div>
          ),
        },
      ]}
    />
  )
}
