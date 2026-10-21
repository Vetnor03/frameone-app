export const pilotFrameNames = {
  'american-walnut': 'American Walnut',
  'dark-charcoal': 'Dark Charcoal',
  'light-oak': 'Light Oak',
} as const

export const pilotMatteNames = {
  beige: 'Beige',
  'solid-black': 'Solid Black',
  'new-castle': 'New Castle',
  sanguine: 'Sanguine',
  'midnight-blue-velour': 'Midnight Blue Velour',
  'silver-birch': 'Silver Birch',
} as const

export const limitedPilotMattes = new Set<keyof typeof pilotMatteNames>([
  'midnight-blue-velour',
  'silver-birch',
])

// Pilot invitation links use the existing, unguessable application UUID.
// The API also checks that its owner has been selected before reading or writing.
export function validPilotInvitation(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function validPilotFrame(value: unknown): value is keyof typeof pilotFrameNames {
  return typeof value === 'string' && Object.hasOwn(pilotFrameNames, value)
}

export function validPilotMatte(value: unknown): value is keyof typeof pilotMatteNames {
  return typeof value === 'string' && Object.hasOwn(pilotMatteNames, value)
}
