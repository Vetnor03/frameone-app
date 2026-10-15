import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('theme selection is reachable from the Frame home page beside Update', () => {
  const frameActions = home.slice(
    home.indexOf("{activeTab === 'frame' && (\n              <div className=\"pt-5"),
    home.indexOf('{isPlainFrameAssistantSurface')
  )
  assert.match(frameActions, /onClick=\{layoutFlow\?submitLayoutDraft:handleExplicitUpdate\}/)
  assert.match(frameActions, /onClick=\{\(\) => setThemePickerOpen\(true\)\}/)
  assert.match(frameActions, /\{tx\(language\)\.themeTitle\}/)
  assert.match(frameActions, /aria-label=\{language === 'no' \? 'Velg fargetema' : 'Choose color theme'\}/)
})

test('Settings no longer offers the old appearance row', () => {
  const settings = home.slice(home.indexOf('function SettingsTab({'))
  assert.doesNotMatch(settings, /onOpenTheme/)
  assert.doesNotMatch(settings, /t\.themeRow/)
})

test('theme selector still offers independent persisted App and Frame choices', () => {
  const picker = home.slice(home.indexOf('function ThemePickerModal({'), home.indexOf('function LanguagePickerModal({'))
  assert.match(picker, /activeThemeTab === 'app' \? appTheme : frameTheme/)
  assert.match(picker, /onPickApp : onPickFrame/)
  const mountedPicker = home.slice(home.indexOf('{themePickerOpen && ('), home.indexOf('{languagePickerOpen && ('))
  assert.match(mountedPicker, /persistTheme\(t\)[\s\S]*setAppTheme\(t\)/)
  assert.match(mountedPicker, /setFrameTheme\(t\)[\s\S]*markDirty\(\{ frameTheme: t \}\)/)
})
