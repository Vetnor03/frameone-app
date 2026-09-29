import type { Metadata } from 'next'
import PilotApplication from './PilotApplication'

export const metadata: Metadata = {
  title: 'Bli testbruker | RE:MIND',
  description: 'Søk om å bli en av fem testbrukere av RE:MIND. Tre ukers pilottest i hjemmet.',
}

export default function PilotPage() {
  return <PilotApplication />
}
