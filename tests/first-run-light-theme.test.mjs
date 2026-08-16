import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')
const login = readFileSync(new URL('../app/login/page.tsx', import.meta.url), 'utf8')
const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')
const portal = readFileSync(new URL('../frame/src/device/ProvisioningPortal.cpp', import.meta.url), 'utf8')

function frameSetupSource() {
  return home.slice(home.indexOf('function FrameSetupFlow({'), home.indexOf('function FirstFrameOnboarding({'))
}

test('the parser-visible palette and bootstrap both fall back to light without a dark flash', () => {
  assert.match(css, /:root,\s*html\[data-theme="light"\]\s*\{[\s\S]*?--app-bg:\s*#f5f6f8/)
  assert.match(css, /html\[data-theme="dark"\]\s*\{[\s\S]*?--app-bg:\s*#061b24/)
  assert.match(layout, /if \(theme !== 'light' && theme !== 'dark'\) theme = 'light'/)
  assert.match(layout, /if \(location\.pathname === '\/login'\) theme = 'light'/)
})

test('login and verification use the shared app theme tokens instead of dark colors', () => {
  assert.match(login, /<main className="remind-app[^\n]+var\(--app-bg\)[^\n]+var\(--fg\)/)
  assert.doesNotMatch(login, /bg-\[#061b24\]|text-white\/|border-white\//)
})

test('all first-frame setup steps remain token-based and never force dark', () => {
  const setup = frameSetupSource()
  for (const step of ["'paired'", "'purpose'", "'modules'", "'manual'", "'ai-intro'", "'plans'", "'follow'"]) {
    assert.match(setup, new RegExp(step))
  }
  assert.match(setup, /var\(--app-bg\)/)
  assert.match(setup, /var\(--panel-05\)/)
  assert.doesNotMatch(setup, /dataset\.theme\s*=\s*['"]dark|setAppTheme\(['"]dark|bg-\[#061b24\]/)
})

test('saved app preference override and physical frame theme remain independent', () => {
  assert.match(layout, /localStorage\.getItem/)
  assert.match(home, /persistTheme\(accountTheme\)[\s\S]*setAppTheme\(accountTheme\)/)
  assert.match(home, /\[frameTheme, setFrameTheme\] = useState<AppTheme>\('dark'\)/)
  assert.match(home, /theme: frameTheme/)
})

test('firmware-served Wi-Fi provisioning uses the RE:MIND light palette', () => {
  assert.match(portal, /theme-color' content='#f5f6f8'/)
  assert.match(portal, /color-scheme:light/)
  assert.match(portal, /background:#f5f6f8/)
  assert.doesNotMatch(portal, /color-scheme:dark|theme-color' content='#061b24'/)
})
