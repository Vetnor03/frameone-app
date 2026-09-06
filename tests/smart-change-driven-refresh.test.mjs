import test from 'node:test'
import assert from 'node:assert/strict'
import { DEADLINE_HARD, DEADLINE_SOFT, SmartRefreshState, displayPlan, dueWork, nextWake, normalizeModule, renderHash } from '../app/lib/device/smartRefresh.mjs'

const minute = 60_000
const tile = (key, render, at = [], bounds = { x: 0, y: 0, w: 400, h: 240 }) => normalizeModule({ key, render, bounds, deadlines: at })

test('normalized hashes ignore hidden source precision and metadata', () => {
  assert.equal(renderHash({ temperature: '12°' }), renderHash({ temperature: '12°' }))
  assert.notEqual(renderHash({ temperature: '12°' }), renderHash({ temperature: '13°' }))
})

test('unchanged revision is a lightweight no-op', () => {
  const state = new SmartRefreshState({ backendRevision: 8 })
  assert.deepEqual(state.revisionResult(8, ['weather'], 10), { changed: false, affectedKeys: [] })
})

test('revision can change schedule without changing display', () => {
  const reminders = tile('reminders', ['visible'], [{ at: 60 * minute, type: DEADLINE_HARD }])
  const state = new SmartRefreshState({ backendRevision: 1, displayedHashes: { reminders: reminders.renderHash } })
  assert.deepEqual(state.revisionResult(2, ['reminders'], 0), { changed: true, affectedKeys: ['reminders'] })
  assert.equal(displayPlan(state.displayedHashes, [reminders]).type, 'none')
  assert.equal(nextWake([reminders], { now: 0, revisionCheckedAt: 0 }), 10 * minute)
})

test('earlier and later reminder deadlines are preserved and selected correctly', () => {
  const initial = tile('reminders', ['visible'], [{ at: 15 * minute, type: DEADLINE_HARD }])
  const earlier = tile('reminders', ['visible'], [{ at: 10 * minute, type: DEADLINE_HARD }, { at: 15 * minute, type: DEADLINE_HARD }])
  const later = tile('reminders', ['visible'], [{ at: 15 * minute, type: DEADLINE_HARD }, { at: 16 * minute, type: DEADLINE_HARD }])
  assert.equal(nextWake([initial], { now: 0, revisionCheckedAt: 0, revisionPollMs: 30 * minute }), 15 * minute)
  assert.equal(nextWake([earlier], { now: 0, revisionCheckedAt: 0, revisionPollMs: 30 * minute }), 10 * minute)
  assert.equal(nextWake([later], { now: 0, revisionCheckedAt: 0, revisionPollMs: 30 * minute }), 15 * minute)
  const afterFirst = tile('reminders', ['visible'], [{ at: 16 * minute, type: DEADLINE_HARD }])
  assert.equal(nextWake([afterFirst], { now: 15 * minute, revisionCheckedAt: 15 * minute }), 16 * minute)
})

test('visible reminder change is partial; invisible additions are scheduler-only', () => {
  const old = tile('reminders', ['15:00'], [], { x: 0, y: 240, w: 400, h: 240 })
  const visible = tile('reminders', ['10:00', '15:00'], [], old.bounds)
  const invisible = tile('reminders', ['15:00'], [{ at: 16 * minute, type: DEADLINE_HARD }], old.bounds)
  assert.equal(displayPlan({ reminders: old.renderHash }, [visible]).type, 'partial')
  assert.equal(displayPlan({ reminders: old.renderHash }, [invisible]).type, 'none')
})

test('one, multiple, and layout dirty plans choose partial or full correctly', () => {
  const a = tile('a', 2, [], { x: 0, y: 0, w: 200, h: 120 })
  const b = tile('b', 2, [], { x: 600, y: 360, w: 200, h: 120 })
  assert.equal(displayPlan({ a: renderHash(1) }, [a]).type, 'partial')
  assert.equal(displayPlan({ a: renderHash(1), b: renderHash(1) }, [a, b]).regions.length, 2)
  assert.equal(displayPlan({ a: a.renderHash }, [a], { layoutChanged: true }).type, 'full')
  assert.equal(displayPlan({}, [a], { panelPartialSafe: false }).type, 'full')
})

test('failed fetch and failed display preserve known-good state', () => {
  const state = new SmartRefreshState({ displayedHashes: { weather: 'old' }, sourceFreshness: { weather: 5 } })
  state.sourceFailed('weather'); state.displayFailed()
  assert.equal(state.sourceFreshness.weather, 5)
  assert.equal(state.displayedHashes.weather, 'old')
  const weather = tile('weather', 'new')
  const plan = displayPlan(state.displayedHashes, [weather])
  state.displaySucceeded(plan, [weather])
  assert.equal(state.displayedHashes.weather, weather.renderHash)
})

test('hard deadlines and nearby soft work coalesce without delaying hard work', () => {
  const modules = [
    tile('reminders', 1, [{ at: 100 * minute, type: DEADLINE_HARD }]),
    tile('weather', 1, [{ at: 107 * minute, type: DEADLINE_SOFT }]),
    tile('surf', 1, [{ at: 110 * minute, type: DEADLINE_SOFT }]),
  ]
  assert.equal(nextWake(modules, { now: 90 * minute, revisionCheckedAt: 90 * minute, revisionPollMs: 60 * minute }), 100 * minute)
  assert.deepEqual(dueWork(modules, { now: 100 * minute }).moduleKeys.sort(), ['reminders', 'surf', 'weather'])
})

test('soft work outside window stays separate and revision poll coalesces', () => {
  const modules = [tile('surf', 1, [{ at: 6 * minute, type: DEADLINE_SOFT }]), tile('weather', 1, [{ at: 22 * minute, type: DEADLINE_SOFT }])]
  const work = dueWork(modules, { now: 6 * minute, revisionCheckedAt: 0, revisionPollMs: 10 * minute })
  assert.deepEqual(work.moduleKeys, ['surf'])
  assert.equal(work.revisionPoll, true)
})

test('manual refresh checks every module and consumes nearby soft checks but redraws only dirt', () => {
  const modules = [tile('weather', 1, [{ at: 6 * minute, type: DEADLINE_SOFT }]), tile('date', 1, [{ at: 24 * 60 * minute, type: DEADLINE_HARD }])]
  const work = dueWork(modules, { now: 0, manual: true })
  assert.equal(work.screenWide, true); assert.deepEqual(work.moduleKeys, ['weather', 'date'])
  assert.equal(displayPlan(Object.fromEntries(modules.map((m) => [m.key, m.renderHash])), modules).type, 'none')
})

test('midnight is hard and reboot restores physical hashes but recalculates wake', () => {
  const date = tile('date', 'Sep 6', [{ at: 20 * minute, type: DEADLINE_HARD }])
  const saved = new SmartRefreshState({ displayedHashes: { date: date.renderHash }, revisionCheckedAt: -100 * minute }).snapshot()
  const restored = new SmartRefreshState(saved)
  assert.equal(displayPlan(restored.displayedHashes, [date]).type, 'none')
  assert.equal(nextWake([date], { now: 0, revisionCheckedAt: 0 }), 10 * minute)
})

test('display-health counters replace arbitrary elapsed-time full refreshes', () => {
  const changed = tile('weather', 2)
  assert.equal(displayPlan({}, [changed], { health: { partialCount: 20 } }).type, 'full')
})
