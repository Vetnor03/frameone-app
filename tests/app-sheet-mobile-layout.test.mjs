import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sheet = readFileSync(new URL('../app/components/AppSheet.tsx', import.meta.url), 'utf8')
const request = readFileSync(new URL('../app/components/IntegrationRequestCard.tsx', import.meta.url), 'utf8')
const waste = readFileSync(new URL('../app/components/WasteSetupModal.tsx', import.meta.url), 'utf8')
const app = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('shared sheet mounts outside tab scroll containers and tracks the visible iOS viewport', () => {
  assert.match(sheet, /createPortal\(/)
  assert.match(sheet, /document\.body/)
  assert.match(sheet, /window\.visualViewport/)
  assert.match(sheet, /visual\?\.addEventListener\('resize', update\)/)
  assert.match(sheet, /visual\?\.addEventListener\('scroll', update\)/)
  assert.match(sheet, /top: viewport\.top/)
  assert.match(sheet, /height: viewport\.height/)
  assert.match(sheet, /overflow-y-auto overscroll-contain/)
  assert.match(sheet, /shrink-0 border-t/)
})

test('integration request never forces the keyboard open or hides its submit actions inside scrolling content', () => {
  assert.doesNotMatch(request, /autoFocus/)
  assert.match(request, /<AppSheet/)
  assert.match(request, /form="integration-request-form"/)
  assert.match(request, /id="integration-request-form"/)
  assert.match(request, /dismissible=\{!saving\}/)
  assert.match(request, /className="mt-1 h-11 w-full[^"]*text-base/)
})

test('Connect forms share a keyboard-aware sheet with persistent actions', () => {
  assert.match(waste, /<AppSheet/)
  const connect = app.slice(app.indexOf('  const renderLocalEventsModal = () => {'), app.indexOf('\n\n\n\nfunction TabBar', app.indexOf('  const renderLocalEventsModal = () => {')))
  assert.equal((connect.match(/<AppSheet/g) || []).length, 3)
  assert.doesNotMatch(connect, /className="fixed inset-0 z-50 flex items-end justify-center bg-black\/40/)
  assert.match(connect, /dismissible=\{!spondLoading\}/)
  assert.match(connect, /dismissible=\{!localEventsLoading\}/)
})
