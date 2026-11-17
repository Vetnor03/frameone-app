import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The Frame layout is a flex item above the footer. A footer that gains
// height after first paint causes a visible jump even though data is cached.
const home = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('Frame status footer has reserved height before async hardware status arrives', () => {
  assert.match(home, /<div className="mt-6 h-\[44px\] w-full max-w-\[360px\]/)
  assert.match(home, /<div className="h-5 truncate">\{updateStatusText\}<\/div>/)
  assert.doesNotMatch(home, /frameUpdateError \? 'mt-2' : 'mt-6'/)
  assert.doesNotMatch(home, /\(layoutFlow \? layoutDraftError : frameUpdateError\) &&/)

})

test('second status line remains mounted even before last physical render is known', () => {
  assert.match(home, /<div className="mt-1 h-5 truncate text-\[11px\] text-\[color:var\(--fg-40\)\]">/)
  assert.match(home, /visibleSaveFeedback && lastPhysicalDisplayUpdatedAt \? formatRelative\(lastPhysicalDisplayUpdatedAt\) : ''/)
  assert.doesNotMatch(home, /\{visibleSaveFeedback && lastPhysicalDisplayUpdatedAt && \(\s*<div/)
})

test('temporary frame errors stay inside reserved footer instead of moving the preview', () => {
  assert.match(home, /\{frameUpdateError \? \(\s*<div role="alert" className="line-clamp-2 max-h-\[44px\]/)
  assert.match(home, /\{layoutFlow && layoutDraftError && \(/)
})
