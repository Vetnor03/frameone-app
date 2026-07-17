import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const homePage = readFileSync(new URL('../app/HomePageClient.tsx', import.meta.url), 'utf8')

test('tab centering is not retriggered by unrelated parent renders', () => {
  assert.match(homePage, /const getTabScrollBehavior = useCallback\(\(\): ScrollBehavior =>/)
  assert.match(homePage, /getScrollBehavior=\{getTabScrollBehavior\}/)
  assert.doesNotMatch(homePage, /getScrollBehavior=\{\(\) => \{/)
})
