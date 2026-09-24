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
  assert.match(firmware, /#define NEWS_FONT_BODY \(&FreeSansBold12pt8b\)/)
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
