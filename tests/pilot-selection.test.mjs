import test from 'node:test'
import assert from 'node:assert/strict'
import {
  limitedPilotMattes,
  pilotFrameNames,
  pilotMatteNames,
  validPilotFrame,
  validPilotInvitation,
  validPilotMatte,
} from '../app/lib/pilotSelection.ts'

test('pilot selector contains exactly the agreed three frames and six mattes', () => {
  assert.deepEqual(Object.keys(pilotFrameNames), ['american-walnut', 'dark-charcoal', 'light-oak'])
  assert.deepEqual(Object.keys(pilotMatteNames), [
    'beige', 'solid-black', 'new-castle', 'sanguine', 'midnight-blue-velour', 'silver-birch',
  ])
  assert.deepEqual([...limitedPilotMattes], ['midnight-blue-velour', 'silver-birch'])
})

test('frame and matte choices must be explicitly allowed', () => {
  assert.equal(validPilotFrame('light-oak'), true)
  assert.equal(validPilotMatte('beige'), true)
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
