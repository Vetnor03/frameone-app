export type IntegrationStatus = 'available' | 'experimental' | 'under-evaluation'

export type ConnectAppKey = 'waste' | 'teams' | 'google-calendar' | 'local-events' | 'spond' | 'vigilo' | 'transponder' | 'planta' | 'bonnetid' | 'todoist' | 'microsoft-todo' | 'google-tasks' | 'calendar-link' | 'familywall' | 'surfline' | 'meldinga' | 'fotmob' | 'sofascore' | 'yr' | 'storm' | 'skistar' | 'bring' | 'listonic' | 'nordnet' | 'vg' | 'aftenposten' | 'timeanddate'

export type IntegrationDefinition = {
  key: ConnectAppKey
  name: { en: string; no: string }
  description: { en: string; no: string }
  status: IntegrationStatus
  connectable: boolean
  modules: readonly string[]
}

/** Shared catalogue and product ordering used by onboarding and Connect Apps. */
export const INTEGRATION_CATALOGUE: readonly IntegrationDefinition[] = [
  { key: 'teams', name: { en: 'Outlook Calendar', no: 'Outlook Calendar' }, description: { en: "Show Outlook appointments and Teams meetings in Reminders", no: "Vis Outlook-avtaler og Teams-møter i Påminnelser" }, status: 'available', connectable: true, modules: ['reminders'] },
  { key: 'calendar-link', name: { en: 'Calendar Link', no: 'Kalenderlenke' }, description: { en: "Show events from iCal calendar links in Reminders", no: "Vis hendelser fra iCal-kalenderlenker i Påminnelser" }, status: 'available', connectable: true, modules: ['reminders'] },
  { key: 'google-calendar', name: { en: 'Google Calendar', no: 'Google Calendar' }, description: { en: "Show Google Calendar events in Reminders", no: "Vis Google Kalender-avtaler i Påminnelser" }, status: 'available', connectable: true, modules: ['reminders'] },
  { key: 'bonnetid', name: { en: 'IRN Prayer Times', no: 'IRN – Bønnetid' }, description: { en: "Show prayer times and Islamic occasions in Reminders", no: "Vis bønnetider og islamske merkedager i Påminnelser" }, status: 'available', connectable: true, modules: ['reminders'] },
  { key: 'local-events', name: { en: 'Local Events', no: 'Lokale arrangementer' }, description: { en: "Show nearby events in Reminders", no: "Vis lokale arrangementer i Påminnelser" }, status: 'available', connectable: true, modules: ['reminders'] },
  { key: 'spond', name: { en: 'Spond', no: 'Spond' }, description: { en: "Show Spond messages in Reminders", no: "Vis Spond-meldinger i Påminnelser" }, status: 'experimental', connectable: true, modules: ['reminders'] },
  { key: 'waste', name: { en: 'Waste collection', no: 'Renovasjon' }, description: { en: "Show waste collection dates in Reminders", no: "Vis avfallstømming i Påminnelser" }, status: 'experimental', connectable: true, modules: ['reminders'] },
  { key: 'todoist', name: { en: 'Todoist', no: 'Todoist' }, description: { en: "Show Todoist tasks in Reminders", no: "Vis Todoist-oppgaver i Påminnelser" }, status: 'available', connectable: true, modules: ['reminders'] },
  { key: 'google-tasks', name: { en: 'Google Tasks', no: 'Google Tasks' }, description: { en: "Show Google Tasks in Reminders", no: "Vis Google Tasks i Påminnelser" }, status: 'under-evaluation', connectable: false, modules: ['reminders'] },
  { key: 'microsoft-todo', name: { en: 'Microsoft To Do', no: 'Microsoft To Do' }, description: { en: "Show Microsoft To Do tasks in Reminders", no: "Vis Microsoft To Do-oppgaver i Påminnelser" }, status: 'available', connectable: true, modules: ['reminders'] },
  { key: 'vigilo', name: { en: 'Vigilo', no: 'Vigilo' }, description: { en: "School and kindergarten updates", no: "Oppdateringer fra skole og barnehage" }, status: 'experimental', connectable: false, modules: ['reminders'] },
  { key: 'transponder', name: { en: 'Transponder', no: 'Transponder' }, description: { en: "Messages from schools and activities", no: "Meldinger fra skole og aktiviteter" }, status: 'under-evaluation', connectable: false, modules: ['reminders'] },
  { key: 'familywall', name: { en: 'FamilyWall', no: 'FamilyWall' }, description: { en: 'Show FamilyWall calendar events in Reminders', no: 'Vis FamilyWall-kalenderavtaler i Påminnelser' }, status: 'under-evaluation', connectable: false, modules: ['reminders'] },
  { key: 'planta', name: { en: 'PLANTA', no: 'PLANTA' }, description: { en: "Plant care reminders", no: "Påminnelser om plantestell" }, status: 'under-evaluation', connectable: false, modules: ['reminders'] },
  { key: 'surfline', name: { en: "Surfline", no: "Surfline" }, description: { en: "Show surf forecasts for your favourite spots", no: "Vis surfevarsel for favorittspottene dine" }, status: 'under-evaluation', connectable: false, modules: ['surf'] },
  { key: 'meldinga', name: { en: "Meldinga", no: "Meldinga" }, description: { en: "Show Norwegian surf forecasts and surf scores", no: "Vis norske surfevarsler og surfscore" }, status: 'under-evaluation', connectable: false, modules: ['surf'] },
  { key: 'fotmob', name: { en: "FotMob", no: "FotMob" }, description: { en: "Show football scores and upcoming matches", no: "Vis fotballresultater og kommende kamper" }, status: 'under-evaluation', connectable: false, modules: ['soccer'] },
  { key: 'sofascore', name: { en: "Sofascore", no: "Sofascore" }, description: { en: "Show football results and match schedules", no: "Vis fotballresultater og kampoppsett" }, status: 'under-evaluation', connectable: false, modules: ['soccer'] },
  { key: 'yr', name: { en: "Yr", no: "Yr" }, description: { en: "Show weather forecasts from Yr and MET Norway", no: "Vis værvarsler fra Yr og Meteorologisk institutt" }, status: 'under-evaluation', connectable: false, modules: ['weather'] },
  { key: 'storm', name: { en: "Storm.no", no: "Storm.no" }, description: { en: "Show weather forecasts from Storm", no: "Vis værvarsler fra Storm" }, status: 'under-evaluation', connectable: false, modules: ['weather'] },
  { key: 'skistar', name: { en: "SkiStar", no: "SkiStar" }, description: { en: "Show snow conditions and lift status", no: "Vis snøforhold og heisstatus" }, status: 'under-evaluation', connectable: false, modules: ['ski'] },
  { key: 'bring', name: { en: "Bring!", no: "Bring!" }, description: { en: "Show your shared shopping lists in Groceries", no: "Vis delte handlelister i Handleliste" }, status: 'under-evaluation', connectable: false, modules: ['groceries'] },
  { key: 'listonic', name: { en: "Listonic", no: "Listonic" }, description: { en: "Show your Listonic shopping lists in Groceries", no: "Vis Listonic-handlelister i Handleliste" }, status: 'under-evaluation', connectable: false, modules: ['groceries'] },
  { key: 'nordnet', name: { en: "Nordnet", no: "Nordnet" }, description: { en: "Show your selected investments and market updates", no: "Vis utvalgte investeringer og markedsoppdateringer" }, status: 'under-evaluation', connectable: false, modules: ['stocks'] },
  { key: 'vg', name: { en: "VG", no: "VG" }, description: { en: "Show headlines from VG in News", no: "Vis overskrifter fra VG i Nyheter" }, status: 'under-evaluation', connectable: false, modules: ['news'] },
  { key: 'aftenposten', name: { en: "Aftenposten", no: "Aftenposten" }, description: { en: "Show headlines from Aftenposten in News", no: "Vis overskrifter fra Aftenposten i Nyheter" }, status: 'under-evaluation', connectable: false, modules: ['news'] },
  { key: 'timeanddate', name: { en: "timeanddate", no: "timeanddate" }, description: { en: "Show holidays and countdowns to upcoming dates", no: "Vis helligdager og nedtellinger til kommende datoer" }, status: 'under-evaluation', connectable: false, modules: ['date', 'countdown'] },
]

export function integrationStatusLabel(status: IntegrationStatus, language: 'en' | 'no') {
  if (status === 'experimental') return language === 'no' ? 'Eksperimentell' : 'Experimental'
  if (status === 'under-evaluation') return language === 'no' ? 'Under vurdering' : 'Under evaluation'
  return null
}

/** A null module represents the unfiltered Connect catalogue. */
export function integrationMatchesModule(definition: IntegrationDefinition, module: string | null): boolean {
  return module === null || definition.modules.includes(module)
}

/** Active-module scope never hides an existing connection. An explicit module
 * shortcut takes precedence over the catalogue scope. */
export function integrationMatchesScope(
  definition: Pick<IntegrationDefinition, 'modules'>,
  connected: boolean,
  scope: 'active' | 'all',
  activeModules: readonly string[] | null,
  moduleFilter: string | null,
): boolean {
  if (moduleFilter !== null) return definition.modules.includes(moduleFilter)
  return scope === 'all' || activeModules === null || connected ||
    definition.modules.some(module => activeModules.includes(module))
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
