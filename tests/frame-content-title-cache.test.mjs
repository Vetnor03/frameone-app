import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearFrameTitleL1CacheForTests, deriveReminderDisplayProfile, frameTitleCacheKey,
  optimizeFrameContent, PHYSICAL_AI_TIMEOUT_MS,
} from '../app/lib/frameContentOptimizer.ts'

const originalFetch = globalThis.fetch
const originalKey = process.env.OPENAI_API_KEY
process.env.OPENAI_API_KEY = 'test-key'

function cache() {
  const rows = new Map()
  return { rows, reads: 0, writes: 0,
    async read(keys) { this.reads++; return keys.flatMap(cache_key => rows.has(cache_key) ? [{ cache_key, optimized_title: rows.get(cache_key) }] : []) },
    async write(batch) { this.writes++; for (const row of batch) if (!rows.has(row.cache_key)) rows.set(row.cache_key, row.optimized_title) },
  }
}
function ai(counter, title = 'Stable optimized title') {
  globalThis.fetch = async (_url, init) => {
    counter.calls++
    const body = JSON.parse(init.body)
    const supplied = JSON.parse(body.input[1].content[0].text).items
    return { ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ items: supplied.map(item => ({ id: item.id, title })) }) }] }] }) }
  }
}
const item = (title = 'A source reminder', extra = {}) => ({ id: 'visible-id', title, source: 'remind', contentType: 'reminder', ...extra })

test('durable cache survives an empty L1 and ignores display metadata', async () => {
  clearFrameTitleL1CacheForTests()
  const persistentCache = cache(), counter = { calls: 0 }; ai(counter)
  const first = await optimizeFrameContent([item()], { displayProfile: 'standard', persistentCache })
  assert.equal(counter.calls, 1); assert.equal(persistentCache.writes, 1)
  clearFrameTitleL1CacheForTests()
  const second = await optimizeFrameContent([item('A source reminder', { displayDate: 'Tomorrow', displayTime: '12:00' })], { displayProfile: 'standard', persistentCache })
  assert.deepEqual(second, first); assert.equal(counter.calls, 1)
})

test('source and meaningful profile changes create one variant; equivalent geometry does not', async () => {
  clearFrameTitleL1CacheForTests()
  const persistentCache = cache(), counter = { calls: 0 }; ai(counter)
  assert.equal(deriveReminderDisplayProfile({ usableWidth: 398, maxLines: 2 }), deriveReminderDisplayProfile({ usableWidth: 402, maxLines: 2 }))
  await optimizeFrameContent([item()], { displayProfile: 'standard', persistentCache })
  await optimizeFrameContent([item()], { displayProfile: 'compact', persistentCache })
  await optimizeFrameContent([item()], { displayProfile: 'standard', persistentCache })
  await optimizeFrameContent([item('Changed source')], { displayProfile: 'standard', persistentCache })
  assert.equal(counter.calls, 3)
  assert.notEqual(frameTitleCacheKey(item(), 'standard'), frameTitleCacheKey(item(), 'compact'))
})

test('duplicate missing variants are optimized once in one batch', async () => {
  clearFrameTitleL1CacheForTests()
  const persistentCache = cache(), counter = { calls: 0 }; ai(counter)
  const output = await optimizeFrameContent([{ ...item(), id: 'a' }, { ...item(), id: 'b' }], { displayProfile: 'standard', persistentCache })
  assert.equal(counter.calls, 1); assert.equal(persistentCache.rows.size, 1); assert.equal(output[0].title, output[1].title)
})

test('AI failure is deterministic and does not fail rendering', async () => {
  clearFrameTitleL1CacheForTests(); globalThis.fetch = async () => { throw new Error('offline') }
  const output = await optimizeFrameContent([item('This title is deliberately much longer than the compact display capacity allows')], { displayProfile: 'compact', persistentCache: cache() })
  assert.ok(output[0].title.length <= 28)
})

test('physical AI budget is deliberately far below the former five seconds', () => assert.ok(PHYSICAL_AI_TIMEOUT_MS <= 300))

test.after(() => { globalThis.fetch = originalFetch; process.env.OPENAI_API_KEY = originalKey })
