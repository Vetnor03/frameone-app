import assert from 'node:assert/strict'
import test from 'node:test'

import TABLES from '../app/lib/surf/waveguide_tables.json' with { type: 'json' }

const PROFILE = 'GLOBAL_CUSTOM_SPOT'

function scoreFromProfile(tableKey, value) {
  const rows = [...TABLES.spots[PROFILE][tableKey]].sort((a, b) => (a.min ?? Number.NEGATIVE_INFINITY) - (b.min ?? Number.NEGATIVE_INFINITY))
  const row = rows.find((b) => {
    const min = b.min == null ? Number.NEGATIVE_INFINITY : Number(b.min)
    const max = b.max == null ? Number.POSITIVE_INFINITY : Number(b.max)
    const minMatches = b.min_exclusive === true ? value > min : value >= min
    const maxMatches = b.max_inclusive === true ? value <= max : value < max
    return minMatches && maxMatches
  })

  assert.ok(row, `${tableKey} has a bucket for ${value}`)
  return row.score_1_6
}

function assertContinuous(tableKey) {
  const rows = [...TABLES.spots[PROFILE][tableKey]].sort((a, b) => (a.min ?? Number.NEGATIVE_INFINITY) - (b.min ?? Number.NEGATIVE_INFINITY))
  assert.equal(rows[0].min, null, `${tableKey} first bucket is open-ended below its max`)
  assert.equal(rows.at(-1).max, null, `${tableKey} final bucket is open-ended above its min`)

  for (let i = 0; i < rows.length - 1; i++) {
    assert.equal(rows[i].max, rows[i + 1].min, `${tableKey} bucket ${i} touches bucket ${i + 1} without gap or overlap`)
    assert.notEqual(rows[i].max_inclusive === true, rows[i + 1].min_exclusive !== true, `${tableKey} boundary ${rows[i].max} has exactly one inclusive side`)
  }
}

test('custom generic wave-period buckets are continuous and lower-inclusive upper-exclusive', () => {
  assertContinuous('wave_period')
  assert.equal(scoreFromProfile('wave_period', 4.5), 1)
  assert.equal(scoreFromProfile('wave_period', 4.999), 1)
  assert.equal(scoreFromProfile('wave_period', 5.0), 2)
  assert.equal(scoreFromProfile('wave_period', 6.999), 2)
  assert.equal(scoreFromProfile('wave_period', 7.0), 3)
  assert.equal(scoreFromProfile('wave_period', 13.0), 6)
})

test('custom generic wave-height buckets are continuous and lower-inclusive upper-exclusive', () => {
  assertContinuous('wave_height')
  assert.equal(scoreFromProfile('wave_height', 0.299), 1)
  assert.equal(scoreFromProfile('wave_height', 0.3), 2)
  assert.equal(scoreFromProfile('wave_height', 1.099), 3)
  assert.equal(scoreFromProfile('wave_height', 1.1), 4)
  assert.equal(scoreFromProfile('wave_height', 1.999), 5)
  assert.equal(scoreFromProfile('wave_height', 2.0), 6)
})

test('custom generic wind-speed buckets are continuous and lower-inclusive upper-exclusive', () => {
  assertContinuous('wind_speed')
  assert.equal(scoreFromProfile('wind_speed', 1.999), 6)
  assert.equal(scoreFromProfile('wind_speed', 2.0), 5)
  assert.equal(scoreFromProfile('wind_speed', 3.999), 5)
  assert.equal(scoreFromProfile('wind_speed', 4.0), 4)
  assert.equal(scoreFromProfile('wind_speed', 5.499), 4)
  assert.equal(scoreFromProfile('wind_speed', 5.5), 3)
  assert.equal(scoreFromProfile('wind_speed', 8.999), 2)
  assert.equal(scoreFromProfile('wind_speed', 9.0), 1)
})
