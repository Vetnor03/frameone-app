import type { Metadata } from 'next'
import ShopLegalPage from '../../components/ShopLegalPage'

export const metadata: Metadata = {
  title: 'FAQ | RE:MIND',
  description: 'Answers to common questions about the RE:MIND frame.',
}

export default function FaqPage() {
  return (
    <ShopLegalPage
      title="Frequently asked questions"
      updatedText="A few helpful details before your RE:MIND arrives."
      sections={[
        {
          title: 'What is RE:MIND?',
          text: 'RE:MIND is a calm, connected display for the information that matters in everyday life. It brings reminders, weather, calendars and useful updates into view without asking you to open another app.',
        },
        {
          title: 'What is included?',
          text: 'A complete RE:MIND starts at 2 299 NOK and includes the RE:MIND display, your selected frame, your selected matte, a charging cable and a setup guide. Premium frame or matte choices may add to the total. Additional frames and mattes can be purchased separately later. Bundle contents are listed on each product page.',
        },
        {
          title: 'How does setup work?',
          text: 'Plug in your frame, follow the on-screen pairing instructions and connect it to Wi-Fi. You can then choose and arrange what appears on the display from the RE:MIND app.',
        },
        {
          title: 'Can I change the look?',
          text: 'Yes. Frames and mattes are designed to be swapped, so you can refresh the look of RE:MIND as your room or style changes.',
        },
        {
          title: 'Need more help?',
          text: 'Send us a message through the contact page and include your order number when your question is about an existing order. We will help you find the right answer.',
        },
      ]}
    />
  )
}
