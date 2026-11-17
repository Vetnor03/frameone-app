import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')

test('first startup still has a branded route fallback', () => {
  assert.ok(page.includes('Suspense fallback={<StartupSplashScreen />}'))
})

test('background module prewarming cannot surface the route-wide splash', () => {
  const begin = home.indexOf('mountedModuleKeys.map((moduleKey) => {')
  assert.ok(begin >= 0, 'module tabs should be rendered within their retained scopes')
  const section = home.slice(begin, begin + 6000)
  const tabContainer = section.indexOf('key={`\$\{moduleTabScope\}:\$\{moduleKey\}`}')
  const boundary = section.indexOf('<React.Suspense fallback={isActive ? (')
  const modulePosition = section.indexOf('<ModuleSettingsTab')
  const boundaryClose = section.indexOf('</React.Suspense>', boundary)
  assert.ok(tabContainer >= 0 && tabContainer < boundary, 'each cached tab must own its suspense boundary')
  assert.ok(boundary >= 0 && boundary < modulePosition && modulePosition < boundaryClose, 'module code must load inside the per-tab suspense boundary')
  assert.ok(section.includes(') : null}>'), 'hidden tabs must not display loading overlays')
  assert.ok(section.includes('<React.Suspense fallback={null}>'), 'AI assistant must use a local loading boundary')
})

test('lazy frame assistant cannot suspend the entire startup route', () => {
  assert.ok(home.includes('<React.Suspense fallback={null}>\n                <FrameAssistant'))
})

test('Assistant navigation retains already mounted module tabs', () => {
  assert.match(home, /const mountedModuleKeys = activeTab === 'assistant'/)
  assert.match(home, /new Set\(\[\.\.\.renderedModuleKeys, 'assistant' as ModuleKey\]\)/)
  assert.doesNotMatch(home, /activeTab === 'assistant' \? \['assistant' as ModuleKey\] : renderedModuleKeys/)
})
