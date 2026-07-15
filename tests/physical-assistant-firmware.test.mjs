import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const renderer = readFileSync(new URL('../frame/src/modules/ModuleRenderer.cpp', import.meta.url), 'utf8')
const layout = readFileSync(new URL('../frame/src/core/Layout.cpp', import.meta.url), 'utf8')
const frameLoop = readFileSync(new URL('../frame/src/frame_v2.5.1.ino', import.meta.url), 'utf8')
const assistantCpp = readFileSync(new URL('../frame/src/modules/ModuleAssistant.cpp', import.meta.url), 'utf8')
const assistantRoute = readFileSync(new URL('../app/api/device/assistant/route.ts', import.meta.url), 'utf8')
const mirrorRoute = readFileSync(new URL('../app/api/device/mirror-snapshot/route.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260714235900_ai_assistant_frame_refresh_requests.sql', import.meta.url), 'utf8')

test('firmware recognizes assistant keys and registers Assistant before layout drawing', () => {
  assert.match(renderer, /mod\.equalsIgnoreCase\("assistant"\) \|\| mod\.startsWith\("assistant:"\)/)
  assert.match(renderer, /ModuleAssistant::render\(c, mod\)/)
  const registrationBeforeDraw = frameLoop.slice(frameLoop.indexOf('ModuleDate::setConfig(&g_cfg)'), frameLoop.indexOf('Layout::drawWithContent(g_cfg.layout, g_cfg)'))
  assert.match(registrationBeforeDraw, /ModuleAssistant::setConfig\(&g_cfg\)/)
  assert.match(layout, /ModuleAssistant::setConfig\(&cfg\)/)
})

test('unknown modules and failed Assistant fetches fail softly', () => {
  assert.match(renderer, /Unknown modules fail softly/)
  assert.doesNotMatch(renderer, /drawCenteredLine\(c\.x, c\.y, c\.w, c\.h, mod\.c_str\(\)/)
  assert.match(assistantCpp, /if \(!httpOk \|\| code != 200\)[\s\S]*return false/)
  assert.match(assistantCpp, /body\.length\(\) > 8192/)
  assert.match(assistantCpp, /assistant JSON parse failed/)
  assert.match(assistantCpp, /drawEmpty\(c, "Assistant unavailable"\)/)
})

test('empty Assistant data draws safe empty states and large layout shows up to five requests', () => {
  assert.match(assistantCpp, /NOTHING NEW/)
  assert.match(assistantCpp, /MAX_WATCH_REQUESTS = 5/)
  assert.match(assistantCpp, /activeWatchRequests/)
  assert.doesNotMatch(assistantCpp, /drawFastVLine|drawLine\([^\n]*rightX/)
})

test('successful render acknowledges revision after safe draw and prevents repeated render of same revision', () => {
  assert.match(frameLoop, /Layout::drawWithContent\(g_cfg\.layout, g_cfg\);[\s\S]*postDeviceStatus\(batt, pwr, true\);[\s\S]*UpdateChecker::saveApplied\(updatedAt\)/)
  assert.match(frameLoop, /if \(!shouldRender\)[\s\S]*keep current ePaper image/)
  assert.match(frameLoop, /preserving current ePaper image and suppressing this failing revision[\s\S]*UpdateChecker::saveApplied\(updatedAt\)[\s\S]*postDeviceStatus\(batt, pwr, false\)/)
})

test('physical endpoint shares Mirror selection rules and payload is device-safe', () => {
  assert.match(assistantRoute, /selectAiAssistantFrameItems\([\s\S]*renderCycleId/)
  assert.match(assistantRoute, /sanitizeAiAssistantMirrorSummary/)
  assert.match(assistantRoute, /device_members[\s\S]*monitoring_watches[\s\S]*monitoring_updates/)
  assert.match(assistantRoute, /\.slice\(0, 5\)/)
  assert.match(mirrorRoute, /selectAiAssistantFrameItems\([\s\S]*renderCycleId/)
})

test('Assistant refresh migration coalesces pending revisions and keeps normal wake cadence', () => {
  assert.match(migration, /ds\.updated_at > coalesce\(st\.last_render_at, st\.last_refresh_at/)
  assert.match(migration, /p_reason not in \('new_update', 'read_state_changed'\)/)
  assert.match(frameLoop, /static const uint16_t WAKES_PER_REFRESH = 12/)
  assert.doesNotMatch(frameLoop, /assistant[\s\S]{0,120}(wake|timer|900ULL)/i)
})
