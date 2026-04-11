// app/lib/surf/spots.ts
export type SurfSpot = {
  spotId: string
  label: string

  // Surf forecast point (can be offshore)
  lat: number
  lon: number

  // Optional drive access point (parking/road). Used for fuel penalty routing.
  // If not set, routing falls back to lat/lon.
  driveLat?: number
  driveLon?: number
}

export const SURF_SPOTS: Record<string, SurfSpot> = {
  // ✅ virtual spot (handled specially by scoring/rendering)
  todays_best: { spotId: '__todays_best__', label: "Today's Best", lat: 0, lon: 0 },

  // ✅ Stavanger / Jæren (forecast coords)
  hellesto: {
    spotId: 'hellesto',
    label: 'Hellestø',
    lat: 58.964,
    lon: 5.605,
    // drive access (parking/road)
    driveLat: 58.8430842,
    driveLon: 5.5655364,
  },

  bore: {
    spotId: 'bore',
    label: 'Bore',
    lat: 58.779,
    lon: 5.509,
    // drive access (parking/road)
    driveLat: 58.7988241,
    driveLon: 5.5536261,
  },

  orrepointet: {
    spotId: 'orrepointet',
    label: 'Orrepointet',
    lat: 58.713,
    lon: 5.498,
    // drive access (parking/road)
    driveLat: 58.7545362,
    driveLon: 5.5100315,
  },

  byberg: {
    spotId: 'byberg',
    label: 'Byberg',
    lat: 58.807,
    lon: 5.548,
    // drive access (parking/road)
    driveLat: 58.8330109,
    driveLon: 5.5555003,
  },

  sola_point_seldom: {
    spotId: 'sola_point_seldom',
    label: 'Sola (Point Seldom)',
    lat: 58.877,
    lon: 5.585,
    // drive access (parking/road)
    driveLat: 58.8753504,
    driveLon: 5.5968029,
  },

  sele: {
    spotId: 'sele',
    label: 'Sele',
    lat: 58.816,
    lon: 5.542,
    // drive access (parking/road)
    driveLat: 58.8135521,
    driveLon: 5.5481876,
  },

  vigdel: {
    spotId: 'vigdel',
    label: 'Vigdel',
    lat: 58.892,
    lon: 5.556,
    // drive access (parking/road)
    driveLat: 58.8597749,
    driveLon: 5.5644059,
  },

  steinen: {
    spotId: 'steinen',
    label: 'Steinen',
    lat: 58.850,
    lon: 5.532,
    // drive access (parking/road)
    driveLat: 58.7781379,
    driveLon: 5.5415243,
  },

  toveisbukta: {
    spotId: 'toveisbukta',
    label: 'Toveisbukta',
    lat: 58.864,
    lon: 5.528,
    // drive access (parking/road)
    driveLat: 58.7781379,
    driveLon: 5.5415243,
  },

  svinestien: {
    spotId: 'svinestien',
    label: 'Svinestien',
    lat: 58.857,
    lon: 5.520,
    // drive access (parking/road)
    driveLat: 58.770083,
    driveLon: 5.5153094,
  },

  reve_havn: {
    spotId: 'reve_havn',
    label: 'Reve Havn',
    lat: 58.733,
    lon: 5.512,
    // drive access (parking/road)
    driveLat: 58.770083,
    driveLon: 5.5153094,
  },

  ghost: {
    spotId: 'ghost',
    label: 'Ghost',
    lat: 58.740,
    lon: 5.505,
    // drive access (parking/road)
    driveLat: 58.770083,
    driveLon: 5.5153094,
  },

  orre: {
    spotId: 'orre',
    label: 'Orre',
    lat: 58.744,
    lon: 5.508,
    // drive access (parking/road)
    driveLat: 58.7404668,
    driveLon: 5.5183768,
  },

  point_perfect: {
    spotId: 'point_perfect',
    label: 'Point perfect',
    lat: 58.726,
    lon: 5.5,
    // drive access (parking/road)
    driveLat: 58.7404668,
    driveLon: 5.5183768,
  },

  refsnes: {
    spotId: 'refsnes',
    label: 'Refsnes',
    lat: 58.72,
    lon: 5.492,
    // drive access (parking/road)
    driveLat: 58.6864502,
    driveLon: 5.5558168,
  },

  prestegarden: {
    spotId: 'prestegarden',
    label: 'Prestegården',
    lat: 58.701,
    lon: 5.463,
    // drive access (parking/road)
    driveLat: 58.6665079,
    driveLon: 5.5512657,
  },

  kvassheim: {
    spotId: 'kvassheim',
    label: 'Kvassheim',
    lat: 58.657,
    lon: 5.411,
    // drive access (parking/road)
    driveLat: 58.5452174,
    driveLon: 5.6811299,
  },

  bolten: {
    spotId: 'bolten',
    label: 'Bolten',
    lat: 58.649,
    lon: 5.395,
    // drive access (parking/road)
    driveLat: 58.5411666,
    driveLon: 5.730219,
  },

  brusand: {
    spotId: 'brusand',
    label: 'Brusand',
    lat: 58.518,
    lon: 5.774,
    // drive access (parking/road)
    driveLat: 58.5411666,
    driveLon: 5.730219,
  },
}

// Find by label (case-insensitive, handles æøå)
export function findSpotByLabel(label: string | null | undefined): SurfSpot | null {
  const q = String(label ?? '').trim()
  if (!q) return null
  const ql = q.toLowerCase()

  for (const s of Object.values(SURF_SPOTS)) {
    if (s.label.toLowerCase() === ql) return s
  }
  return null
}

// Best-effort stable id for a label (for auto-migrations)
export function spotIdFromLabel(label: string | null | undefined): string | null {
  const s = findSpotByLabel(label)
  return s ? s.spotId : null
}