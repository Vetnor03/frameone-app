import type { Metadata } from 'next'
import ShopLegalPage from '../../components/ShopLegalPage'
import { shopMetadata } from '../seo'

export const metadata: Metadata = shopMetadata({
  title: 'Shipping | RE:MIND',
  description: 'Shipping information for RE:MIND orders.',
  path: '/shop/shipping',
})

export default function ShippingPage() {
  return (
    <ShopLegalPage
      title="Shipping"
      updatedText="Clear delivery information, from our door to yours."
      sections={[
        {
          title: 'Order processing',
          text: 'Orders are prepared on business days. Once your parcel leaves us, we will email a shipping confirmation with tracking details so you can follow its journey.',
        },
        {
          title: 'Delivery times',
          text: 'Estimated delivery times are shown during checkout and begin after your order has been dispatched. Remote destinations and busy holiday periods may take a little longer.',
        },
        {
          title: 'Shipping cost',
          text: 'The available delivery methods and their exact prices are displayed at checkout. Orders that meet the free-shipping threshold shown in the shop are delivered at no additional shipping cost.',
        },
        {
          title: 'Address changes',
          text: 'Contact us as soon as possible if you entered the wrong address. We can update it before dispatch, but changes may not be possible once a parcel is with the carrier.',
        },
        {
          title: 'Damaged parcels',
          text: 'If your parcel arrives visibly damaged, photograph the packaging and the product, keep all packing materials and contact us promptly. We will help put things right.',
        },
      ]}
    />
  )
}
