import test from 'node:test'
import assert from 'node:assert/strict'
import { hasGoogleEmailScope, verifiedGoogleEmail } from '../app/lib/integrations/google-tasks/identity.mjs'

test('Tasks-only grant cannot identify account email', () => {
  assert.equal(hasGoogleEmailScope('https://www.googleapis.com/auth/tasks.readonly'), false)
  assert.equal(hasGoogleEmailScope('openid email https://www.googleapis.com/auth/tasks.readonly'), true)
  assert.equal(hasGoogleEmailScope('https://www.googleapis.com/auth/userinfo.email openid'), true)
  assert.equal(hasGoogleEmailScope('profile'), false)
})

test('only use email when Google reports it as verified', () => {
  assert.equal(verifiedGoogleEmail({ email: ' user@example.com ', email_verified: true }), 'user@example.com')
  assert.equal(verifiedGoogleEmail({ email: 'user@example.com', verified_email: true }), 'user@example.com')
  assert.equal(verifiedGoogleEmail({ email: 'user@example.com', email_verified: false }), null)
  assert.equal(verifiedGoogleEmail({ email: 'user@example.com' }), null)
  assert.equal(verifiedGoogleEmail({ email: 'not-email', email_verified: true }), null)
  assert.equal(verifiedGoogleEmail({ email: 'a@example.com', email_verified: 'true' }), null)
  assert.equal(verifiedGoogleEmail(null), null)
})
