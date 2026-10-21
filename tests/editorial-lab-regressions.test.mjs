import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {EDITORIAL_MODULES,EDITORIAL_SAMPLES,composeEditorialModule,auditEditorialComposition} from
  '../app/lib/editorialComposition.mjs'

const source=readFileSync(new URL('../app/editorial-lab/page.tsx',import.meta.url),'utf8')

test('Surf has six physical-style filled rating blocks, not a numeric fraction',()=>{
  assert.equal(EDITORIAL_SAMPLES.surf.primary,'Poor to Fair')
  assert.doesNotMatch(source,/primary:'3 \/ 6'/)
  assert.match(source,/function RatingBlocks\(/)
  assert.match(source,/Array\.from\(\{length:6\}/)
  assert.match(source,/fill=\{index<3\?ink:'none'\}/)
})

test('concept Lab is a separate and explicitly non-pixel-perfect preview',()=>{
  assert.match(source,/Editorial design laboratory/)
  assert.match(source,/not a pixel-perfect physical firmware preview/)
  assert.match(source,/composeEditorialModule\(module,width,height\)/)
})
