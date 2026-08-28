import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { deriveDynamicModuleKeys } from '../app/lib/dynamicModuleTabs.mjs'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('displayed layout selects the authoritative assignments for module tabs', () => {
  assert.match(
    home,
    /const activeLayoutModules = activeCustomLayoutId\s*\? customAssignments\[activeCustomLayoutId\]\s*: cellsByLayout\[layoutKey\]/,
  )
  assert.match(
    home,
    /\[activeCustomLayoutId, cellsByLayout, customAssignments, language, layoutKey, pinnedModuleTabs\]/,
  )
})

test('built-in layout tabs derive from the selected built-in cells', () => {
  const cellsByLayout = { default: { 0: 'date', 1: 'weather' }, square: { 0: 'surf' } }
  assert.deepEqual(deriveDynamicModuleKeys(cellsByLayout.square, []), ['surf'])
})

test('custom assignments ignore a stale built-in layout and omit Date and empty cells', () => {
  const staleBuiltIn = { 0: 'stocks', 1: 'soccer' }
  const custom = { 0: 'date', 1: null, 2: 'weather', 3: 'reminders', 4: null }

  assert.deepEqual(deriveDynamicModuleKeys(custom, []), ['weather', 'reminders'])
  assert.notDeepEqual(deriveDynamicModuleKeys(custom, []), deriveDynamicModuleKeys(staleBuiltIn, []))
})

test('custom assignment changes immediately add, replace, and clear tabs', () => {
  const initial = { 0: 'weather', 1: null }
  const assigned = { ...initial, 1: 'countdown' }
  const replaced = { ...assigned, 0: 'reminders' }
  const cleared = { ...replaced, 1: null }

  assert.deepEqual(deriveDynamicModuleKeys(assigned, []), ['weather', 'countdown'])
  assert.deepEqual(deriveDynamicModuleKeys(replaced, []), ['reminders', 'countdown'])
  assert.deepEqual(deriveDynamicModuleKeys(cleared, []), ['reminders'])
  assert.deepEqual(deriveDynamicModuleKeys(cleared, ['countdown']), ['reminders', 'countdown'])
})

test('switching custom layouts and returning to built-in changes module tabs', () => {
  const firstCustom = { 0: 'weather' }
  const secondCustom = { 0: 'reminders', 1: 'countdown' }
  const builtIn = { 0: 'date', 1: 'surf' }

  assert.deepEqual(deriveDynamicModuleKeys(firstCustom, []), ['weather'])
  assert.deepEqual(deriveDynamicModuleKeys(secondCustom, []), ['reminders', 'countdown'])
  assert.deepEqual(deriveDynamicModuleKeys(builtIn, []), ['surf'])
})

test('duplicate assignments produce one tab', () => {
  assert.deepEqual(deriveDynamicModuleKeys({ 0: 'weather', 1: 'weather', 2: 'date' }, []), ['weather'])
})

test('pinned active modules lead active unpinned modules and pinned inactive modules follow', () => {
  const assignments = { 0: 'weather', 1: 'reminders' }
  assert.deepEqual(
    deriveDynamicModuleKeys(assignments, ['reminders', 'countdown', 'date']),
    ['reminders', 'weather', 'countdown'],
  )
})
