import type { Metadata } from 'next'
import ShopLegalPage from '../../components/ShopLegalPage'
import { shopMetadata } from '../seo'

export const metadata: Metadata = shopMetadata({
  title: 'FAQ | RE:MIND',
  description: 'Answers to common questions about the RE:MIND display.',
  path: '/shop/faq',
})

const detailLinkClass = 'shop-footer-link font-medium text-black/80 underline decoration-black/25 underline-offset-4 hover:text-black'

export default function FaqPage() {
  return (
    <ShopLegalPage
      title="Frequently asked questions"
      updatedText="A few helpful details before your RE:MIND arrives."
      sections={[
        {
          title: 'What is RE:MIND?',
          text: 'RE:MIND is a low-power e-paper display for useful everyday information such as reminders, weather, events and other connected updates. It keeps what matters in view without behaving like a normal glowing screen.',
        },
        {
          title: 'What comes with RE:MIND?',
          text: 'A complete RE:MIND starts at 2 299 NOK and includes the RE:MIND display, one selected frame, one selected matte, a charging cable and a setup guide. Premium frame or matte choices may add to the total, and additional styles can be purchased separately later.',
        },
        {
          title: 'How do I set it up?',
          text: 'During setup, connect RE:MIND to Wi-Fi and pair it with the RE:MIND app. The app guides you through choosing what appears on the display.',
        },
        {
          title: 'Does RE:MIND need Wi-Fi?',
          text: 'RE:MIND uses Wi-Fi to receive updated information. Its e-paper image remains visible without continuous power, so it does not behave like a normal glowing screen.',
        },
        {
          title: 'How often does it update?',
          text: 'RE:MIND updates periodically based on the information being displayed and how the product is configured.',
        },
        {
          title: 'Do I need the app?',
          text: 'The RE:MIND app is used to set up and manage the display, choose what appears on it and configure connected features. You do not need to keep the app open or constantly use it after setup.',
        },
        {
          title: 'Can more than one person use the same RE:MIND?',
          text: 'Yes. RE:MIND is designed to work well in shared homes, and multiple people can share and manage a display where supported by the app.',
        },
        {
          title: 'Can I have more than one RE:MIND?',
          text: 'Yes. The app is designed to support multiple RE:MIND displays.',
        },
        {
          title: 'Can I change the frame or matte later?',
          text: 'Yes. Frames and mattes are designed to be changed, so you can restyle RE:MIND without replacing the display. Additional styles can be purchased separately.',
        },
        {
          title: 'Can RE:MIND be wall mounted?',
          text: 'RE:MIND is designed to live naturally on a shelf, desk or wall. We will share final placement and mounting details before launch.',
        },
        {
          title: 'Do I need to keep it plugged in?',
          text: 'No. RE:MIND is battery powered and designed to spend most of its time unplugged. E-paper uses very little power, and RE:MIND is designed for long battery life.',
        },
        {
          title: 'How do I charge it?',
          text: 'Recharge RE:MIND using the included charging cable.',
        },
        {
          title: 'What happens when the battery wears out?',
          text: (
            <>
              Batteries naturally lose capacity over time. RE:MIND is intended to be kept rather than replaced, and our goal is to offer an affordable battery replacement service when an aging battery eventually needs replacing. Read more about our approach on the{' '}
              <a className={detailLinkClass} href="/shop/sustainability">Sustainability page</a>.
            </>
          ),
        },
        {
          title: 'Does RE:MIND require a subscription?',
          text: 'No. RE:MIND’s core features work without a subscription. AI Follow includes a 30-day free trial. After the trial, a paid subscription is required if you want to continue using AI Follow.',
        },
        {
          title: 'What happens if something breaks?',
          text: (
            <>
              Every RE:MIND is backed by our 5-year limited warranty. If something isn&apos;t working as it should, contact us and we&apos;ll help determine the right next step. See the{' '}
              <a className={detailLinkClass} href="/shop/warranty">Warranty page</a> for details.
            </>
          ),
        },
        {
          title: 'What is the return policy?',
          text: (
            <>
              You have 30 days to request a return after receiving your order. See the{' '}
              <a className={detailLinkClass} href="/shop/returns">Returns page</a> for details and instructions.
            </>
          ),
        },
        {
          title: 'Where do you ship?',
          text: (
            <>
              Available delivery options and costs are shown at checkout. For the latest delivery information, visit the{' '}
              <a className={detailLinkClass} href="/shop/shipping">Shipping page</a>.
            </>
          ),
        },
        {
          title: 'Need more help?',
          text: (
            <>
              Send us a message through the <a className={detailLinkClass} href="/shop/contact">contact page</a>. If your question is about an existing order, please include your order number so we can help quickly.
            </>
          ),
        },
      ]}
    />
  )
}
