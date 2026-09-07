export type IntegrationStatus = 'available' | 'experimental' | 'under-evaluation'

export type ConnectAppKey = 'waste' | 'teams' | 'local-events' | 'spond' | 'vigilo' | 'transponder'

export type IntegrationDefinition = {
  key: ConnectAppKey
  name: { en: string; no: string }
  description: { en: string; no: string }
  status: IntegrationStatus
  connectable: boolean
}

/** Shared catalogue and product ordering used by onboarding and Connect Apps. */
export const INTEGRATION_CATALOGUE: readonly IntegrationDefinition[] = [
  { key: 'waste', name: { en: 'Waste collection', no: 'Renovasjon' }, description: { en: 'Automatically find collections for your home address', no: 'Finn hentedager automatisk fra hjemmeadressen din' }, status: 'available', connectable: true },
  { key: 'teams', name: { en: 'Microsoft Calendar', no: 'Microsoft Kalender' }, description: { en: "Show today's meetings on your frame", no: 'Vis dagens møter på framen din' }, status: 'available', connectable: true },
  { key: 'local-events', name: { en: 'Local Events', no: 'Lokale arrangementer' }, description: { en: 'Choose your local area for nearby events', no: 'Velg nærområdet ditt for lokale arrangementer' }, status: 'available', connectable: true },
  { key: 'spond', name: { en: 'Spond', no: 'Spond' }, description: { en: 'Show Spond messages on your frame', no: 'Vis Spond-meldinger på framen din' }, status: 'experimental', connectable: true },
  { key: 'vigilo', name: { en: 'Vigilo', no: 'Vigilo' }, description: { en: 'This integration is being evaluated', no: 'Denne integrasjonen er under vurdering' }, status: 'under-evaluation', connectable: false },
  { key: 'transponder', name: { en: 'Transponder', no: 'Transponder' }, description: { en: 'This integration is being evaluated', no: 'Denne integrasjonen er under vurdering' }, status: 'under-evaluation', connectable: false },
]

export function integrationStatusLabel(status: IntegrationStatus, language: 'en' | 'no') {
  if (status === 'experimental') return language === 'no' ? 'Eksperimentell' : 'Experimental'
  if (status === 'under-evaluation') return language === 'no' ? 'Under vurdering' : 'Under evaluation'
  return null
}
