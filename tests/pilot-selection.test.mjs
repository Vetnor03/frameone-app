import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  limitedPilotMattes,
  pilotFrameNames,
  pilotMatteNames,
  selectablePilotMatteIds,
  validPilotFrame,
  validPilotInvitation,
  validPilotMatte,
  validSelectablePilotMatte,
} from '../app/lib/pilotSelection.ts'
import {
  pilotCombinationPhoto,
  pilotCombinationPhotos,
} from '../app/lib/pilotCombinationPhotos.ts'

test('pilot selector exposes three frames and five photographed mattes', () => {
  assert.deepEqual(Object.keys(pilotFrameNames), ['american-walnut', 'dark-charcoal', 'light-oak'])
  assert.deepEqual(selectablePilotMatteIds, ['beige', 'new-castle', 'sanguine', 'green', 'solid-black'])
  assert.deepEqual([...limitedPilotMattes], ['midnight-blue-velour', 'silver-birch'])

  // Preserve historical submitted records instead of corrupting their stored selection.
  assert.equal(pilotMatteNames['midnight-blue-velour'], 'Midnight Blue Velour')
  assert.equal(pilotMatteNames['silver-birch'], 'Silver Birch')
})

test('all 15 photographs are mapped to exact case-sensitive JPG names', () => {
  const photos = Object.values(pilotCombinationPhotos).flatMap((byMatte) => Object.values(byMatte))
  assert.equal(photos.length, 15)
  assert.equal(new Set(photos).size, 15)
  assert.ok(photos.every((path) => /^\/pilot-materials\/combinations\/(Oak|Walnut|Char)(Beige|Grey|Red|Green|Black)\.jpg$/.test(path)))
  for (const frameId of Object.keys(pilotFrameNames)) {
    for (const matteId of selectablePilotMatteIds) {
      assert.equal(pilotCombinationPhoto(frameId, matteId), pilotCombinationPhotos[frameId][matteId])
    }
  }
  assert.equal(pilotCombinationPhoto('light-oak', 'silver-birch'), null)
  assert.equal(pilotCombinationPhoto('dark-charcoal', 'midnight-blue-velour'), null)
})

test('only current matte choices may be submitted, while old selections still load', () => {
  assert.equal(validPilotFrame('light-oak'), true)
  assert.equal(validSelectablePilotMatte('beige'), true)
  assert.equal(validSelectablePilotMatte('green'), true)
  assert.equal(validSelectablePilotMatte('silver-birch'), false)
  assert.equal(validPilotMatte('silver-birch'), true)
  assert.equal(validPilotFrame('custom'), false)
  assert.equal(validPilotMatte('backup-choice'), false)
  assert.equal(validPilotFrame(null), false)
})

test('only unguessable UUID application IDs are structurally valid invites', () => {
  assert.equal(validPilotInvitation('1c616c24-1937-4880-8192-629540b65764'), true)
  assert.equal(validPilotInvitation('1C616C24-1937-4880-8192-629540B65764'), true)
  for (const input of [null, undefined, '', 'example@domain.no', 'selected', '123', '1c616c24-1937-4880-8192-629540b6576x']) {
    assert.equal(validPilotInvitation(input), false)
  }
})

test('pilot invitation becomes unusable immediately after first saved order', () => {
  const api = readFileSync(new URL('../app/api/pilot/orders/route.ts', import.meta.url), 'utf8')
  // GET must close used invitations before returning private order details.
  assert.match(api, /if \(order\) \{[\s\S]*?status: 410/)
  // POST must also reject any existing order, regardless of fulfilment status.
  assert.match(api, /if \(existingOrder\) \{[\s\S]*?status: 409/)
  // UNIQUE(email) guarantees that concurrent submissions cannot replace each other.
  assert.match(api, /\.insert\(\{/)
  assert.doesNotMatch(api, /\.upsert\(\{/)
  assert.match(api, /error\.code === '23505'/)
  assert.match(api, /\.eq\('status', 'selected'\)/)
  assert.match(api, /\.from\('pilot_confirmations'\)/)
})

test('saved pilot choices cannot be changed from the confirmation UI', () => {
  const ui = readFileSync(new URL('../app/pilot/PilotConfigurator.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(ui, /Try another combination/)
  assert.doesNotMatch(ui, /Change my selection/)
  assert.match(ui, /response\.status === 410/)
  assert.match(ui, /response\.status === 409/)
  assert.match(ui, /setSubmitted\(true\)/)
})
