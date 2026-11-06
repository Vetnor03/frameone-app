export const pilotFrameNames = {
  'american-walnut': 'American Walnut',
  'dark-charcoal': 'Dark Charcoal',
  'light-oak': 'Light Oak',
} as const

export const pilotMatteNames = {
  beige: 'Beige',
  'solid-black': 'Black',
  'new-castle': 'Grey',
  sanguine: 'Red',
  green: 'Green',
  // Retain historical selections for pilots who have already submitted.
  'midnight-blue-velour': 'Midnight Blue Velour',
  'silver-birch': 'Silver Birch',
} as const

export type PilotFrameId = keyof typeof pilotFrameNames
export type PilotMatteId = keyof typeof pilotMatteNames

// These are the five mattes currently offered for new pilot selections.
export const selectablePilotMatteIds = ['beige', 'new-castle', 'sanguine', 'green', 'solid-black'] as const
export type SelectablePilotMatteId = (typeof selectablePilotMatteIds)[number]

export const limitedPilotMattes = new Set<PilotMatteId>([
  'midnight-blue-velour',
  'silver-birch',
])

// Pilot invitation links use the existing, unguessable application UUID.
// The API also checks that its owner has been selected before reading or writing.
export function validPilotInvitation(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function validPilotFrame(value: unknown): value is PilotFrameId {
  return typeof value === 'string' && Object.hasOwn(pilotFrameNames, value)
}

export function validPilotMatte(value: unknown): value is PilotMatteId {
  return typeof value === 'string' && Object.hasOwn(pilotMatteNames, value)
}

export function validSelectablePilotMatte(value: unknown): value is SelectablePilotMatteId {
  return typeof value === 'string' && (selectablePilotMatteIds as readonly string[]).includes(value)
}
