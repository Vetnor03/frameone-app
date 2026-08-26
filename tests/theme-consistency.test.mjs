import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')
const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('secondary controls have semantic readable and intentionally disabled theme states', () => {
  for (const token of [
    '--control-secondary-bg',
    '--control-secondary-border',
    '--control-secondary-fg',
    '--control-disabled-bg',
    '--control-disabled-border',
    '--control-disabled-fg',
  ]) {
    assert.equal(css.split(token).length - 1, 3, `${token} should be defined for dark and light and consumed once`)
  }
  assert.match(css, /\[data-ui="secondary-control"\]:disabled[\s\S]*?opacity:\s*1/)

  const groceries = home.slice(home.indexOf("'ADD ITEM'"), home.indexOf('dinnerPlanOpen && activeDeviceId'))
  assert.equal(groceries.split('data-ui="secondary-control"').length - 1, 2)
  assert.doesNotMatch(groceries, /Dinner Plan[\s\S]*?(?:text-white\/|border-white\/|bg-black\/)/)
})

test('the complete custom Surf Spot wizard uses theme semantics instead of dark-only sheet colors', () => {
  const wizard = home.slice(home.indexOf('function CustomSurfSpotWizard('), home.indexOf('function RealTileMap('))

  assert.match(wizard, /data-ui="custom-spot-sheet"/)
  assert.match(wizard, /bg-\[color:var\(--sheet-bg\)\]/)
  assert.match(wizard, /data-ui="themed-input"/)
  assert.match(wizard, /bg-\[color:var\(--input-bg\)\]/)
  assert.match(wizard, /placeholder:text-\[color:var\(--fg-40\)\]/)
  assert.equal(wizard.split('data-ui="secondary-control"').length - 1, 2)
  assert.match(wizard, /var\(--primary-action-fg\)/)
  assert.match(wizard, /var\(--danger\)/)

  assert.doesNotMatch(wizard, /(?:text-white|border-white|bg-black)\//)
  assert.doesNotMatch(wizard, /text-\[#(?:fff(?:fff)?|7caed6|07131f)\]/i)
})
