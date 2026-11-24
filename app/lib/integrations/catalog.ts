export type IntegrationStatus = 'available' | 'experimental' | 'under-evaluation'

export type ConnectAppKey = 'waste' | 'teams' | 'google-calendar' | 'local-events' | 'spond' | 'vigilo' | 'transponder' | 'planta' | 'bonnetid' | 'todoist' | 'microsoft-todo' | 'google-tasks' | 'calendar-link'

export type IntegrationDefinition = {
  key: ConnectAppKey
  name: { en: string; no: string }
  description: { en: string; no: string }
  status: IntegrationStatus
  connectable: boolean
}

/** Shared catalogue and product ordering used by onboarding and Connect Apps. */
export const INTEGRATION_CATALOGUE: readonly IntegrationDefinition[] = [
  { key: 'teams', name: { en: 'Outlook Calendar', no: 'Outlook Calendar' }, description: { en: "Show Outlook appointments and Teams meetings in Reminders", no: "Vis Outlook-avtaler og Teams-møter i Påminnelser" }, status: 'available', connectable: true },
  { key: 'calendar-link', name: { en: 'Calendar Link', no: 'Kalenderlenke' }, description: { en: "Show events from iCal calendar links in Reminders", no: "Vis hendelser fra iCal-kalenderlenker i Påminnelser" }, status: 'available', connectable: true },
  { key: 'google-calendar', name: { en: 'Google Calendar', no: 'Google Calendar' }, description: { en: "Show Google Calendar events in Reminders", no: "Vis Google Kalender-avtaler i Påminnelser" }, status: 'available', connectable: true },
  { key: 'bonnetid', name: { en: 'IRN Prayer Times', no: 'IRN – Bønnetid' }, description: { en: "Show prayer times and Islamic occasions in Reminders", no: "Vis bønnetider og islamske merkedager i Påminnelser" }, status: 'available', connectable: true },
  { key: 'local-events', name: { en: 'Local Events', no: 'Lokale arrangementer' }, description: { en: "Show nearby events in Reminders", no: "Vis lokale arrangementer i Påminnelser" }, status: 'available', connectable: true },
  { key: 'spond', name: { en: 'Spond', no: 'Spond' }, description: { en: "Show Spond messages in Reminders", no: "Vis Spond-meldinger i Påminnelser" }, status: 'experimental', connectable: true },
  { key: 'waste', name: { en: 'Waste collection', no: 'Renovasjon' }, description: { en: "Show waste collection dates in Reminders", no: "Vis avfallstømming i Påminnelser" }, status: 'experimental', connectable: true },
  { key: 'todoist', name: { en: 'Todoist', no: 'Todoist' }, description: { en: "Show Todoist tasks in Reminders", no: "Vis Todoist-oppgaver i Påminnelser" }, status: 'available', connectable: true },
  { key: 'google-tasks', name: { en: 'Google Tasks', no: 'Google Tasks' }, description: { en: "Show Google Tasks in Reminders", no: "Vis Google Tasks i Påminnelser" }, status: 'under-evaluation', connectable: false },
  { key: 'microsoft-todo', name: { en: 'Microsoft To Do', no: 'Microsoft To Do' }, description: { en: "Show Microsoft To Do tasks in Reminders", no: "Vis Microsoft To Do-oppgaver i Påminnelser" }, status: 'available', connectable: true },
  { key: 'vigilo', name: { en: 'Vigilo', no: 'Vigilo' }, description: { en: "School and kindergarten updates", no: "Oppdateringer fra skole og barnehage" }, status: 'experimental', connectable: false },
  { key: 'transponder', name: { en: 'Transponder', no: 'Transponder' }, description: { en: "Messages from schools and activities", no: "Meldinger fra skole og aktiviteter" }, status: 'under-evaluation', connectable: false },
  { key: 'planta', name: { en: 'PLANTA', no: 'PLANTA' }, description: { en: "Plant care reminders", no: "Påminnelser om plantestell" }, status: 'under-evaluation', connectable: false },
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

/** Show connected apps first, then available, experimental, and under-evaluation.
 * Alphabetize each group by its localized display name rather than catalogue position.
 */
export function sortConnectedAppsFirst<T extends {
  connected: boolean
  app: { name: string; status: IntegrationStatus }
}>(apps: readonly T[]): T[] {
  const statusOrder: Record<IntegrationStatus, number> = {
    available: 0,
    experimental: 1,
    'under-evaluation': 2,
  }
  const alphabetic = new Intl.Collator('nb', { sensitivity: 'base', numeric: true })

  return [...apps].sort((a, b) =>
    Number(b.connected) - Number(a.connected) ||
    statusOrder[a.app.status] - statusOrder[b.app.status] ||
    alphabetic.compare(a.app.name, b.app.name)
  )
}
