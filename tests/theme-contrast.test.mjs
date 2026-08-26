import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8')
const home = await readFile(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('both themes define the shared interactive contrast tokens', () => {
  const required = ['--control-bg:', '--control-border:', '--control-fg:', '--action-fg:', '--disabled-bg:', '--disabled-fg:', '--disabled-border:', '--focus-ring:']
  const dark = css.slice(css.indexOf('html[data-theme="dark"]'), css.indexOf(':root,'))
  const light = css.slice(css.indexOf(':root,'), css.indexOf('/* =========================\n   RE:MIND LIGHT'))
  for (const token of required) {
    assert.match(dark, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    assert.match(light, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  }
})

test('shared controls retain legible disabled and focus states', () => {
  assert.match(css, /\[data-ui="button-primary"\]\):disabled[\s\S]*color: var\(--disabled-fg\)/)
  assert.match(css, /\[data-ui="input"\]:focus-visible[\s\S]*outline: 3px solid var\(--focus-ring\)/)
})

test('custom spot flow uses theme-aware sheet, input and button primitives', () => {
  const start = home.indexOf('function CustomSurfSpotWizard(')
  const end = home.indexOf('function RealTileMap(', start)
  const editor = home.slice(start, end)
  assert.ok(start >= 0 && end > start)
  assert.match(editor, /data-ui="sheet"/)
  assert.match(editor, /data-ui="input"/)
  assert.match(editor, /data-ui="button-primary"/)
  assert.doesNotMatch(editor, /bg-black\/45|border-white\/20|text-white\/90|text-\[#07131f\]|text-\[#7caed6\]/)
})
