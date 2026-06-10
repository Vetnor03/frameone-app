import assert from 'node:assert/strict'
import test from 'node:test'

import TABLES from '../app/lib/surf/waveguide_tables.json' with { type: 'json' }

function fixMojibake(value) {
  const text = String(value ?? '')
  if (!/[ÃÂ]/.test(text)) return text
  try {
    return Buffer.from(text, 'latin1').toString('utf8')
  } catch {
    return text
  }
}

const hellestoKey = Object.keys(TABLES.spots).find((key) => fixMojibake(key) === 'Hellestø')
assert.ok(hellestoKey, 'Hellestø table exists')
const HELLESTO = TABLES.spots[hellestoKey]

function rangeScore(tableKey, value) {
  const rows = [...HELLESTO[tableKey]].sort((a, b) => Number(a.min ?? Number.NEGATIVE_INFINITY) - Number(b.min ?? Number.NEGATIVE_INFINITY))
  for (const row of rows) {
    const min = row.min == null ? Number.NEGATIVE_INFINITY : Number(row.min)
    const max = row.max == null ? Number.POSITIVE_INFINITY : Number(row.max)
    if (value >= min && value <= max) return row.score_1_6
  }
  const next = rows.find((row) => Number.isFinite(Number(row.min)) && value <= Number(row.min))
  return (next ?? rows.at(-1)).score_1_6
}

function dirScore(tableKey, label) {
  const row = HELLESTO[tableKey].find((entry) => entry.label === label)
  assert.ok(row, `${tableKey} ${label} exists`)
  return row.score_1_6
}

function ratingFromTotal(total) {
  const label = TABLES.score_to_label.find((row) => total >= row.min && total <= row.max)?.label ?? 'Flat'
  if (label === 'Flat') return 1
  if (label === 'Poor') return 2
  if (label === 'Poor to fair') return 3
  if (label === 'Fair') return 4
  if (label === 'Go surf!') return 6
  return 1
}

function modelRating({ waveDir, height, period, windSpeed, windDir }) {
  const w = TABLES.weights
  const total =
    dirScore('wave_dir', waveDir) * w.wave_dir +
    rangeScore('wave_height', height) * w.wave_height +
    rangeScore('wave_period', period) * w.wave_period +
    rangeScore('wind_speed', windSpeed) * w.wind_speed +
    dirScore('wind_dir', windDir) * w.wind_dir +
    w.base
  return { total, rating: ratingFromTotal(total) }
}

test('Hellestø 6s wind swell only becomes yellow with genuinely good direction and wind', () => {
  assert.equal(rangeScore('wave_period', 6), 2)

  const perfect = modelRating({ waveDir: 'NW', height: 0.8, period: 6, windSpeed: 3, windDir: 'E' })
  assert.equal(perfect.rating, 3)

  const lessAligned = modelRating({ waveDir: 'W', height: 0.8, period: 6, windSpeed: 3, windDir: 'E' })
  assert.equal(lessAligned.rating, 2)
})

test('Hellestø 7-8 m/s wind requires favorable direction to stay maybe okay', () => {
  assert.equal(rangeScore('wind_speed', 8), 2)

  const favorable = modelRating({ waveDir: 'NW', height: 1.2, period: 7, windSpeed: 8, windDir: 'E' })
  assert.equal(favorable.rating, 3)

  const badDirection = modelRating({ waveDir: 'NW', height: 1.2, period: 7, windSpeed: 8, windDir: 'W' })
  assert.equal(badDirection.rating, 2)
})
