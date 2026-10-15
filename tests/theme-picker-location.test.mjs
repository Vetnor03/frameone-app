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
  assert.match(frameTab, /<div className="mt-1 text-xs tracking-widest text-\[color:var\(--fg-60\)\]">\{editorMode\?'Draw to split · trace to erase':subtitle\}<\/div>/)
  assert.match(frameTab, /<span>\{frameTheme === 'light' \? 'LIGHT' : 'DARK'\}<\/span>/)
  assert.match(frameTab, /className="mt-2 inline-flex min-h-6/)
  assert.doesNotMatch(settings, /onOpenTheme|t\.themeRow/)
  assert.doesNotMatch(home, /FrameThemePickerModal|themePickerOpen/)
})

test('frame toggle queues only physical frame theme changes for Update', () => {
  const frame = home.slice(home.indexOf('<FrameTab'), home.indexOf("{activeTab === 'settings'"))
  assert.match(frame, /const next = frameTheme === 'dark' \? 'light' : 'dark'/)
  assert.match(frame, /setFrameTheme\(next\)[\s\S]*markDirty\(\{ frameTheme: next \}\)/)
  assert.doesNotMatch(frame, /setAppTheme|persistTheme|user_app_preferences/)
})

test('frame theme controls switch track and thumb independently from app theme', () => {
  const frameTab = home.slice(home.indexOf('function FrameTab(props:'), home.indexOf('function LayoutDefault('))
  assert.match(frameTab, /frameTheme === 'dark' \? 'border-\[#354653\] bg-\[#263440\]' : 'border-\[#cbd5dc\] bg-\[#f4f6f8\]'/)
  assert.match(frameTab, /frameTheme === 'dark' \? 'bg-\[#f5f6f8\]' : 'bg-\[#586773\] translate-x-3'/)
  assert.match(frameTab, /frameTheme === 'light' \? 'LIGHT' : 'DARK'/)
  assert.doesNotMatch(frameTab, /bg-\[color:var\(--bd-10\)\]|bg-\[color:var\(--fg-60\)\]/)
})

test('App theme is restored to Settings with its own picker and no frame-setting writes', () => {
  const settings = home.slice(home.indexOf('function SettingsTab({'))
  const picker = home.slice(home.indexOf("activeTab === 'settings' && appThemePickerOpen"), home.indexOf('{languagePickerOpen && ('))
  const pickerModal = home.slice(home.indexOf('function AppThemePickerModal({'), home.indexOf('function LanguagePickerModal({'))
  assert.match(settings, /<SettingRow label=\{t\.appThemeRow\} value=\{appTheme === 'dark' \? t\.dark : t\.light\} onClick=\{onOpenAppTheme\} \/>/)
  assert.match(picker, /current=\{appTheme\}/)
  assert.match(picker, /persistTheme\(next\)[\s\S]*setAppTheme\(next\)/)
  assert.doesNotMatch(picker, /setFrameTheme|markDirty/)
  assert.match(pickerModal, /\['dark', 'light'\] as const/)
  assert.doesNotMatch(pickerModal, /frameTheme|onPickFrame/)
})

