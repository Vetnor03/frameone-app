import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')
const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const theme = readFileSync(new URL('../app/lib/theme.ts', import.meta.url), 'utf8')
const accountPreferencesMigration = readFileSync(
  new URL('../supabase/migrations/20260810120000_add_user_app_preferences.sql', import.meta.url),
  'utf8'
)

test('saved app theme is applied by an inline bootstrap before the app renders', () => {
  assert.match(layout, /<head>[\s\S]*?<script dangerouslySetInnerHTML/)
  assert.match(layout, /document\.documentElement\.dataset\.theme = theme/)
  assert.match(theme, /export const THEME_STORAGE_KEY = 'remind-app-theme'/)
  assert.match(theme, /storedTheme\(\) \?\? 'light'/)
  assert.match(home, /\[appTheme, setAppTheme\] = useState<AppTheme>\(initialTheme\)/)
  assert.match(home, /\[frameTheme, setFrameTheme\] = useState<AppTheme>\('dark'\)/)
})

test('frame theme switch leaves app theme and account preferences untouched', () => {
  const frame = home.slice(home.indexOf('<FrameTab'), home.indexOf("{activeTab === 'settings'"))
  const toggle = home.slice(home.indexOf('function FrameTab(props:'), home.indexOf('function LayoutDefault('))
  assert.match(frame, /onFrameThemeToggle=\{\(\) => \{[\s\S]*setFrameTheme\(next\)[\s\S]*markDirty\(\{ frameTheme: next \}\)/)
  assert.match(toggle, /role="switch"/)
  assert.match(toggle, /aria-checked=\{frameTheme === 'light'\}/)
  assert.doesNotMatch(frame, /setAppTheme|persistTheme|applyDocumentTheme|user_app_preferences/)
  assert.doesNotMatch(toggle, /appTheme|onPickApp/)
})
 
test('account app theme is loaded across browsers and missing preferences migrate to light', () => {
  assert.match(home, /from\('user_app_preferences'\)[\s\S]*select\('app_theme'\)[\s\S]*eq\('user_id', userId\)/)
  assert.match(home, /const accountTheme: AppTheme = isAppTheme\(data\?\.app_theme\) \? data\.app_theme : 'light'/)
  assert.match(home, /if \(!data\) \{[\s\S]*upsert\(\{ user_id: userId, app_theme: accountTheme \}/)
  assert.match(home, /persistTheme\(accountTheme\)[\s\S]*setAppTheme\(accountTheme\)/)
})

test('account app preferences are owner-scoped by RLS', () => {
  assert.match(accountPreferencesMigration, /create table if not exists public\.user_app_preferences/)
  assert.match(accountPreferencesMigration, /app_theme text not null default 'light'/)
  assert.match(accountPreferencesMigration, /check \(app_theme in \('light', 'dark'\)\)/)
  assert.match(accountPreferencesMigration, /alter table public\.user_app_preferences enable row level security/)
  assert.match(accountPreferencesMigration, /using \(user_id = auth\.uid\(\)\)[\s\S]*with check \(user_id = auth\.uid\(\)\)/)
})

test('frame theme remains device-backed and only becomes a pending frame change', () => {
  const frame = home.slice(home.indexOf('<FrameTab'), home.indexOf("{activeTab === 'settings'"))
  assert.match(frame, /onFrameThemeToggle=\{\(\) => \{[\s\S]*setFrameTheme\(next\)[\s\S]*markDirty\(\{ frameTheme: next \}\)/)
  assert.match(home, /const nextFrameTheme = isAppTheme\(json\.theme\) \? json\.theme : 'dark'/)
  assert.match(home, /const settingsJson: SettingsJson = \{[\s\S]*?theme: frameTheme/)
})

test('landscape mirror consumes the global app theme rather than frame snapshot theme', () => {
  const landscapeStart = home.indexOf('if (isPhoneLandscapeMirror)')
  const landscape = home.slice(landscapeStart, home.indexOf('\n  return (\n    <main', landscapeStart))
  assert.match(landscape, /theme=\{appTheme\}/)
  assert.doesNotMatch(landscape, /snapshot\?\.theme/)
})
