import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveDynamicModuleKeys, readPinnedModuleTabs, writePinnedModuleTabs, togglePinnedModuleTab } from '../app/lib/dynamicModuleTabs.mjs'

function memoryStorage() {
  const data = new Map()
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }
}

test('explicit unpin-all survives reload and does not fall back to old server pins', () => {
  const storage = memoryStorage()
  const fallback = ['weather']
  assert.deepEqual(readPinnedModuleTabs(storage, 'user', 'frame') ?? fallback, fallback)
  assert.equal(writePinnedModuleTabs(storage, 'user', 'frame', []), true)
  assert.deepEqual(readPinnedModuleTabs(storage, 'user', 'frame') ?? fallback, [])
})

test('pin preferences are scoped by account and frame', () => {
  const storage = memoryStorage()
  writePinnedModuleTabs(storage, 'user-a', 'frame-a', ['weather'])
  assert.deepEqual(readPinnedModuleTabs(storage, 'user-a', 'frame-a'), ['weather'])
  assert.equal(readPinnedModuleTabs(storage, 'user-b', 'frame-a'), null)
  assert.equal(readPinnedModuleTabs(storage, 'user-a', 'frame-b'), null)
})

test('rapid pin and unpin choices are deterministic and preserve the other pins', () => {
  let pins = ['weather']
  pins = togglePinnedModuleTab(pins, 'surf')
  pins = togglePinnedModuleTab(pins, 'weather')
  pins = togglePinnedModuleTab(pins, 'surf')
  assert.deepEqual(pins, [])
  assert.deepEqual(togglePinnedModuleTab(['weather', 'weather'], 'surf'), ['weather', 'surf'])
})

test('unpin removes an inactive tab, but active layout modules remain available', () => {
  const layout = { 0: 'date', 1: 'reminders', 2: 'weather' }
  const pinned = ['surf', 'weather', 'surf']
  assert.deepEqual(deriveDynamicModuleKeys(layout, pinned), ['weather', 'reminders', 'surf'])
  assert.deepEqual(deriveDynamicModuleKeys(layout, togglePinnedModuleTab(pinned, 'surf')), ['weather', 'reminders'])
  assert.deepEqual(deriveDynamicModuleKeys(layout, []), ['reminders', 'weather'])
})

test('unavailable or malformed storage safely falls back to server state', () => {
  const storage = { getItem: () => 'not json', setItem: () => { throw new Error('denied') } }
  assert.equal(readPinnedModuleTabs(storage, 'user', 'frame'), null)
  assert.equal(writePinnedModuleTabs(storage, 'user', 'frame', ['surf']), false)
  const memory = memoryStorage()
  writePinnedModuleTabs(memory, 'user', 'frame', ['date', 'invalid', 'surf', 'surf'])
  assert.deepEqual(readPinnedModuleTabs(memory, 'user', 'frame'), ['surf'])
})
