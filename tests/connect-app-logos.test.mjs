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
