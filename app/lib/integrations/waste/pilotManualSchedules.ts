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
export type PilotWasteFraction = 'restavfall' | 'matavfall' | 'papir' | 'plast' | 'glass_metall' | 'hazardous'
export type PilotWastePickup = {
  date: string
  fractions: readonly PilotWasteFraction[]
  /** Starred in the source table; the explanatory footnote was not visible. */
  starred?: true
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
  {
    key: 'fredrikstad-rodsmyraskogen-21',
    address: {
      streetName: 'Rødsmyraskogen',
      houseNumber: '21',
      postalCode: '1671',
      postalPlace: 'Kråkerøy',
    },
    source: 'Fredrikstad kommune – renovasjonskalender 2026 (fredrikstad.kommune.no), screenshot page 2 of 2',
    transcribedOn: '2026-11-17',
    lastProvidedPickup: '2026-12-23',
    // Only November–December dates are needed for this pilot snapshot.
    // Starred hazardous/small-electronics days require the source footnote
    // before they are treated as ordinary kerbside collection reminders.
    pickups: [
      { date: '2026-11-04', fractions: ['restavfall'] },
      { date: '2026-11-09', fractions: ['papir', 'plast'] },
      { date: '2026-11-10', fractions: ['hazardous'], starred: true },
      { date: '2026-11-11', fractions: ['matavfall'] },
      { date: '2026-11-18', fractions: ['restavfall'] },
      { date: '2026-11-24', fractions: ['hazardous'], starred: true },
      { date: '2026-11-25', fractions: ['matavfall'] },
      { date: '2026-12-02', fractions: ['restavfall'] },
      { date: '2026-12-07', fractions: ['papir', 'plast', 'glass_metall'] },
      { date: '2026-12-08', fractions: ['hazardous'], starred: true },
      { date: '2026-12-09', fractions: ['matavfall'] },
      { date: '2026-12-16', fractions: ['restavfall'] },
      { date: '2026-12-23', fractions: ['matavfall'] },
    ],
  },
  {
    key: 'alesund-hatlen-55b',
    address: {
      streetName: 'Hatlen',
      houseNumber: '55B',
      postalCode: '6016',
      postalPlace: 'Ålesund',
    },
    source: 'Renovasjonstømmekalender for Hatlen 55B – screenshot supplied during pilot (November 2026–February 2027)',
    transcribedOn: '2026-11-17',
    lastProvidedPickup: '2027-02-24',
    // Dates are transcribed exactly from the supplied timetable.
    // Do not extrapolate schedules from the observed fortnightly pattern.
    pickups: [
      { date: '2026-11-18', fractions: ['matavfall'] },
      { date: '2026-11-25', fractions: ['restavfall'] },
      { date: '2026-11-30', fractions: ['papir', 'plast'] },
      { date: '2026-12-02', fractions: ['matavfall'] },
      { date: '2026-12-09', fractions: ['restavfall'] },
      { date: '2026-12-16', fractions: ['matavfall'] },
      { date: '2026-12-21', fractions: ['restavfall'] },
      { date: '2026-12-30', fractions: ['matavfall'] },
      { date: '2027-01-04', fractions: ['papir', 'plast'] },
      { date: '2027-01-06', fractions: ['restavfall'] },
      { date: '2027-01-11', fractions: ['glass_metall'] },
      { date: '2027-01-13', fractions: ['matavfall'] },
      { date: '2027-01-20', fractions: ['restavfall'] },
      { date: '2027-01-27', fractions: ['matavfall'] },
      { date: '2027-02-01', fractions: ['papir', 'plast'] },
      { date: '2027-02-03', fractions: ['restavfall'] },
      { date: '2027-02-10', fractions: ['matavfall'] },
      { date: '2027-02-17', fractions: ['restavfall'] },
      { date: '2027-02-24', fractions: ['matavfall'] },
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
