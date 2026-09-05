import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('logout requires confirmation before signing out', () => {
  assert.match(home, /onClick=\{\(\) => setLogoutConfirmOpen\(true\)\}/)
  assert.match(home, /logoutConfirmOpen && \(/)
  assert.match(home, /role="dialog" aria-modal="true" aria-labelledby="logout-confirm-title"/)
  assert.match(home, /onClick=\{\(\) => void confirmLogout\(\)\}/)
  assert.match(home, /async function confirmLogout\(\)[\s\S]*await onLogout\(\)/)
})

test('logout confirmation is localized and guards repeated submission', () => {
  assert.match(home, /logoutConfirm: 'Are you sure you want to log out of the app\?'/)
  assert.match(home, /logoutConfirm: 'Er du sikker på at du vil logge ut av appen\?'/)
  assert.match(home, /if \(loggingOut\) return[\s\S]*setLoggingOut\(true\)/)
  assert.match(home, /disabled=\{loggingOut\}[\s\S]*loggingOut \? t\.loggingOut : t\.logoutConfirmButton/)
  assert.match(home, /onClick=\{\(\) => setLogoutConfirmOpen\(false\)\}/)
})
