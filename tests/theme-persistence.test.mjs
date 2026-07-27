import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')
const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const theme = readFileSync(new URL('../app/lib/theme.ts', import.meta.url), 'utf8')

test('saved app theme is applied by an inline bootstrap before the app renders', () => {
  assert.match(layout, /<head>[\s\S]*?<script dangerouslySetInnerHTML/)
  assert.match(layout, /document\.documentElement\.dataset\.theme = theme/)
  assert.match(theme, /export const THEME_STORAGE_KEY = 'remind-theme'/)
  assert.match(home, /useState<AppTheme>\(initialTheme\)/)
})

test('an explicit theme selection is persisted immediately', () => {
  const picker = home.slice(home.indexOf('<ThemePickerModal'), home.indexOf('{languagePickerOpen'))
  assert.match(picker, /persistTheme\(t\)[\s\S]*setTheme\(t\)/)
})

test('landscape mirror consumes the global app theme rather than frame snapshot theme', () => {
  const landscapeStart = home.indexOf('if (isPhoneLandscapeMirror)')
  const landscape = home.slice(landscapeStart, home.indexOf('\n  return (\n    <main', landscapeStart))
  assert.match(landscape, /theme=\{theme\}/)
  assert.doesNotMatch(landscape, /snapshot\?\.theme/)
})
