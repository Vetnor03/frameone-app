'use client'
import { useState } from 'react'

type Feed = { id: string; label: string }
type Service = 'apple' | 'outlook' | 'hoopit' | 'other'
const SERVICES: Record<Service, { en: string; no: string; help: string; instructions: { en: string; no: string } }> = {
  apple: {
    en: 'Apple / iCloud', no: 'Apple / iCloud',
    help: 'https://support.apple.com/guide/iphone/share-icloud-calendars-iph7613c4fb/27/ios/27',
    instructions: { en: 'Calendar → Calendars → ⓘ next to an iCloud calendar → Public Calendar → Share Link',
      no: 'Kalender → Kalendere → ⓘ ved en iCloud-kalender → Offentlig kalender → Del lenke' },
  },
  outlook: {
    en: 'Outlook', no: 'Outlook',
    help: 'https://support.microsoft.com/en-us/outlook/share-your-calendar-in-outlook-on-the-web',
    instructions: { en: 'Outlook on the web → Settings → Calendar → Shared calendars → Publish → Copy ICS link',
      no: 'Outlook på nettet → Innstillinger → Kalender → Delte kalendere → Publiser → Kopier ICS-lenke' },
  },
  hoopit: {
    en: 'Hoopit', no: 'Hoopit',
    help: 'https://support.hoopit.io/nb/articles/8943085-synkroniser-hoopit-med-kalenderen-din',
    instructions: { en: 'Find your calendar subscription link using Hoopit’s calendar synchronization guide',
      no: 'Finn abonnementslenken i Hoopits veiledning for kalendersynkronisering' },
  },
  other: {
    en: 'Other calendar', no: 'Annen kalender',
    help: '',
    instructions: { en: 'Find an HTTPS or webcal:// subscription link provided by your calendar service',
      no: 'Finn en HTTPS- eller webcal://-abonnementslenke hos kalendertjenesten din' },
  },
}

