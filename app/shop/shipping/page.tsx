import type { Metadata } from 'next'
import ShopLegalPage from '../../components/ShopLegalPage'
import { pickShopLocale } from '../productData'
import { shopMetadata } from '../seo'

export const metadata: Metadata = shopMetadata({
  title: 'Shipping | RE:MIND',
  description: 'Shipping information for RE:MIND orders.',
  path: '/shop/shipping',
})

export default async function ShippingPage({ searchParams }: { searchParams?: Promise<{ lang?: string }> }) {
  const language = pickShopLocale((await searchParams)?.lang)
  const isNorwegian = language === 'no'

  return (
    <ShopLegalPage
      backHref={isNorwegian ? '/shop?lang=no' : '/shop'}
      backLabel={isNorwegian ? 'TILBAKE TIL FORSIDEN' : 'Back to home'}
      title={isNorwegian ? 'Frakt' : 'Shipping'}
      updatedText={isNorwegian ? 'Alt du trenger å vite om levering.' : 'Clear delivery information, from our door to yours.'}
      sections={[
        {
          title: isNorwegian ? 'BEHANDLING AV BESTILLINGER' : 'Order processing',
          text: isNorwegian ? 'Bestillinger klargjøres på virkedager. Når pakken er sendt fra oss, mottar du en leveringsbekreftelse på e-post med sporingsinformasjon, slik at du kan følge pakken underveis.' : 'Orders are prepared on business days. Once your parcel leaves us, we will email a shipping confirmation with tracking details so you can follow its journey.',
        },
        {
          title: isNorwegian ? 'LEVERINGSTID' : 'Delivery times',
          text: isNorwegian ? 'Estimert leveringstid vises i kassen og gjelder fra bestillingen er sendt. Levering til avsidesliggende områder og i travle høytidsperioder kan ta noe lengre tid.' : 'Estimated delivery times are shown during checkout and begin after your order has been dispatched. Remote destinations and busy holiday periods may take a little longer.',
        },
        {
          title: isNorwegian ? 'FRAKTKOSTNAD' : 'Shipping cost',
          text: isNorwegian ? 'Tilgjengelige leveringsmetoder og nøyaktige priser vises i kassen. Bestillinger som oppfyller grensen for gratis frakt som vises i nettbutikken, sendes uten ekstra fraktkostnad.' : 'The available delivery methods and their exact prices are displayed at checkout. Orders that meet the free-shipping threshold shown in the shop are delivered at no additional shipping cost.',
        },
        {
          title: isNorwegian ? 'ADRESSEENDRINGER' : 'Address changes',
          text: isNorwegian ? 'Ta kontakt så snart som mulig dersom du har oppgitt feil adresse. Vi kan oppdatere den før bestillingen sendes, men endringer er kanskje ikke mulig etter at pakken er overlevert til transportøren.' : 'Contact us as soon as possible if you entered the wrong address. We can update it before dispatch, but changes may not be possible once a parcel is with the carrier.',
        },
        {
          title: isNorwegian ? 'SKADEDE PAKKER' : 'Damaged parcels',
          text: isNorwegian ? 'Ta bilder av emballasjen og produktet dersom pakken er synlig skadet ved levering. Ta vare på alt emballasjemateriale og kontakt oss så snart som mulig, så hjelper vi deg videre.' : 'If your parcel arrives visibly damaged, photograph the packaging and the product, keep all packing materials and contact us promptly. We will help put things right.',
        },
      ]}
    />
  )
}
