import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('Update button has its original centered dimensions with no adjacent theme button', () => {
  const frameActions = home.slice(
    home.indexOf("{activeTab === 'frame' && (\n              <div className=\"pt-5"),
    home.indexOf('{isPlainFrameAssistantSurface')
  )
  assert.match(frameActions, /onClick=\{layoutFlow\?submitLayoutDraft:handleExplicitUpdate\}/)
  assert.match(frameActions, /className=\{`w-\[260px\] h-\[56px\] rounded-2xl border/)
  assert.doesNotMatch(frameActions, /setThemePickerOpen|themeTitle|frameTheme === 'dark'/)
  assert.doesNotMatch(frameActions, /flex w-full max-w-\[360px\] items-center justify-center gap-3/)
})

test('small frame theme switch is in the layout heading, not Settings or the Update area', () => {
  const frame = home.slice(home.indexOf('<FrameTab'), home.indexOf("{activeTab === 'settings'"))
  const frameTab = home.slice(home.indexOf('function FrameTab(props:'), home.indexOf('function LayoutDefault('))
  const settings = home.slice(home.indexOf('function SettingsTab({'))
  assert.match(frame, /frameTheme=\{frameTheme\}/)
  assert.match(frame, /canChangeFrameTheme=\{!!activeDeviceId\}/)
  assert.match(frameTab, /role="switch"/)
  assert.match(frameTab, /onClick=\{onFrameThemeToggle\}/)
  assert.match(frameTab, /\{language === 'no' \? 'RAMME' : 'FRAME'\}/)
  assert.doesNotMatch(settings, /onOpenTheme|t\.themeRow/)
  assert.doesNotMatch(home, /FrameThemePickerModal|themePickerOpen/)
})

test('frame toggle queues only physical frame theme changes for Update', () => {
  const frame = home.slice(home.indexOf('<FrameTab'), home.indexOf("{activeTab === 'settings'"))
  assert.match(frame, /const next = frameTheme === 'dark' \? 'light' : 'dark'/)
  assert.match(frame, /setFrameTheme\(next\)[\s\S]*markDirty\(\{ frameTheme: next \}\)/)
  assert.doesNotMatch(frame, /setAppTheme|persistTheme|user_app_preferences/)
})
