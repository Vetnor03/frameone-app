import type { Metadata } from 'next'
import ShopLegalPage from '../../components/ShopLegalPage'

export const metadata: Metadata = {
  title: 'Warranty | RE:MIND',
  description: 'Details of the two-year RE:MIND product warranty.',
}

export default function WarrantyPage() {
  return (
    <ShopLegalPage
      title="Warranty"
      updatedText="Every RE:MIND is covered by our two-year limited warranty."
      sections={[
        {
          title: 'What is covered',
          text: 'For two years from the original purchase date, the warranty covers defects in materials and workmanship that arise during normal household use of your RE:MIND product.',
        },
        {
          title: 'What is not covered',
          text: 'The warranty does not cover accidental damage, misuse, unauthorised repairs, cosmetic wear, loss, theft or damage caused by using the product outside its supplied instructions.',
        },
        {
          title: 'Make a claim',
          text: 'Contact us with your order number, a description of the problem and photographs or video where useful. We may ask you to complete a few troubleshooting steps before arranging service.',
        },
        {
          title: 'Our solution',
          text: 'When a valid claim is confirmed, we will choose the most appropriate solution: repair the product, replace it with an equivalent product or provide a refund where required.',
        },
        {
          title: 'Your rights',
          text: 'This limited warranty is provided in addition to the consumer rights and remedies available under the laws that apply where you live. Those statutory rights are not restricted by this warranty.',
        },
      ]}
    />
  )
}
