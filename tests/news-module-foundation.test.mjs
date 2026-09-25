import fs from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('News is a first-class frame module backed by NRK RSS', () => {
  const modules = JSON.parse(read('shared/frame-modules.json'))
  assert.ok(modules.some((module) => module.id === 'news'))

  const api = read('app/api/news/route.ts')
  assert.match(api, /https:\/\/www\.nrk\.no\/toppsaker\.rss/)
  assert.match(api, /contentType: 'news'/)
  assert.match(api, /profile_titles/)
  assert.match(api, /nrkArticleUrl/)
  assert.match(api, /refresh_seconds/)
})

test('News smart refresh only hashes visible titles and checks periodically', () => {
  const signature = read('app/lib/device/contentSignatureBase.mjs')
  assert.match(signature, /ref\.base === 'news'/)
  assert.match(signature, /\/api\/news/)
  assert.match(signature, /NEWS_SOURCE_FRESHNESS_MS = 30 \* 60_000/)
  assert.match(signature, /NEWS_POWER_SAVE_FRESHNESS_MS = 2 \* 60 \* 60_000/)
  assert.match(signature, /settings\?\.powerSaver \? NEWS_POWER_SAVE_FRESHNESS_MS : NEWS_SOURCE_FRESHNESS_MS/)
  assert.match(signature, /function newsProjection/)
})

test('News frame rendering uses the reminder-like list without date UI', () => {
  const firmware = read('frame/src/modules/ModuleNews.cpp')
  assert.match(firmware, /"Nyheter" : "News"/)
  assert.match(firmware, /MAX_NEWS_ITEMS = 14/)
  assert.match(firmware, /#define NEWS_FONT_BODY \(&FreeSans12ptNO8b\)/)
  assert.match(firmware, /#define NEWS_FONT_HEADER \(&FreeSansBold12pt8b\)/)
  assert.match(firmware, /Match the Reminders module's centered list treatment/)
  assert.doesNotMatch(firmware, /ModuleDate|drawCalendar|calendar/i)

  const renderer = read('frame/src/modules/ModuleRenderer.cpp')
  assert.match(renderer, /ModuleNews::render/)

  const home = read('app/HomePageClient.tsx')
  assert.match(home, /module === 'news'/)
  assert.match(home, /MirrorNewsCard/)
  assert.match(home, /gridTemplateColumns: 'minmax\(0, 1fr\)'/)
  assert.doesNotMatch(home, /const columns = size === 'large' \? 2 : 1/)
  assert.match(home, /NewsModuleSettingsTab/)
})


test('News preserves complete physical headlines while the app retains semantic optimization', () => {
  const optimizer = read('app/lib/frameContentOptimizer.ts')
  assert.match(optimizer, /NEWS_TITLE_OPTIMIZER_VERSION = 'news-v2'/)
  assert.match(optimizer, /complete, natural headline/)
  assert.match(optimizer, /rephrase it shorter when needed instead of returning a clipped or unfinished fragment/)

  const firmware = read('frame/src/modules/ModuleNews.cpp')
  assert.match(firmware, /wrapTextToLines/)
  assert.match(firmware, /show as many newest stories as actually fit/)
  assert.match(firmware, /if \(nextH > availableH\)/)
  assert.match(firmware, /raw_titles=1/)
  assert.match(firmware, /selected\[visible\+\+\] = i/)
  assert.doesNotMatch(firmware, /fitTextToWidth|profile_titles|\.\.\./)
  assert.match(read('app/api/news/route.ts'), /searchParams\.get\('raw_titles'\) === '1'/)
  assert.match(read('app/lib/device/contentSignatureBase.mjs'), /raw_titles: 1/)
  assert.match(read('frame/src/assets/fonts/FreeSans12ptNO.h'), /0x20, 0xFF, 29/)

  const home = read('app/HomePageClient.tsx')
  assert.match(home, /whitespace-normal break-words/)
})


test('News freshness is independent from cheap wakeups and unrelated redraws', () => {
  const signature = read('app/lib/device/contentSignatureBase.mjs')
  const news = read('frame/src/modules/ModuleNews.cpp')
  const firmware = read('frame/src/frame_v2.5.1.ino')
  const scheduler = read('frame/src/core/SmartRefresh.cpp')

  assert.match(scheduler, /const bool newsFreshness = state\.modules\[i\]\.key == "news"/)
  assert.match(scheduler, /d\.type == SMART_SOFT && !newsFreshness/)
  assert.match(signature, /NEWS_SOURCE_FRESHNESS_MS = 30 \* 60_000/)
  assert.match(signature, /NEWS_POWER_SAVE_FRESHNESS_MS = 2 \* 60 \* 60_000/)
  assert.match(news, /void preload\(\) \{ ensureLoaded\(\); \}/)
  assert.match(news, /RTC_DATA_ATTR static NewsCache g_retainedNews;/)
  const config = news.slice(news.indexOf('void setConfig('), news.indexOf('void invalidate()'))
  assert.doesNotMatch(config, /clearCache\(\)/)
  const schedule = firmware.slice(firmware.indexOf('ContentRevisionState revisionState;'))
  assert.match(schedule, /desired\.modules\[i\]\.key == "news" && displayPlan\.dirty\[i\]/)
  assert.doesNotMatch(schedule, /ModuleNews::invalidateScheduled/)
})
