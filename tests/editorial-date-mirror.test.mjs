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
  assert.match(page,/browser concept/i)
})


test('full Date mirror composes editorial hero and two calendars without obscuring holidays',()=>{
  const source=readFileSync(new URL('../app/HomePageClient.tsx',import.meta.url),'utf8')
  const date=source.split('function MirrorXLDateView(')[1]?.split('function ',1)[0]
  assert.ok(date)
  assert.match(date,/gridTemplateColumns: 'minmax\(0,48fr\) minmax\(0,52fr\)'/)
  assert.match(date,/EditorialBotanicalSprig/)
  assert.match(date,/upcomingMirrorHolidays\(holidays\)\.slice\(0, 2\)/)
  assert.match(date,/monthOffset=\{1\}/)
})
test('mirror theme honors actual black and white e-paper ink and paper',()=>{
  const source=readFileSync(new URL('../app/HomePageClient.tsx',import.meta.url),'utf8')
  const mirror=source.split('function LandscapeFrameMirror(')[1]?.split('function PickerModal(')[0]
  assert.match(mirror,/const background = isDark \? '#000000' : '#FFFFFF'/)
  assert.match(mirror,/const textColor = isDark \? '#FFFFFF' : '#000000'/)
})

test('editorial lab builds a 16-rectangle matrix and exposes computed audit',()=>{
  const source=readFileSync(new URL('../app/editorial-lab/page.tsx',import.meta.url),'utf8')
  assert.match(source,/spans\.flatMap\(cols=>spans\.map\(rows=>/)
  assert.match(source,/useState<Cell>\('4x4'\)/)
  assert.match(source,/auditEditorialComposition/)
  assert.match(source,/View all 16 shapes/)
})
