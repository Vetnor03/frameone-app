import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LAUNCH_PREVIEW_PREFIX,
  LAUNCH_PREVIEW_TTL_MS,
  clearLaunchPreview,
  readLaunchPreview,
  writeLaunchPreview,
} from '../app/lib/launchPreviewCache.mjs'

const alice = 'alice-12345678'
const bob = 'bob-12345678'
const frame = 'frame-12345678'

function memoryStorage() {
  const map = new Map()
  return {
    getItem: key => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: key => map.delete(key),
  }
}

test('cached launch only stores presentation structure, never private module or integration data', () => {
  const storage = memoryStorage()
  const settings = {
    theme: 'light', powerSaver: true, language: 'no', fontSize: 'large',
    layout: 'square',
    cells: [
      { slot: 0, module: 'weather:1' },
      { slot: 1, module: 'surf:2' },
      { slot: 2, module: 'reminders' },
      { slot: 3, module: 'date' },
    ],
    pinned_tabs: ['surf', 'reminders'],
    modules: {
      integrations: { google: { accessToken: 'PRIVATE_ACCESS_TOKEN' } },
      reminders: [{ text: 'PRIVATE_REMINDER' }],
    },
    layout_module_memory: ['PRIVATE_MEMORY'],
  }
  assert.equal(writeLaunchPreview(storage, alice, frame, settings, null, 1000), true)
  const raw = storage.getItem(LAUNCH_PREVIEW_PREFIX + alice)
  assert.ok(raw)
  for (const secret of ['PRIVATE_ACCESS_TOKEN', 'PRIVATE_REMINDER', 'PRIVATE_MEMORY', '"modules"']) {
    assert.equal(raw.includes(secret), false, secret)
  }
  const restored = readLaunchPreview(storage, alice, 1100)
  assert.equal(restored.deviceId, frame)
  assert.deepEqual(restored.preview.cells.map(cell => cell.module), ['weather', 'surf', 'reminders', 'date'])
  assert.equal(restored.preview.theme, 'light')
  assert.equal(restored.preview.language, 'no')
})

test('account scopes, explicit logout, expired entries and malformed values fail closed', () => {
  const storage = memoryStorage()
  assert.equal(writeLaunchPreview(storage, alice, frame, { layout: 'default', cells: [] }, null, 1000), true)
  assert.equal(readLaunchPreview(storage, bob, 1100), null)
  assert.equal(readLaunchPreview(storage, alice, 1000 + LAUNCH_PREVIEW_TTL_MS + 1), null)
  assert.equal(readLaunchPreview(storage, alice, 1000 - 60001), null)
  storage.setItem(LAUNCH_PREVIEW_PREFIX + bob, '{broken json')
  assert.equal(readLaunchPreview(storage, bob, 1100), null)
  clearLaunchPreview(storage, alice)
  assert.equal(readLaunchPreview(storage, alice, 1100), null)
})

test('custom layout is restored with valid geometry but not persisted secrets', () => {
  const storage = memoryStorage()
  const customLayout = {
    id: 'custom-12345678', name: 'Evening', deviceId: frame, ownerUserId: alice,
    cells: [{ slot: 0, col: 0, row: 0, colSpan: 4, rowSpan: 2 }],
    sortOrder: 2, privateField: 'SECRET',
  }
  const settings = {
    layout: 'custom', custom_layout_id: customLayout.id,
    cells: [{ slot: 0, col: 0, row: 0, colSpan: 4, rowSpan: 2, module: 'countdown' }],
  }
  assert.equal(writeLaunchPreview(storage, alice, frame, settings, customLayout, 1000), true)
  const raw = storage.getItem(LAUNCH_PREVIEW_PREFIX + alice)
  assert.equal(raw.includes('SECRET'), false)
  const restored = readLaunchPreview(storage, alice, 1100)
  assert.equal(restored.preview.layout, 'custom')
  assert.equal(restored.preview.customLayout.id, customLayout.id)
  assert.deepEqual(restored.preview.customLayout.cells, customLayout.cells)
  assert.equal(restored.preview.cells[0].module, 'countdown')
})

test('missing custom geometry safely falls back to a built-in preview', () => {
  const storage = memoryStorage()
  assert.equal(writeLaunchPreview(storage, alice, frame, { layout: 'custom', custom_layout_id: 'custom-12345678', cells: [] }, null, 1000), true)
  const restored = readLaunchPreview(storage, alice, 1100)
  assert.equal(restored.preview.layout, 'default')
  assert.equal(restored.preview.customLayout, null)
})

test('storage failures do not prevent launching the app', () => {
  const blocked = {
    getItem() { throw new Error('Denied') },
    setItem() { throw new Error('Denied') },
    removeItem() { throw new Error('Denied') },
  }
  assert.equal(readLaunchPreview(blocked, alice), null)
  assert.equal(writeLaunchPreview(blocked, alice, frame, { layout: 'default' }), false)
  assert.doesNotThrow(() => clearLaunchPreview(blocked, alice))
})
