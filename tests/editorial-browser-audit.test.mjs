import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const lab=readFileSync(new URL('../app/editorial-lab/page.tsx',import.meta.url),'utf8')
test('editorial lab measures actual browser text glyphs across the entire matrix automatically',()=>{
  assert.match(lab,/useEffect\(\(\)=>\{/)
  assert.match(lab,/document\.fonts\.ready\.then\(check/)
  assert.match(lab,/getBBox\(\)/)
  assert.match(lab,/probeCases=useMemo\(\(\)=>EDITORIAL_MODULES\.flatMap/)
  assert.match(lab,/data-audit-block=\{block\.id\}/)
  assert.match(lab,/Browser typography issues detected/)
})
