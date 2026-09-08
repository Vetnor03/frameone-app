import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { buildAudit, DEFAULT_AUDIT_METADATA, loadMunicipalities, loadRegistry, STATUSES, totals } from '../scripts/audit-waste-coverage.mjs'

test('official snapshot has exactly 357 unique municipality numbers and required provenance', () => {
  const rows = loadMunicipalities()
  assert.equal(rows.length, 357)
  assert.equal(new Set(rows.map(row => row.municipality_number)).size, 357)
  assert.ok(rows.every(row => row.source.includes('Statistics Norway') && row.source_snapshot_date === '2026-09-08'))
})

test('audit derives registry and known cases without changing routing', () => {
  const rows = buildAudit(), registry = loadRegistry(), count = totals(rows)
  assert.equal(registry.length, 17)
  assert.equal(registry.filter(row => row.status === 'supported').length, 15)
  assert.equal(registry.filter(row => row.status === 'preview').length, 2)
  assert.equal(Object.values(count).reduce((sum, value) => sum + value, 0), 357)
  assert.deepEqual(count, { supported:7, preview:2, adapter_exists_missing_registry:19, known_provider_no_adapter:54, credential_blocked:8, auth_gated:1, unknown_provider:266 })
  assert.deepEqual(rows.filter(row => ['1103','1108'].includes(row.municipality_number)).map(row => row.coverage_status), ['preview','preview'])
  assert.equal(rows.find(row => row.municipality_number === '1149').coverage_status, 'auth_gated')
  assert.equal(rows.find(row => row.municipality_number === '4624').provider_brand, 'BIR')
  assert.equal(rows.find(row => row.municipality_number === '4626').coverage_status, 'unknown_provider')
  const osen = rows.find(row => row.municipality_number === '5020')
  assert.equal(osen.provider_brand, 'Midtre Namdal Avfallsselskap (MNA)')
  assert.equal(osen.coverage_status, 'known_provider_no_adapter')
  assert.notEqual(osen.provider_brand, 'Fosen Renovasjon')
  for (const number of ['1145','4611','1146','1160']) assert.equal(rows.find(row => row.municipality_number === number).coverage_status, 'adapter_exists_missing_registry')
})


test('MinRenovasjon credential blocking is explicit dated metadata, not family behavior', () => {
  const blocked = buildAudit().find(row => row.municipality_number === '3205')
  assert.equal(blocked.credential_status, 'not_configured')
  assert.equal(blocked.live_verification_status, 'blocked_by_credential')
  assert.equal(blocked.coverage_status, 'credential_blocked')

  const configuredMetadata = { ...DEFAULT_AUDIT_METADATA, credentials: { minrenovasjon: { status: 'configured' } } }
  const unblocked = buildAudit(loadMunicipalities(), loadRegistry(), configuredMetadata).find(row => row.municipality_number === '3205')
  assert.equal(unblocked.credential_status, 'configured')
  assert.equal(unblocked.live_verification_status, 'not_tested')
  assert.equal(unblocked.coverage_status, 'supported')
})

test('snapshot validation rejects wrong counts and duplicates', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'waste-audit-'))
  const source = JSON.parse(readFileSync('scripts/data/norway-municipalities-2026.json', 'utf8'))
  const short = path.join(dir, 'short.json'); writeFileSync(short, JSON.stringify(source.slice(1)))
  assert.throws(() => loadMunicipalities(short), /exactly 357/)
  const duplicate = path.join(dir, 'duplicate.json'); source[356].municipality_number = source[0].municipality_number; writeFileSync(duplicate, JSON.stringify(source))
  assert.throws(() => loadMunicipalities(duplicate), /duplicate/)
})

test('audit rejects an unknown or obsolete registry municipality', () => {
  assert.throws(() => buildAudit(loadMunicipalities(), [{ municipalityNumber:'9999', status:'supported', family:'test', brand:'test' }]), /unknown\/obsolete/)
  assert.deepEqual(STATUSES, ['supported','preview','adapter_exists_missing_registry','known_provider_no_adapter','credential_blocked','auth_gated','unknown_provider'])
})
