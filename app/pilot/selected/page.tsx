import type { Metadata } from 'next'
import PilotConfigurator from '../PilotConfigurator'

export const metadata: Metadata = {
  title: 'Velg pilotramme | RE:MIND',
  description: 'Valg av låneenhet for utvalgte RE:MIND-testere.',
  robots: { index: false, follow: false },
}

export default function SelectedPilotPage() {
  return <PilotConfigurator />
}
