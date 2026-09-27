import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  physicalNewsSnapshot,
  physicalRenderProjection,
  physicalRenderManifest,
} from '../app/lib/device/contentSignatureBase.mjs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const cell = { module: 'news', size: 'MEDIUM', x: 0, y: 0, col: 0, row: 0, w: 400, h: 240 }
const settings = { layout: 1, cells: [cell], modules: {}, powerSaver: true }
const now = Date.parse('2026-09-27T10:00:00Z')

test('physical News snapshot carries the same complete titles used for the render hash', () => {
  const source = {
    ok: true,
    fetched_at: '2026-09-27T09:59:00Z',
    items: Array.from({ length: 20 }, (_, n) => ({ title: `Headline ${n + 1}`, id: `id-${n}` })),
  }
  const snapshot = physicalNewsSnapshot(source)
  const projected = physicalRenderProjection('news', source, cell)
  const manifest = physicalRenderManifest({ settings, sources: { news: source }, now })
  assert.equal(snapshot.ok, true)
  assert.equal(snapshot.titles.length, 14)
  assert.deepEqual(snapshot.titles.slice(0, 6), projected.visible.items.map((row) => row.title))
  assert.equal(manifest[0].key, 'news')
  assert.match(manifest[0].render_hash, /^[a-f0-9]{64}$/)
  assert.deepEqual(physicalNewsSnapshot(source).titles, snapshot.titles)
  const sameVisible = { ...source, fetched_at: '2026-09-27T10:00:00Z' }
  assert.equal(
    physicalRenderManifest({ settings, sources: { news: sameVisible }, now })[0].render_hash,
    manifest[0].render_hash,
    'timestamp changes must never trigger a physical redraw',
  )
})

test('unavailable News never smuggles expired headlines into the frame', () => {
  assert.deepEqual(physicalNewsSnapshot({ ok: false, items: [{ title: 'Yesterday' }] }), { ok: false, titles: [] })
  assert.deepEqual(physicalNewsSnapshot(undefined), { ok: false, titles: [] })
})

test('render-state hands the authoritative snapshot to firmware on due/manual requests only', () => {
  const route = read('app/api/device/render-state/route.ts')
  const firmware = read('frame/src/core/SmartRefresh.cpp')
  const news = read('frame/src/modules/ModuleNews.cpp')
  const sketch = read('frame/src/frame_v2.5.1.ino')
  assert.match(route, /news_snapshot: physicalNewsSnapshot\(visible\.sources\.news\)/)
  assert.match(firmware, /ModuleNews::adoptRenderStateSnapshot\(item\["news_snapshot"\]/)
  assert.match(firmware, /out\.newsSnapshotReady = true;/)
  assert.match(news, /Validate before touching retained pixels/)
  assert.match(news, /g_cache->loaded = true;/)
  assert.match(sketch, /if \(!desired\.newsSnapshotReady\) ModuleNews::invalidate\(\);/)
  assert.match(sketch, /if \(!desired\.newsSnapshotReady\) \{[\s\S]*?displayPlan\.dirty\[i\]/)
  assert.match(read('frame/src/core/SmartRefresh.h'), /bool newsSnapshotReady = false;/)
  assert.doesNotMatch(read('app/api/device/content-revision/route.ts'), /news_snapshot/)
})
