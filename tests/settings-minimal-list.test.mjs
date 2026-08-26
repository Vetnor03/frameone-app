import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('settings actions render as one plain divided list', () => {
  assert.match(home, /className="mt-2 divide-y divide-\[color:var\(--bd-10\)\]"/)
  assert.match(home, /data-settings-row/)
  assert.match(home, /className="flex w-full items-center justify-between bg-transparent py-\[18px\] text-left"/)

  const settingRow = home.slice(home.indexOf('function SettingRow('), home.indexOf('function PairFrameForm('))
  assert.doesNotMatch(settingRow, /rounded|shadow|bg-\[color:var\(--panel|hover:bg/)
  assert.match(settingRow, /text-\[color:var\(--fg-50\)\]/)
})

test('notification row stays plain and its optional guidance is unboxed', () => {
  const notifications = home.slice(home.indexOf('function NotificationsSetting('), home.indexOf('function SettingRow('))
  assert.match(notifications, /className="py-4"/)
  assert.match(notifications, /<SettingsToggle[^>]+checked=\{enabled\}/)
  assert.doesNotMatch(notifications, /rounded-2xl border border-\[color:var\(--bd-10\)\] bg-\[color:var\(--panel-05\)\]/)
})

test('settings toggles share one accessible visual treatment', () => {
  const assistantToggle = home.slice(home.indexOf('function AssistantPreferenceToggle('), home.indexOf('async function unregisterCurrentPushSubscription'))
  assert.match(assistantToggle, /<SettingsToggle label=\{label\} checked=\{checked\}/)
  assert.match(assistantToggle, /role="switch"/)
  assert.match(assistantToggle, /aria-checked=\{checked\}/)
  assert.match(assistantToggle, /checked \? 'bg-\[color:var\(--accent\)\]'/)
  assert.match(assistantToggle, /bg-white shadow-sm/)
})
