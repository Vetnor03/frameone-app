import type { Metadata } from 'next'
import ShopLegalPage from '../../components/ShopLegalPage'
import { shopMetadata } from '../seo'

export const metadata: Metadata = shopMetadata({
  title: 'Returns | RE:MIND',
  description: 'How to return a RE:MIND order within 30 days.',
  path: '/shop/returns',
})

export default function ReturnsPage() {
  return (
    <ShopLegalPage
      title="Returns"
      updatedText="Changed your mind? You have 30 days to return your order."
      sections={[
        {
          title: 'Return window',
          text: 'You may request a return within 30 days of receiving your order. The product should be returned in its original condition with its accessories and, where possible, its original packaging.',
        },
        {
          title: 'Start a return',
          text: 'Contact us with your order number and the items you would like to send back. We will reply with return instructions and the correct return address.',
        },
        {
          title: 'Packing your item',
          text: 'Pack every item securely to prevent damage in transit. Please remove personal information, sign out of the device and include all cables and accessories supplied with it.',
        },
        {
          title: 'Refunds',
          text: 'After the return has arrived and been checked, we will issue the approved refund to your original payment method. Your bank may need additional time to show it in your account.',
        },
        {
          title: 'Faulty items',
          text: 'If something is faulty or arrived damaged, contact us before returning it. Describe the issue and include photographs when helpful so we can offer the quickest solution.',
        },
      ]}
    />
  )
}
