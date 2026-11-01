import type { Metadata } from 'next'
import PilotApplication from './PilotApplication'
import { isPilotApplicationClosed } from '@/app/lib/pilotApplicationDeadline'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Påmeldingen til pilottesten er avsluttet | RE:MIND',
  description: 'Påmeldingen til den første pilottesten er avsluttet. Takk til alle som meldte interesse for RE:MIND.',
}

function PilotApplicationClosed() {
  return (
    <main className="pilot-page min-h-screen bg-[#f3f1ec] px-4 text-[#242522] sm:px-6">
      <header className="mx-auto flex h-16 max-w-[1080px] items-center justify-between border-b border-black/10">
        <a href="https://re-mind.no" className="text-[19px] font-semibold tracking-[.16em]">RE:MIND</a>
        <span className="text-[10px] font-semibold uppercase tracking-[.19em] text-black/45">Første pilottest</span>
      </header>
      <section className="mx-auto flex min-h-[65vh] w-full max-w-xl flex-col justify-center py-16">
        <p className="text-[11px] font-semibold uppercase tracking-[.2em] text-[#76786e]">Første pilottest</p>
        <h1 className="mt-4 text-[clamp(38px,6vw,58px)] font-medium leading-[1.06] tracking-[-.05em]">Påmeldingen er avsluttet.</h1>
        <p className="mt-6 text-[15px] leading-7 text-[#5e6159]">Takk til alle som meldte interesse for å teste RE:MIND! Vi går nå gjennom påmeldingene. Alle påmeldte får en oppdatering når utvelgelsen er klar.</p>
      </section>
    </main>
  )
}

export default function PilotPage() {
  return isPilotApplicationClosed() ? <PilotApplicationClosed /> : <PilotApplication />
}
