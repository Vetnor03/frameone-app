import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeCustomDirectionSector } from '../app/lib/surf/customSpotScoring.ts'

test('custom direction sector scores best as 6, fades inside wraparound sector, and scores outside as 1', () => {
  const sector = normalizeCustomDirectionSector({ startDeg: 315, endDeg: 45, mainDeg: 0 })

  assert.equal(sector?.startDeg, 315)
  assert.equal(sector?.endDeg, 45)
  assert.equal(sector?.mainDeg, 0)

  const scoreAt = (deg) => sector?.table.find((row) => row.dir_from_deg === deg)?.score_1_6

  assert.equal(scoreAt(0), 6)
  assert.equal(scoreAt(180), 1)
  assert.ok((scoreAt(350) ?? 0) > (scoreAt(315) ?? 0))
  assert.equal(scoreAt(315), 1)
})

test('custom direction sector clamps best direction to selected sector', () => {
  const sector = normalizeCustomDirectionSector({ startDeg: 90, endDeg: 180, mainDeg: 270 })

  assert.equal(sector?.mainDeg, 180)
})
