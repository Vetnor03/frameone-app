import type { Metadata } from 'next'
import PilotConfirmation from '../PilotConfirmation'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Bekreft pilottest | RE:MIND',
  description: 'Bekreft utlånsvilkårene og leveringsinformasjonen for RE:MIND-piloten.',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function PilotConfirmationPage({
  searchParams,
}: {
  searchParams?: Promise<{ invite?: string }>
}) {
  const params = await searchParams
  return <PilotConfirmation inviteId={typeof params?.invite === 'string' ? params.invite : ''} />
}
