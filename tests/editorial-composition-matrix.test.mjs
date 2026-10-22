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

test('approved Surf 2x2 reference retains verdict, rating, waves, arrows, period and wind',()=>{
  const medium=composeEditorialModule('surf',400,240)
  assert.equal(medium.mode,'surf-medium-reference')
  const ids=medium.blocks.map(b=>b.id)
  assert.deepEqual(ids,[
    'spot','spot-underline','column-divider','rating-verdict','rating',
    'wave-range','details-heading','swell-arrow','wind-arrow',
    'wave-period-icon','wind-speed-icon','swell-period','wind-speed',
  ])
  assert.equal(medium.blocks.find(b=>b.id==='rating').type,'score')
  assert.equal(medium.blocks.filter(b=>b.type==='direction').length,2)
  assert.deepEqual(auditEditorialComposition(medium),[])
  assert.notEqual(composeEditorialModule('surf',200,240).mode,'surf-medium-reference')
  assert.notEqual(composeEditorialModule('surf',400,360).mode,'surf-medium-reference')
})

test('Surf Medium retains original physical mark sizing and vertical composition',()=>{
  const layout=composeEditorialModule('surf',400,240)
  const named=Object.fromEntries(layout.blocks.map(block=>[block.id,block]))
  assert.equal(layout.mode,'surf-medium-reference')
  assert.equal(named.rating.w,150)
  assert.equal(named.rating.h,14)
  assert.equal(named.rating.y,151)
  assert.equal(named['rating-verdict'].y,89)
  assert.equal(named['wave-range'].y,205)
  assert.equal(named['details-heading'].y,89)
  assert.equal(named['column-divider'].x,200)
  assert.equal(named['column-divider'].h,133)
  assert.equal(named['swell-period'].y,named['wind-speed'].y)
  assert.ok(named['swell-arrow'].x < named['wind-arrow'].x)
  assert.deepEqual(auditEditorialComposition(layout),[])
})

test('full-screen data-rich modules show additional information instead of enlarged whitespace',()=>{
  for(const name of ['reminders','news','surf','ski','soccer','stocks','groceries']){
    const small=composeEditorialModule(name,400,240)
    const xl=composeEditorialModule(name,800,480)
    assert.equal(xl.mode,'information-spread',name)
    assert.ok(xl.blocks.filter(b=>b.id.startsWith('extra-')).length>=4,name)
    assert.ok(xl.blocks.filter(b=>b.id.startsWith('extra-')).length>
              small.blocks.filter(b=>b.id.startsWith('extra-')).length,name)
    assert.ok(xl.blocks.some(b=>b.id==='section-heading'),name)
    assert.deepEqual(auditEditorialComposition(xl),[],name)
  }
  for(const name of ['date','countdown','assistant']){
    const xl=composeEditorialModule(name,800,480)
    assert.notEqual(xl.mode,'information-spread',
      'Do not fabricate list content for '+name)
  }
})
test('full Weather pairs reserved botanical art with useful forecast details',()=>{
  const weather=composeEditorialModule('weather',800,480)
  assert.ok(weather.blocks.some(b=>b.id==='weather-botanical'))
  assert.ok(weather.blocks.filter(b=>b.id.startsWith('extra-')).length>=4)
  assert.equal(weather.blocks.some(b=>b.id==='weather-landscape'),false)
  assert.deepEqual(auditEditorialComposition(weather),[])
})
