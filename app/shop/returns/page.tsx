import type { Metadata } from 'next'
import ShopLegalPage from '../../components/ShopLegalPage'
import { pickShopLocale } from '../productData'
import { shopMetadata } from '../seo'

export const metadata: Metadata = shopMetadata({
  title: 'Returns | RE:MIND',
  description: 'How to return a RE:MIND order within 30 days.',
  path: '/shop/returns',
})

export default async function ReturnsPage({ searchParams }: { searchParams?: Promise<{ lang?: string }> }) {
  const language = pickShopLocale((await searchParams)?.lang)
  const isNorwegian = language === 'no'

  return (
    <ShopLegalPage
      backHref={isNorwegian ? '/shop?lang=no' : '/shop'}
      backLabel={isNorwegian ? 'TILBAKE TIL FORSIDEN' : 'Back to home'}
      title={isNorwegian ? 'Retur' : 'Returns'}
      updatedText={isNorwegian ? 'Har du ombestemt deg? Du har 30 dager på å returnere bestillingen.' : 'Changed your mind? You have 30 days to return your order.'}
      sections={[
        {
          title: isNorwegian ? 'RETURFRIST' : 'Return window',
          text: isNorwegian ? 'Du kan be om retur innen 30 dager etter at du mottok bestillingen. Produktet skal returneres i opprinnelig stand med alt tilbehør og, dersom det er mulig, i originalemballasjen.' : 'You may request a return within 30 days of receiving your order. The product should be returned in its original condition with its accessories and, where possible, its original packaging.',
        },
        {
          title: isNorwegian ? 'START EN RETUR' : 'Start a return',
          text: isNorwegian ? 'Kontakt oss med ordrenummeret ditt og hvilke varer du ønsker å returnere. Vi sender deg returinstruksjoner og riktig returadresse.' : 'Contact us with your order number and the items you would like to send back. We will reply with return instructions and the correct return address.',
        },
        {
          title: isNorwegian ? 'PAKKING AV RETUREN' : 'Packing your item',
          text: isNorwegian ? 'Pakk alle varene forsvarlig for å unngå skader under transport. Fjern personopplysninger, logg ut av enheten og legg ved alle kabler og alt tilbehør som fulgte med.' : 'Pack every item securely to prevent damage in transit. Please remove personal information, sign out of the device and include all cables and accessories supplied with it.',
        },
        {
          title: isNorwegian ? 'TILBAKEBETALING' : 'Refunds',
          text: isNorwegian ? 'Når returen er mottatt og kontrollert, tilbakebetales det godkjente beløpet til den opprinnelige betalingsmåten. Det kan ta noe ekstra tid før beløpet vises på kontoen din.' : 'After the return has arrived and been checked, we will issue the approved refund to your original payment method. Your bank may need additional time to show it in your account.',
        },
        {
          title: isNorwegian ? 'FEIL ELLER SKADER' : 'Faulty items',
          text: isNorwegian ? 'Dersom produktet har en feil eller ble levert skadet, må du kontakte oss før det returneres. Beskriv problemet og legg gjerne ved bilder, slik at vi raskest mulig kan finne en løsning.' : 'If something is faulty or arrived damaged, contact us before returning it. Describe the issue and include photographs when helpful so we can offer the quickest solution.',
        },
      ]}
    />
  )
}
