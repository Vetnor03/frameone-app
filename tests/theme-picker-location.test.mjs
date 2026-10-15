import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('frame color picker lives on the Frame home page beside Update', () => {
  const frameActions = home.slice(
    home.indexOf("{activeTab === 'frame' && (\n              <div className=\"pt-5"),
    home.indexOf('{isPlainFrameAssistantSurface')
  )
  assert.match(frameActions, /onClick=\{layoutFlow\?submitLayoutDraft:handleExplicitUpdate\}/)
  assert.match(frameActions, /onClick=\{\(\) => setThemePickerOpen\(true\)\}/)
  assert.match(frameActions, /Velg lys eller mørk ramme/)
  assert.match(frameActions, /frameTheme === 'dark' \? tx\(language\)\.dark : tx\(language\)\.light/)
})

test('Settings no longer offers frame appearance', () => {
  const settings = home.slice(home.indexOf('function SettingsTab({'))
  assert.doesNotMatch(settings, /onOpenTheme/)
  assert.doesNotMatch(settings, /t\.themeRow/)
})

test('Frame home color picker only selects the physical frame theme', () => {
  const modal = home.slice(home.indexOf('function FrameThemePickerModal({'), home.indexOf('function LanguagePickerModal({'))
  const mounted = home.slice(home.indexOf('{themePickerOpen && ('), home.indexOf('{languagePickerOpen && ('))
  assert.match(modal, /onPickFrame\('dark'\)/)
  assert.match(modal, /onPickFrame\('light'\)/)
  assert.doesNotMatch(modal, /onPickApp|appTheme/)
  assert.match(mounted, /setFrameTheme\(t\)[\s\S]*markDirty\(\{ frameTheme: t \}\)/)
  assert.doesNotMatch(mounted, /setAppTheme\(t\)|persistTheme\(t\)|applyDocumentTheme\(t\)/)
})
