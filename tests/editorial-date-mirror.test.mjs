import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const source=readFileSync(new URL('../app/HomePageClient.tsx',import.meta.url),'utf8')
const date=source.split('function MirrorMediumDateCard(')[1]?.split('function ymdKey(')[0]

test('the Date app mirror does not have a hard-coded inverted weekday badge',()=>{
  assert.ok(date)
  assert.doesNotMatch(date,/backgroundColor:\s*'#ffffff',\s*color:\s*'#000000'/)
  assert.match(date,/style=\{\{ color: textColor, borderTop:/)
})

test('editorial review is a separate concept screen, not the production mirror',()=>{
  const page=readFileSync(new URL('../app/editorial-lab/page.tsx',import.meta.url),'utf8')
  assert.match(page,/Editorial design laboratory/)
  assert.match(page,/editorialPlan\(/)
  assert.match(page,/visual study/i)
})
