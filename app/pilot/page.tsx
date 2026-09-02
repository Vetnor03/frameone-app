import type { Metadata } from 'next'
import PilotConfigurator from './PilotConfigurator'

export const metadata: Metadata = {
  title: 'Pilot order | RE:MIND',
  description: 'Choose your RE:MIND pilot frame and matte.',
}

export default function PilotPage() {
  return <PilotConfigurator />
}
