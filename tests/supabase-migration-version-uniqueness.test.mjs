import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import test from 'node:test'

test('Supabase migration version prefixes are unique', () => {
  const files = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter(file => file.endsWith('.sql'))
  const versions = files.map(file => file.split('_', 1)[0])
  assert.equal(new Set(versions).size, versions.length)
})
