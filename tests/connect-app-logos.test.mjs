import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { INTEGRATION_CATALOGUE } from '../app/lib/integrations/catalog.ts'

const logoSource = readFileSync(new URL('../app/components/ConnectAppLogo.tsx', import.meta.url), 'utf8')
const connectSource = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('every current Connect app has a bundled logo or category mark', () => {
  for (const integration of INTEGRATION_CATALOGUE) {
    assert.ok(logoSource.includes(JSON.stringify(integration.key) + ': {'), integration.key)
  }
  assert.match(logoSource, /Record<ConnectAppKey,/)
})

test('Connect cards render the logo from their existing integration key', () => {
  assert.match(connectSource, /<ConnectAppLogo appKey=\{app\.key\} \/>/)
  assert.match(connectSource, /import ConnectAppLogo from '\.\/components\/ConnectAppLogo'/)
})

test('Connect logos do not fetch remote images on startup', () => {
  assert.doesNotMatch(logoSource, /<img|<Image|https?:\/\//)
  assert.match(logoSource, /aria-hidden="true"/)
})

test('each integration has distinct, locally rendered artwork or a deliberate text identifier', () => {
  const marks = new Map([...logoSource.matchAll(/^  "([^"]+)": (\{.*\}),$/gm)]
    .map((match) => [match[1], JSON.parse(match[2])]))
  assert.equal(marks.size, INTEGRATION_CATALOGUE.length)
  const artwork = new Set()
  for (const integration of INTEGRATION_CATALOGUE) {
    const mark = marks.get(integration.key)
    assert.ok(mark, integration.key)
    assert.match(mark.background, /^#[0-9a-f]{6}$/i)
    assert.ok(mark.paths?.length || mark.wordmark, integration.key)
    assert.ok(!(mark.paths?.length && mark.wordmark), integration.key)
    const signature = mark.wordmark || mark.paths.map(path => path.d).join('|')
    assert.ok(!artwork.has(signature), 'Duplicate artwork: ' + integration.key)
    artwork.add(signature)
    if (mark.paths) {
      for (const path of mark.paths) assert.match(path.d, /^[mM]/)
    }
  }
  assert.match(logoSource, /h-9 w-9/)
  assert.match(logoSource, /rounded-xl/)
  assert.match(logoSource, /h-\[25px\] w-\[25px\]/)
})
