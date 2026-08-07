import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('light theme uses the premium RE:MIND surface palette', () => {
  const lightTheme = css.match(/html\[data-theme="light"\] \{([\s\S]*?)\n\}/)?.[1] ?? ''

  assert.match(lightTheme, /--app-bg:\s*#f5f6f8/i)
  assert.match(lightTheme, /--sheet-bg:\s*#ffffff/i)
  assert.match(lightTheme, /--card-bg:\s*#ffffff/i)
  assert.match(lightTheme, /--panel-05:\s*#fafafb/i)
  assert.match(lightTheme, /--bd-10:\s*rgba\(0, 0, 0, 0\.06\)/i)
})

test('light material treatments stay scoped away from dark mode', () => {
  assert.match(css, /html\[data-theme="light"\] \.remind-app :is\(input, textarea, select\)/)
  assert.match(css, /background-color:\s*#f3f4f6 !important/)
  assert.match(css, /box-shadow:\s*0 2px 8px rgba\(24, 32, 40, 0\.05\)/)
  assert.doesNotMatch(css, /html\[data-theme="dark"\] \.remind-app/)
  assert.match(home, /<main className=\{`remind-app h-screen/)
})

test('browser chrome and mirror share the new light canvas', () => {
  assert.match(home, /meta\.content = theme === 'dark' \? '#061b24' : '#f5f6f8'/)
  assert.match(home, /const background = isDark \? '#061b24' : '#f5f6f8'/)
})
