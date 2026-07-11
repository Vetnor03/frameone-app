import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const providerSource = readFileSync(new URL('../app/lib/integrations/local-events/providers/friskus.ts', import.meta.url), 'utf8')
const serverSource = readFileSync(new URL('../app/lib/integrations/local-events/server.ts', import.meta.url), 'utf8')
const connectRouteSource = readFileSync(new URL('../app/api/integrations/local-events/connect/route.ts', import.meta.url), 'utf8')

test('Friskus request uses observed municipality UUID filter and sends diagnostics headers', () => {
  assert.match(providerSource, /global_filters_municipalities\(EQ\)\$\{config\.municipalityUuid\}\$\$true/)
  assert.match(providerSource, /new URLSearchParams\(\{ municipality: config\.providerMunicipality, filters: friskusMunicipalityFilter\(config\) \}\)/)
  assert.doesNotMatch(providerSource, /from: from\.toISOString\(\)/)
  assert.doesNotMatch(providerSource, /to: to\.toISOString\(\)/)
  assert.match(providerSource, /'Accept-Language': 'en'/)
  assert.match(providerSource, /'User-Agent': 'RE-MIND\/1\.0 local-events integration'/)
  assert.match(providerSource, /AbortSignal\.timeout\(15_000\)/)
})

test('Friskus diagnostics log exact request and response inspection fields', () => {
  assert.match(providerSource, /requestMethod = 'GET'/)
  assert.match(providerSource, /sanitizedRequestBody = null/)
  assert.match(providerSource, /contentType/)
  assert.match(providerSource, /bodyPreview: body\.slice\(0, 1000\)/)
  assert.match(providerSource, /rawCount: rows\.length/)
  assert.match(providerSource, /sanitizedSampleRawEvent/)
})

test('HTTP errors throw LocalEventsProviderError before response parsing', () => {
  assert.match(providerSource, /class LocalEventsProviderError extends Error/)
  assert.match(providerSource, /if \(!resp\.ok\) throw new LocalEventsProviderError\(`Friskus returned \$\{resp\.status\}/)
  assert.match(providerSource, /responseBody: body\.slice\(0, 1000\)/)
})

test('local events sync preserves provider errors and connect maps initial failures to 502', () => {
  assert.match(serverSource, /throw error/)
  assert.doesNotMatch(serverSource, /return \{ synced: false, failed: true, error: 'Could not load local events' \}/)
  assert.match(connectRouteSource, /LOCAL_EVENTS_INITIAL_SYNC_FAILED/)
  assert.match(connectRouteSource, /status: 502/)
})

test('normalization handles recurring occurrences, multi-day filters, invalid title diagnostics, and deterministic IDs', () => {
  assert.match(providerSource, /occurrenceCandidates/)
  assert.match(providerSource, /Array\.isArray\(raw\?\.occurrences\)/)
  assert.match(providerSource, /effectiveEnd >= from && eventStart <= to/)
  assert.match(providerSource, /removedMissingTitle/)
  assert.match(providerSource, /crypto\.createHash\('sha256'\)/)
})
