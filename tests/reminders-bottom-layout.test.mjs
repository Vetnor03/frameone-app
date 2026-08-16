import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const homePage = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('reminders content fills and scrolls behind the fixed add button', () => {
  assert.match(homePage, /className="absolute inset-0 overflow-y-auto no-scrollbar"/)
  assert.match(homePage, /className="box-border flex min-h-full flex-col pt-4 max-\[420px\]:pt-3"/)
  assert.match(homePage, /relative flex-1 rounded-3xl[^"\n]*pb-24/)
  assert.match(homePage, /className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center py-5"/)
  assert.doesNotMatch(homePage, /bottom-0 z-20 flex flex-col items-center bg-\[color:var\(--app-bg\)\] py-5/)
})