export default function CalendarLinkSetup({
  language, feeds, getAccessToken, onChanged,
}: {
  language: 'no' | 'en'
  feeds: Feed[]
  getAccessToken: () => Promise<string>
  onChanged: (connected: boolean) => void
}) {
  const [service, setService] = useState<Service>('apple')
  const [label, setLabel] = useState('Apple / iCloud')
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState<'connect' | 'remove' | null>(null)
  const [error, setError] = useState('')
  const [connectedMessage, setConnectedMessage] = useState(false)

  async function post(action: string, payload: Record<string, unknown>) {
    const token = await getAccessToken()
    if (!token) throw new Error(language === 'no' ? 'Logg inn først' : 'Sign in first')
    const response = await fetch('/api/integrations/calendar-link/' + action, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(payload),
    })
    const json = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Calendar request failed')
    return json
  }

  async function connect() {
    if (busy !== null || !url.trim() || !label.trim()) return
    setBusy('connect')
    setError('')
    setConnectedMessage(false)
    try {
      // Server validates the link and imports the calendar before returning success.
      // Do not mark it connected on a failed fetch, parse, or save.
      await post('connect', { url, label })
      setUrl('')
      setConnectedMessage(true)
      onChanged(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed')
    } finally {
      setBusy(null)
    }
  }

  async function remove(id: string) {
    setBusy('remove')
    setError('')
    setConnectedMessage(false)
    try {
      const result = await post('remove', { id })
      onChanged(result.connected === true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove calendar')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-4 text-[color:var(--fg-90)]">
      <p className="text-xs leading-relaxed text-[color:var(--fg-60)]">
        {language === 'no'
          ? 'Abonner på en kalender, så vises avtalene i Påminnelser og på framen. Bare lesetilgang – ingen passord.'
          : 'Subscribe to a calendar and see its events in Reminders and on your frame. Read-only, no passwords.'}
      </p>
      {feeds.length > 0 && (
        <div className="rounded-2xl border border-[color:var(--bd-15)] p-3">
          <div className="mb-2 text-xs font-medium">{language === 'no' ? 'Tilkoblede kalendere' : 'Connected calendars'} ({feeds.length}/5)</div>
          <div className="space-y-2">
            {feeds.map(feed => (
              <div key={feed.id} className="flex items-center justify-between gap-2 rounded-xl bg-[color:var(--panel-05)] p-2">
                <span className="truncate text-sm">{feed.label}</span>
                <button type="button" onClick={() => void remove(feed.id)} disabled={busy !== null}
                  className="shrink-0 rounded-lg border border-[#d94b4b]/40 px-2.5 py-1.5 text-[10px] text-[#d94b4b] disabled:opacity-50">
                  {language === 'no' ? 'FJERN' : 'REMOVE'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {feeds.length < 5 && (
        <>
          <div>
            <label htmlFor="calendar-link-service" className="mb-1 block text-[11px] text-[color:var(--fg-65)]">
              {language === 'no' ? 'HVOR ER KALENDEREN?' : 'WHERE IS YOUR CALENDAR?'}
            </label>
            <select id="calendar-link-service" value={service}
              onChange={event => {
                const next = event.target.value as Service
                setService(next)
                setLabel(next === 'other' ? 'My calendar' : SERVICES[next][language])
                setConnectedMessage(false)
              }}
              className="h-11 w-full rounded-2xl border border-[color:var(--bd-15)] bg-[color:var(--sheet-bg)] px-3 text-sm">
              {(Object.keys(SERVICES) as Service[]).map(key =>
                <option key={key} value={key}>{SERVICES[key][language]}</option>)}
            </select>
          </div>
          <div className="rounded-xl bg-[color:var(--panel-05)] p-3">
            <p className="text-xs leading-relaxed text-[color:var(--fg-65)]">{SERVICES[service].instructions[language]}</p>
            {SERVICES[service].help && <a href={SERVICES[service].help} target="_blank" rel="noopener noreferrer"
              className="mt-2 inline-block text-xs text-[#2aa3ff] underline">
              {language === 'no' ? 'Vis offisiell veiledning' : 'View official instructions'}
            </a>}
            {service === 'apple' && <p className="mt-2 text-[11px] leading-relaxed text-[color:var(--fg-45)]">
              {language === 'no'
                ? 'Merk: «Offentlig kalender» gjør den lesbar for alle som har lenken. Ikke bruk dette for sensitiv informasjon.'
                : 'Note: Public Calendar allows anyone with its link to read the calendar. Avoid sensitive information.'}
            </p>}
          </div>
          <div>
            <label htmlFor="calendar-link-name" className="mb-1 block text-[11px] text-[color:var(--fg-65)]">
              {language === 'no' ? 'NAVN' : 'NAME'}</label>
            <input id="calendar-link-name" value={label} onChange={event => { setLabel(event.target.value); setConnectedMessage(false) }}
              maxLength={70} className="h-11 w-full rounded-2xl border border-[color:var(--bd-15)] bg-transparent px-3 text-sm"/>
          </div>
          <div>
            <label htmlFor="calendar-link-url" className="mb-1 block text-[11px] text-[color:var(--fg-65)]">
              {language === 'no' ? 'KALENDERLENKE' : 'CALENDAR LINK'}</label>
            <input id="calendar-link-url" value={url} onChange={event => { setUrl(event.target.value); setConnectedMessage(false) }}
              type="url" autoCapitalize="off" autoComplete="off" spellCheck={false} placeholder="webcal://…  or  https://…"
              className="h-11 w-full rounded-2xl border border-[color:var(--bd-15)] bg-transparent px-3 text-sm"/>
          </div>
          <button type="button" onClick={() => void connect()} disabled={busy !== null || !url.trim() || !label.trim()}
            className="h-11 w-full rounded-2xl bg-[#2aa3ff] text-xs font-semibold tracking-wider text-white disabled:opacity-40">
            {busy === 'connect' ? (language === 'no' ? 'KOBLER TIL…' : 'CONNECTING…') : (language === 'no' ? 'KOBLE TIL' : 'CONNECT')}
          </button>
        </>
      )}
      {connectedMessage && <p role="status" className="rounded-xl border border-[#1f9d4a]/35 p-3 text-xs text-[#35c76a]">
        {language === 'no' ? 'Tilkoblet! Kalenderen vises nå under Påminnelser.' : 'Connected! Your calendar is now available in Reminders.'}
      </p>}
      {error && <p role="alert" className="rounded-xl border border-[#d94b4b]/35 p-3 text-xs text-[#ff7a7a]">{error}</p>}
    </div>
  )
}
