/**
 * Manual pilot-only waste pickup schedules.
 *
 * These are EXACT dates taken from the named provider's timetable, not a repeating
 * prediction or an iCal integration. No live update occurs and no future dates
 * may be inferred. Associate with the matching pilot account/frame only once it
 * has been paired and its address has been verified.
 *
 * Never import this module into client-side components: manual pilot data must be
 * delivered to the intended frame only.
 */
export type PilotWasteFraction = 'restavfall' | 'matavfall' | 'papir' | 'plast' | 'glass_metall'
export type PilotWastePickup = {
  date: string
  fractions: readonly PilotWasteFraction[]
}

export type PilotWasteSchedule = {
  key: string
  address: {
    streetName: string
    houseNumber: string
    postalCode: string
    postalPlace: string
  }
  source: string
  transcribedOn: string
  lastProvidedPickup: string
  pickups: readonly PilotWastePickup[]
}

export const PILOT_WASTE_SCHEDULES: readonly PilotWasteSchedule[] = [
  {
    key: 'trondheim-haldor-flatens-veg-27',
    address: {
      streetName: 'Haldor Flatens veg',
      houseNumber: '27',
      postalCode: '7081',
      postalPlace: 'Sjetnmarka',
    },
    source: 'Trondheim Renholdsverk – tømmekalender (trv.no), screenshot provided for this address',
    transcribedOn: '2026-11-17',
    lastProvidedPickup: '2027-01-04',
    pickups: [
      { date: '2026-11-03', fractions: ['restavfall', 'matavfall'] },
      { date: '2026-11-17', fractions: ['matavfall', 'papir'] },
      { date: '2026-12-01', fractions: ['restavfall', 'matavfall'] },
      { date: '2026-12-08', fractions: ['plast', 'glass_metall'] },
      { date: '2026-12-15', fractions: ['matavfall', 'papir'] },
      { date: '2027-01-04', fractions: ['restavfall', 'matavfall'] },
    ],
  },
]

/**
 * Prefer a complete, exact street address; never use a fuzzy match or just
 * postal code/municipality to assign a family's collection calendar.
 */
const normalized = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('nb-NO')

export function pilotWasteScheduleForAddress(streetName: string, houseNumber: string, postalCode: string): PilotWasteSchedule | null {
  return PILOT_WASTE_SCHEDULES.find((schedule) =>
    normalized(schedule.address.streetName) === normalized(streetName) &&
    normalized(schedule.address.houseNumber) === normalized(houseNumber) &&
    normalized(schedule.address.postalCode) === normalized(postalCode)
  ) || null
}
