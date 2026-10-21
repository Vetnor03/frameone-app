import test from 'node:test'
import assert from 'node:assert/strict'
import {EDITORIAL_MODULES,composeEditorialModule,auditEditorialComposition,
  estimatedTextWidth} from '../app/lib/editorialComposition.mjs'

test('all eleven modules fit and center automatically across every grid and theme',()=>{
  const failures=[]
  let checked=0
  for(const moduleName of EDITORIAL_MODULES)
    for(let columns=1;columns<=4;columns++)
      for(let rows=1;rows<=4;rows++)
        for(const theme of ['light','dark']){
          const width=columns*200,height=rows*120
          const composition=composeEditorialModule(moduleName,width,height)
          const issues=auditEditorialComposition(composition)
          if(issues.length)failures.push(moduleName+' '+columns+'x'+rows+' '+theme+': '+issues.join(', '))
          checked++
        }
  assert.equal(checked,352)
  assert.deepEqual(failures,[])
})

test('short-wide Date fits all three facts, without the month being clipped',()=>{
  const c=composeEditorialModule('date',400,120)
  assert.equal(c.mode,'ribbon')
  assert.deepEqual(c.blocks.map(block=>block.lines[0]),['Wednesday','21','October 2026'])
  assert.deepEqual(auditEditorialComposition(c),[])
})

test('tall Date and medium Date center their complete content groups',()=>{
  for(const [w,h] of [[200,360],[200,480],[400,360]]){
    const composition=composeEditorialModule('date',w,h)
    const area=composition.body
    const blocks=composition.blocks
    const top=Math.min(...blocks.map(x=>x.y))
    const bottom=Math.max(...blocks.map(x=>x.y+x.h))
    assert.ok(Math.abs((top+bottom)/2-(area.y+area.h/2))<1)
    assert.ok(top>area.y)
    assert.ok(bottom<area.y+area.h)
  }
})

test('a narrow Surf still has a six-block score and protected primary label',()=>{
  const c=composeEditorialModule('surf',200,120)
  assert.ok(c.blocks.some(b=>b.type==='score'))
  assert.ok(c.blocks.some(b=>b.id==='primary'&&b.lines.length))
  assert.deepEqual(auditEditorialComposition(c),[])
})

test('all text bounding estimates stay inside their assigned width',()=>{
  for(const moduleName of EDITORIAL_MODULES)
    for(let c=1;c<=4;c++)for(let r=1;r<=4;r++){
      const view=composeEditorialModule(moduleName,c*200,r*120)
      for(const block of view.blocks)if(block.type==='text')
        for(const line of block.lines)assert.ok(
          estimatedTextWidth(line,block.fontSize,block.serif)<=block.w+0.6,
          moduleName+' '+c+'x'+r+' '+block.id+': '+line
        )
    }
})
