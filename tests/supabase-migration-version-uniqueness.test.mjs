import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import test from 'node:test'

test('Supabase migration version prefixes are unique except the exact known legacy collision', () => {
  const files = readdirSync(new URL('../supabase/migrations/', import.meta.url)).filter(file => file.endsWith('.sql'))
  const filesByVersion = new Map()
  for (const file of files) {
    const version = file.split('_', 1)[0]
    filesByVersion.set(version, [...(filesByVersion.get(version) || []), file])
  }

  const duplicates = [...filesByVersion].filter(([, names]) => names.length > 1)
  assert.deepEqual(duplicates, [[
    '20260810120000',
    ['20260810120000_add_user_app_preferences.sql', '20260810120000_track_device_update_probes.sql'],
  ]])
})
