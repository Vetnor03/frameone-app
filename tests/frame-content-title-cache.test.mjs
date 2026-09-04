import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearFrameTitleInflightForTests, clearFrameTitleL1CacheForTests, deriveReminderDisplayProfile, frameTitleCacheKey,
  optimizeFrameContent, PHYSICAL_AI_TIMEOUT_MS, FRAME_TITLE_OPTIMIZER_VERSION,
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
  assert.equal(deriveReminderDisplayProfile({ usableWidth: 800, maxLines: 1 }), 'compact')
  assert.equal(deriveReminderDisplayProfile({ usableWidth: 400, maxLines: 2 }), 'standard')
  assert.equal(deriveReminderDisplayProfile({ usableWidth: 600, maxLines: 3 }), 'spacious')
  await optimizeFrameContent([item()], { displayProfile: 'standard', persistentCache })
  await optimizeFrameContent([item()], { displayProfile: 'compact', persistentCache })
  await optimizeFrameContent([item()], { displayProfile: 'standard', persistentCache })
  await optimizeFrameContent([item('Changed source')], { displayProfile: 'standard', persistentCache })
  assert.equal(counter.calls, 3)
  assert.notEqual(frameTitleCacheKey(item(), 'standard'), frameTitleCacheKey(item(), 'compact'))
})

test('source language wins and ambiguous titles receive the explicit UI fallback', async () => {
  clearFrameTitleL1CacheForTests(); clearFrameTitleInflightForTests()
  const persistentCache=cache(),requests=[]
  globalThis.fetch=async(_url,init)=>{
    const body=JSON.parse(init.body),payload=JSON.parse(body.input[1].content[0].text);requests.push(payload)
    const outputs=payload.items.map(value=>({id:value.id,title:/møte|tannlegen/i.test(value.title)?'Tannlegetime':/dinner|tomorrow/i.test(value.title)?'Dinner with Sarah':payload.uiLanguage==='no'?'Ukjent emne':'Unknown topic'}))
    return {ok:true,json:async()=>({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({items:outputs})}]}]})}
  }
  const run=(title,uiLanguage)=>optimizeFrameContent([item(title)],{displayProfile:'standard',uiLanguage,persistentCache})
  assert.equal((await run('Møte med tannlegen i morgen klokken 14','en'))[0].title,'Tannlegetime')
  assert.equal((await run('Dinner with Sarah tomorrow at 7','no'))[0].title,'Dinner with Sarah')
  assert.equal((await run('ACME 123','no'))[0].title,'Ukjent emne')
  assert.equal((await run('ACME 123','en'))[0].title,'Unknown topic')
  assert.deepEqual(requests.map(value=>value.uiLanguage),['en','no','no','en'])
  assert.notEqual(frameTitleCacheKey(item('ACME 123'),'standard','test-model','no'),frameTitleCacheKey(item('ACME 123'),'standard','test-model','en'))
  assert.match(FRAME_TITLE_OPTIMIZER_VERSION,/^v2-/)
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

test('slow AI returns fallback inside the fast budget then persists after response', async () => {
  clearFrameTitleL1CacheForTests(); clearFrameTitleInflightForTests()
  const persistentCache = cache(), counter = { calls: 0 }; let deferred
  globalThis.fetch = async (_url, init) => {
    counter.calls++
    const supplied = JSON.parse(JSON.parse(init.body).input[1].content[0].text).items
    await new Promise(resolve => setTimeout(resolve, 320))
    return { ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ items: supplied.map(value => ({ id: value.id, title: 'Eventually durable' })) }) }] }] }) }
  }
  const started = Date.now()
  const first = await optimizeFrameContent([item()], { displayProfile: 'standard', persistentCache, fastBudgetMs: 40, aiTimeoutMs: 1000, defer: work => { deferred = work } })
  assert.ok(Date.now() - started < 200); assert.notEqual(first[0].title, 'Eventually durable')
  await deferred
  const second = await optimizeFrameContent([item()], { displayProfile: 'standard', persistentCache, fastBudgetMs: 40 })
  assert.equal(second[0].title, 'Eventually durable'); assert.equal(counter.calls, 1)
})

test('persistent read failure starts no AI', async () => {
  clearFrameTitleL1CacheForTests(); clearFrameTitleInflightForTests()
  const counter = { calls: 0 }; ai(counter)
  const output = await optimizeFrameContent([item()], { displayProfile: 'standard', persistentCache: { read: async () => { throw new Error('missing table') }, write: async () => {} }, fastBudgetMs: 10 })
  assert.equal(counter.calls, 0); assert.ok(output[0].title)
})

test('concurrent identical misses share one AI operation', async () => {
  clearFrameTitleL1CacheForTests(); clearFrameTitleInflightForTests()
  const persistentCache = cache(), counter = { calls: 0 }; ai(counter, 'One operation')
  const options = { displayProfile: 'standard', persistentCache, fastBudgetMs: 250 }
  await Promise.all([optimizeFrameContent([item()], options), optimizeFrameContent([item()], options)])
  assert.equal(counter.calls, 1); assert.equal(persistentCache.rows.size, 1)
})

test.after(() => { globalThis.fetch = originalFetch; process.env.OPENAI_API_KEY = originalKey })
