import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { enqueueSerializedSettingsSave } from '../app/lib/device/serialSettingsSave.mjs'

const source = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('rapid changes are saved in order, with the last selection winning', async () => {
  const tailRef = { current: Promise.resolve() }
  const saved = []
  let resolveFirst
  const firstStarted = new Promise((resolve) => {
    resolveFirst = resolve
  })
  let releaseFirst
  const firstGate = new Promise((resolve) => { releaseFirst = resolve })

  const first = enqueueSerializedSettingsSave(tailRef, async () => {
    saved.push('weather:Stavanger')
    resolveFirst()
    await firstGate
    return true
  })
  await firstStarted
  const second = enqueueSerializedSettingsSave(tailRef, async () => {
    saved.push('surf:Hellestø')
    return true
  })
  assert.deepEqual(saved, ['weather:Stavanger'])
  releaseFirst()
  assert.deepEqual(await Promise.all([first, second]), [true, true])
  assert.deepEqual(saved, ['weather:Stavanger', 'surf:Hellestø'])
})

test('a failed save never blocks the next location choice', async () => {
  const tailRef = { current: Promise.resolve() }
  const failed = enqueueSerializedSettingsSave(tailRef, async () => {
    throw new Error('Network unavailable')
  })
  await assert.rejects(failed, /Network unavailable/)
  const saved = await enqueueSerializedSettingsSave(tailRef, async () => 'surf:Hellestø')
  assert.equal(saved, 'surf:Hellestø')
})

test('Surf and Weather picker changes use the same immediate persistence path', () => {
  assert.match(source, /onLocationChanged\('surf', fixed\)/)
  assert.match(source, /onLocationChanged\('surf_forecast', nextForecast \|\| undefined\)/)
  assert.match(source, /onLocationChanged\('weather', fixed\)/)
  assert.match(source, /void enqueueSettingsSave\(deviceId, \{ modulesJson: nextModules \}\)/)
  assert.match(source, /const nextModules = normalizeModulesForSave\(\{ \.\.\.latestModulesJsonRef\.current, \[key\]: value \}\)/)
  assert.match(source, /'surf', 'weather'\]/)
})

test('location persistence does not trigger a device refresh; manual Update remains separate', () => {
  const selectionHandler = source.split('function onModuleLocationChanged(')[1]?.split('async function handlePowerSaverChange(')[0]
  assert.ok(selectionHandler, 'selection handler exists')
  assert.doesNotMatch(selectionHandler, /requestDeviceUpdate\(/)
  assert.match(source, /const saved = await enqueueSettingsSave\(deviceId\)\s+const savedAtForRevision/)
})
