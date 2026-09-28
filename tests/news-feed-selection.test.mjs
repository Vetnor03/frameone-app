import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildContentRequestPlan } from '../app/lib/device/contentSignatureBase.mjs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const cell = { module: 'news', size: 'MEDIUM', x: 0, y: 0, col: 0, row: 0, w: 400, h: 240 }
const settings = (feed) => ({ cells: [cell], modules: { news: feed === undefined ? undefined : { feed } } })
const plan = (feed) => buildContentRequestPlan({ settings: settings(feed), deviceId: 'frm_test', origin: 'https://re-mind.no' })

test('News defaults to Top Stories and selects Latest News per frame', () => {
  assert.equal(new URL(plan(undefined).requests[0].url).searchParams.get('feed'), 'top')
  assert.equal(new URL(plan('top').requests[0].url).searchParams.get('feed'), 'top')
  assert.equal(new URL(plan('latest').requests[0].url).searchParams.get('feed'), 'latest')
  assert.equal(new URL(plan('invalid').requests[0].url).searchParams.get('feed'), 'top')
})

test('app, mirror and firmware fallback all use the saved News feed', () => {
  const home = read('app/HomePageClient.tsx')
  const ui = read('app/components/NewsModuleSettingsTab.tsx')
  const mirror = read('app/api/device/mirror-snapshot/base.ts')
  const builder = read('app/api/device/frame-config/builder.ts')
  const parser = read('frame/src/core/FrameConfig.cpp')
  const firmware = read('frame/src/modules/ModuleNews.cpp')
  assert.match(home, /news: \{ \.\.\.savedFeed, feed: nextFeed \}/)
  assert.match(ui, /feed=\$\{feed\}/)
  assert.match(mirror, /newsDetail\(origin, language, asRecord\(modules.news\).feed/)
  assert.match(builder, /responseModules.news = \{ feed:/)
  assert.match(parser, /modules\["news"\]/)
  assert.match(firmware, /g_cfg->newsFeed/)
})

test('feed API keeps caches separate and never accepts arbitrary RSS URLs', () => {
  const api = read('app/api/news/route.ts')
  assert.match(api, /feed === 'latest' \? LATEST_NEWS_RSS_URL : TOP_STORIES_RSS_URL/)
  assert.match(api, /\.eq\('feed_url', feedUrl\)/)
  assert.match(api, /feed_url: feedUrl/)
  assert.doesNotMatch(api, /NRK_NEWS_RSS_URL/)
})
