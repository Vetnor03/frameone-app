import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const checker = resolve('scripts/check-migration-files.mjs')
const migrationDir = resolve('supabase/migrations')

function runChecker(directory) {
  return spawnSync(process.execPath, [checker, directory], {
    encoding: 'utf8',
  })
}

test('repository migrations have valid names and unique versions', () => {
  const result = runChecker(migrationDir)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /unique versions/)
})

test('checker rejects duplicate migration versions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'remind-migrations-'))
  try {
    writeFileSync(join(dir, '20260925000000_first.sql'), 'select 1;\n')
    writeFileSync(join(dir, '20260925000000_second.sql'), 'select 2;\n')
    const result = runChecker(dir)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Duplicate migration version 20260925000000/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('checker rejects malformed migration filenames', () => {
  const dir = mkdtempSync(join(tmpdir(), 'remind-migrations-'))
  try {
    writeFileSync(join(dir, 'oops.sql'), 'select 1;\n')
    const result = runChecker(dir)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Invalid migration filename: oops.sql/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
