export type IntegrationStatus = 'available' | 'experimental' | 'under-evaluation'

export type ConnectAppKey = 'waste' | 'teams' | 'google-calendar' | 'local-events' | 'spond' | 'vigilo' | 'transponder' | 'planta' | 'bonnetid'

export type IntegrationDefinition = {
  key: ConnectAppKey
  name: { en: string; no: string }
  description: { en: string; no: string }
  status: IntegrationStatus
  connectable: boolean
}

/** Shared catalogue and product ordering used by onboarding and Connect Apps. */
export const INTEGRATION_CATALOGUE: readonly IntegrationDefinition[] = [
  { key: 'teams', name: { en: 'Teams', no: 'Teams' }, description: { en: "Show today's meetings on your frame", no: 'Vis dagens møter på framen din' }, status: 'available', connectable: true },
  { key: 'google-calendar', name: { en: 'Google Calendar', no: 'Google Calendar' }, description: { en: 'Show upcoming events from your Google calendars', no: 'Vis kommende avtaler fra Google-kalenderne dine' }, status: 'available', connectable: true },
  { key: 'bonnetid', name: { en: 'IRN Prayer Times', no: 'IRN – Bønnetid' }, description: { en: 'Official Norwegian prayer times and Islamic calendar occasions from IRN', no: 'Offisielle bønnetider og islamske merkedager fra IRN' }, status: 'available', connectable: true },
  { key: 'local-events', name: { en: 'Local Events', no: 'Lokale arrangementer' }, description: { en: 'Choose your local area for nearby events', no: 'Velg nærområdet ditt for lokale arrangementer' }, status: 'available', connectable: true },
  { key: 'spond', name: { en: 'Spond', no: 'Spond' }, description: { en: 'Show Spond messages on your frame', no: 'Vis Spond-meldinger på framen din' }, status: 'experimental', connectable: true },
  { key: 'waste', name: { en: 'Waste collection', no: 'Renovasjon' }, description: { en: 'Find your address and see upcoming waste collections', no: 'Finn adressen din og se kommende tømminger' }, status: 'experimental', connectable: true },
  { key: 'vigilo', name: { en: 'Vigilo', no: 'Vigilo' }, description: { en: 'This integration is being evaluated', no: 'Denne integrasjonen er under vurdering' }, status: 'under-evaluation', connectable: false },
  { key: 'transponder', name: { en: 'Transponder', no: 'Transponder' }, description: { en: 'This integration is being evaluated', no: 'Denne integrasjonen er under vurdering' }, status: 'under-evaluation', connectable: false },
  { key: 'planta', name: { en: 'PLANTA', no: 'PLANTA' }, description: { en: 'This integration is being evaluated', no: 'Denne integrasjonen er under vurdering' }, status: 'under-evaluation', connectable: false },
]

export function integrationStatusLabel(status: IntegrationStatus, language: 'en' | 'no') {
  if (status === 'experimental') return language === 'no' ? 'Eksperimentell' : 'Experimental'
  if (status === 'under-evaluation') return language === 'no' ? 'Under vurdering' : 'Under evaluation'
  return null
}

/** Match integrations by name, key, description or availability in either app language. */
export function integrationMatchesSearch(definition: IntegrationDefinition, query: string): boolean {
  const term = query.trim().toLocaleLowerCase()
  if (!term) return true
  return [
    definition.key,
    definition.name.en,
    definition.name.no,
    definition.description.en,
    definition.description.no,
    integrationStatusLabel(definition.status, 'en') || '',
    integrationStatusLabel(definition.status, 'no') || '',
  ].some(value => value.toLocaleLowerCase().includes(term))
}

/** Only integrations with a working Connect flow are enabled during the pilot.
 * Renovasjon uses verified static collections where available, with provider support for other areas.
 */
export function integrationActiveForPilot(key: ConnectAppKey): boolean {
  const definition = INTEGRATION_CATALOGUE.find(app => app.key === key)
  return definition?.connectable === true && definition.status !== 'under-evaluation'
}

/** Connected integrations lead Connect; keep catalogue order within both groups. */
export function sortConnectedAppsFirst<T extends { connected: boolean }>(apps: readonly T[]): T[] {
  return [...apps].sort((a, b) => Number(b.connected) - Number(a.connected))
}
