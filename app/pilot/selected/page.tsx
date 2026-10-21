import type { Metadata } from 'next'
import PilotConfigurator from '../PilotConfigurator'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Velg pilotramme | RE:MIND',
  description: 'Velg ramme og passepartout til ditt RE:MIND pilotlån.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function SelectedPilotPage({
  searchParams,
}: {
  searchParams?: Promise<{ invite?: string; demo?: string }>
}) {
  const params = await searchParams
  return <PilotConfigurator inviteId={typeof params?.invite === 'string' ? params.invite : ''} demoMode={params?.demo === '1'} />
}
