import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const assistant = readFileSync(new URL('../app/components/AIAssistantTab.tsx', import.meta.url), 'utf8')
const sender = readFileSync(new URL('../supabase/functions/send-monitoring-update-push/index.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')

test('Watch push payload links to its Watch and update', () => {
  assert.match(sender, /tab=assistant&watch=\$\{update\?\.watch_id[^&]+&update=\$\{delivery\.monitoring_update_id\}/)
})

test('Watch notification deep link opens AI Assistant and is cleaned after handling', () => {
  assert.match(home, /tab === 'assistant' \|\| tab === 'ai-assistant'/)
  assert.match(home, /setActiveTab\('assistant'\)/)
  assert.match(home, /url\.searchParams\.delete\('watch'\)/)
  assert.match(home, /onDeepLinkHandled=\{finishAssistantDeepLink\}/)
})

test('loaded matching Watch is selected and highlighted while its rendered update is scrolled into view', () => {
  assert.match(assistant, /if \(loading \|\| !deepLink\) return/)
  assert.match(assistant, /setSelectedId\(watch\.id\)/)
  assert.match(assistant, /aria-current=\{selected\?\.id === w\.id/)
  assert.match(assistant, /const target = selectedUpdateRef\.current \?\? watchDetailRef\.current/)
  assert.match(assistant, /target\?\.scrollIntoView\(\{ behavior: 'smooth', block: 'center' \}\)/)
})

test('referenced update or newest Watch update is shown', () => {
  assert.match(assistant, /referencedUpdate \?\? latestUpdate/)
  assert.match(assistant, /data-update-id=\{selectedUpdate\.id\}/)
  assert.match(assistant, /selectedUpdate\?\.id === updatesByWatch\[0\]\?\.id \? c\.latest : c\.selectedUpdate/)
})

test('notification click focuses an existing window and only opens when absent', () => {
  assert.match(sw, /const client = list\[0\]/)
  assert.match(sw, /client\.navigate\(url\)\.then\(\(focusedClient\) => focusedClient\?\.focus\(\)\)/)
  assert.match(sw, /return clients\.openWindow\(url\)/)
})
