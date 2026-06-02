import assert from 'node:assert/strict'
import test from 'node:test'

import TABLES from '../app/lib/surf/waveguide_tables.json' with { type: 'json' }
import { rangeBucketMatches } from '../app/lib/surf/rangeBuckets.ts'

const PROFILE = 'GLOBAL_CUSTOM_SPOT'

function scoreFromProfile(tableKey, value) {
  const rows = [...TABLES.spots[PROFILE][tableKey]].sort((a, b) => (a.min ?? Number.NEGATIVE_INFINITY) - (b.min ?? Number.NEGATIVE_INFINITY))
  const row = rows.find((b) => {
    return rangeBucketMatches(b, value, { upperExclusive: true })
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
  assert.equal(scoreFromProfile('wave_period', 0), 1)
  assert.equal(scoreFromProfile('wave_period', 4.9), 1)
  assert.equal(scoreFromProfile('wave_period', 4.999), 1)
  assert.equal(scoreFromProfile('wave_period', 5.0), 2)
  assert.equal(scoreFromProfile('wave_period', 6.999), 2)
  assert.equal(scoreFromProfile('wave_period', 7.0), 3)
  assert.equal(scoreFromProfile('wave_period', 13.0), 6)
  assert.equal(scoreFromProfile('wave_period', 20.0), 6)
})

test('custom generic wave-height buckets are continuous and lower-inclusive upper-exclusive', () => {
  assertContinuous('wave_height')
  assert.equal(scoreFromProfile('wave_height', 0), 1)
  assert.equal(scoreFromProfile('wave_height', 0.22), 1)
  assert.equal(scoreFromProfile('wave_height', 0.26), 1)
  assert.equal(scoreFromProfile('wave_height', 0.28), 1)
  assert.equal(scoreFromProfile('wave_height', 0.299), 1)
  assert.equal(scoreFromProfile('wave_height', 0.3), 2)
  assert.equal(scoreFromProfile('wave_height', 1.099), 3)
  assert.equal(scoreFromProfile('wave_height', 1.1), 4)
  assert.equal(scoreFromProfile('wave_height', 1.999), 5)
  assert.equal(scoreFromProfile('wave_height', 2.0), 6)
  assert.equal(scoreFromProfile('wave_height', 3.0), 6)
})

test('custom generic wind-speed buckets are continuous and lower-inclusive upper-exclusive', () => {
  assertContinuous('wind_speed')
  assert.equal(scoreFromProfile('wind_speed', 0), 6)
  assert.equal(scoreFromProfile('wind_speed', 1.999), 6)
  assert.equal(scoreFromProfile('wind_speed', 2.0), 5)
  assert.equal(scoreFromProfile('wind_speed', 3.999), 5)
  assert.equal(scoreFromProfile('wind_speed', 4.0), 4)
  assert.equal(scoreFromProfile('wind_speed', 5.499), 4)
  assert.equal(scoreFromProfile('wind_speed', 5.5), 3)
  assert.equal(scoreFromProfile('wind_speed', 8.999), 2)
  assert.equal(scoreFromProfile('wind_speed', 9.0), 1)
  assert.equal(scoreFromProfile('wind_speed', 12.0), 1)
})

test('range bucket matcher supports explicit open-ended bounds', () => {
  assert.equal(rangeBucketMatches({ min: null, max: 5 }, 4.9, { upperExclusive: true }), true)
  assert.equal(rangeBucketMatches({ min: null, max: 5 }, 5, { upperExclusive: true }), false)
  assert.equal(rangeBucketMatches({ min: 13, max: null }, 20, { upperExclusive: true }), true)
  assert.equal(rangeBucketMatches({ min: 'open', max: 0.3 }, 0.22, { upperExclusive: true }), true)
  assert.equal(rangeBucketMatches({ min: '-Infinity', max: 2 }, 0, { upperExclusive: true }), true)
})
