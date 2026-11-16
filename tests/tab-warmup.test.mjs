import test from 'node:test'
import assert from 'node:assert/strict'
import { appendCachedModuleTab, planModuleTabWarmup, tabCacheScope } from '../app/lib/tabWarmup.mjs'

test('only configured module tabs are warmed, never settings, connect or assistant', () => {
  assert.deepEqual(
    planModuleTabWarmup(['frame','weather','groceries','reminders','news','connect','settings','assistant']),
    ['weather','groceries','reminders','news'],
  )
})

test('active and previously cached tabs are not redundantly warmed', () => {
  assert.deepEqual(
    planModuleTabWarmup(['frame','weather','surf','surf','countdown'], ['weather'], 'countdown'),
    ['surf'],
  )
})

test('module tab cache never crosses account or device scope', () => {
  const alice = tabCacheScope('user-a','device-1')
  const bob = tabCacheScope('user-b','device-1')
  const nextFrame = tabCacheScope('user-a','device-2')
  assert.notEqual(alice, bob)
  assert.notEqual(alice, nextFrame)
  const first = appendCachedModuleTab({scope:'',keys:[]}, alice, 'groceries')
  assert.deepEqual(first.keys, ['groceries'])
  assert.equal(appendCachedModuleTab(first, alice, 'groceries'), first)
  const second = appendCachedModuleTab(first, nextFrame, 'reminders')
  assert.deepEqual(second.keys, ['reminders'])
  assert.deepEqual(appendCachedModuleTab(second, nextFrame, 'connect'), second)
  assert.deepEqual(appendCachedModuleTab(second, '', 'weather'), second)
})
