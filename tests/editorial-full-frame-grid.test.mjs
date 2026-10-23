import test from 'node:test'
import assert from 'node:assert/strict'
import {EDITORIAL_MODULES,composeEditorialModule,auditEditorialComposition} from
  '../app/lib/editorialComposition.mjs'
import {EDITORIAL_GRID_PRESETS,GRID_WIDTH,GRID_HEIGHT,
  makeEditorialGrid,randomEditorialGrid,randomEditorialModules,validateEditorialGrid,
  auditEditorialGridQuality,scoreEditorialGrid,shuffleEditorialGridModules,
  editorialGridFamily,editorialOrnamentTiles
} from '../app/lib/editorialGridLab.mjs'

test('all named 4x4 layouts completely cover the frame without collisions',()=>{
  assert.ok(EDITORIAL_GRID_PRESETS.length>=16)
  for(const preset of EDITORIAL_GRID_PRESETS){
    const cells=makeEditorialGrid(preset.id)
    assert.deepEqual(validateEditorialGrid(cells),[],preset.id)
    assert.equal(cells.length,preset.rects.length,preset.id)
    let area=0
    for(const tile of cells){
      area+=tile.cols*200*tile.rows*120
      const c=composeEditorialModule(tile.module,tile.cols*200,tile.rows*120)
      assert.deepEqual(auditEditorialComposition(c),[],preset.id+': '+tile.id)
    }
    assert.equal(area,GRID_WIDTH*GRID_HEIGHT,preset.id)
  }
})

test('seeded randomized 4x4 mosaics are reproducible and correctly tiled',()=>{
  const different=new Set()
  let procedural=0,curated=0
  for(let seed=0;seed<600;seed++){
    const value=randomEditorialGrid(seed)
    assert.deepEqual(randomEditorialGrid(seed),value,'not reproducible: '+seed)
    assert.deepEqual(validateEditorialGrid(value.tiles),[],seed)
    assert.ok(value.tiles.length>=1&&value.tiles.length<=16)
    for(const tile of value.tiles){
      assert.ok(EDITORIAL_MODULES.includes(tile.module))
      assert.deepEqual(auditEditorialComposition(
        composeEditorialModule(tile.module,tile.cols*200,tile.rows*120)),
        [],seed+' '+tile.module)
    }
    different.add(value.presetId+JSON.stringify(
      value.tiles.map(({x,y,cols,rows,module})=>({x,y,cols,rows,module}))))
    if(value.presetId==='random')procedural++
    else curated++
  }
  assert.ok(procedural>150)
  assert.ok(curated>120)
  assert.ok(different.size>560)
})

test('individual shuffles avoid repeats until all eleven modules are used',()=>{
  for(const count of [1,4,8,11,16]){
    const modules=randomEditorialModules(17429,count)
    assert.equal(modules.length,count)
    assert.deepEqual(modules,randomEditorialModules(17429,count))
    assert.equal(new Set(modules.slice(0,Math.min(11,count))).size,
      Math.min(11,count))
  }
})

test('grid validation rejects collisions, gaps, illegal bounds and unknown modules',()=>{
  const tiles=makeEditorialGrid('quarters')
  assert.deepEqual(validateEditorialGrid(tiles),[])
  assert.ok(validateEditorialGrid(tiles.slice(1)).some(x=>x.startsWith('Uncovered')))
  const overlap=[...tiles,{...tiles[0],id:'duplicate'}]
  assert.ok(validateEditorialGrid(overlap).some(x=>x.startsWith('Tile overlap')))
  const invalid=tiles.map((x,i)=>i===0?{...x,x:3,cols:2}:x)
  assert.ok(validateEditorialGrid(invalid).some(x=>x.startsWith('Invalid tile bounds')))
  const unknown=tiles.map((x,i)=>i===0?{...x,module:'fictional'}:x)
  assert.ok(validateEditorialGrid(unknown).some(x=>x.startsWith('Unknown module')))
})

test('a mixed frame uses its original Surf Medium reference in any 2x2 tile',()=>{
  const grid=makeEditorialGrid('quarters').map((t,i)=>({...t,
    module:['surf','weather','date','reminders'][i],
  }))
  assert.deepEqual(validateEditorialGrid(grid),[])
  const surf=composeEditorialModule(grid[0].module,grid[0].cols*200,grid[0].rows*120)
  assert.equal(surf.mode,'surf-medium-reference')
})

test('quality-gated randomization avoids unreadable tile shapes for 1000 seeds',()=>{
  let minScore=Infinity
  const groups=new Set()
  for(let seed=0;seed<1000;seed++){
    const result=randomEditorialGrid(seed,seed%2?'quarters':null)
    assert.deepEqual(auditEditorialGridQuality(result.tiles),[],String(seed))
    const score=scoreEditorialGrid(result.tiles)
    assert.ok(Number.isFinite(score),'Non-finite quality score for '+seed)
    minScore=Math.min(minScore,score)
    groups.add(result.presetId)
    for(const tile of result.tiles){
      if(tile.module==='surf'){
        const c=composeEditorialModule('surf',tile.cols*200,tile.rows*120)
        const primary=c.blocks.find(b=>b.id==='primary')
        // The approved 2×2 reference has a separately named verdict block.
        if(primary)assert.ok(primary.lines.every(line=>!line.includes('…')),
          'Surf verdict truncated for '+seed+' '+tile.cols+'×'+tile.rows)
      }
    }
  }
  assert.ok(groups.has('random'),'No generated mosaics')
  assert.ok(groups.size>=4,'Too few distinct layout families')
  assert.ok(minScore>50,'Weakest scored layout was '+minScore)
})

test('shuffle of an existing layout preserves every rectangle and improves module assignment',()=>{
  const layout=makeEditorialGrid('hero-sidebar')
  for(let seed=0;seed<50;seed++){
    const shuffled=shuffleEditorialGridModules(seed,layout)
    assert.deepEqual(validateEditorialGrid(shuffled),[])
    assert.deepEqual(shuffled.map(({x,y,cols,rows})=>[x,y,cols,rows]),
      layout.map(({x,y,cols,rows})=>[x,y,cols,rows]))
    assert.deepEqual(auditEditorialGridQuality(shuffled),[])
    assert.equal(new Set(shuffled.map(x=>x.module)).size,shuffled.length)
  }
  const tiny=makeEditorialGrid('sixteen')
  assert.deepEqual(validateEditorialGrid(shuffleEditorialGridModules(10,tiny)),[])
})

test('editorial randomizer varies composition families, not only module labels',()=>{
  const families=new Set(),presets=new Set(),counts=new Set()
  let previous=null,previousId=null
  let procedural=0,curated=0
  for(let seed=2000;seed<2500;seed++){
    const result=randomEditorialGrid(seed,previousId,previous)
    assert.deepEqual(auditEditorialGridQuality(result.tiles),[],String(seed))
    const family=editorialGridFamily(result.tiles)
    assert.notEqual(family,previous&&editorialGridFamily(previous),
      'Identical consecutive composition family: '+seed)
    assert.equal(result.family,family)
    families.add(family)
    presets.add(result.presetId)
    counts.add(result.tiles.length)
    if(result.presetId==='random')procedural++
    else curated++
    previous=result.tiles;previousId=result.presetId
  }
  assert.deepEqual([...families].sort(),['balanced','editorial','hero','mosaic'])
  assert.ok(presets.size>=6,'Too few curated/generative layout variants')
  assert.ok(counts.size>=4,'Too narrow a range of content densities')
  assert.ok(procedural>100&&curated>75,'One randomization mode is underrepresented')
})

test('emphasis is limited to one or two well-spaced chapter ornaments',()=>{
  for(const preset of EDITORIAL_GRID_PRESETS){
    const tiles=makeEditorialGrid(preset.id)
    const emphasized=editorialOrnamentTiles(tiles)
    assert.ok(emphasized.length<= (tiles.length>=4?2:1))
    assert.equal(new Set(emphasized).size,emphasized.length)
    assert.ok(emphasized.every(id=>tiles.some(tile=>tile.id===id)))
  }
})

test('medium-height wide panels add structure and do not repeat content',()=>{
  const weather=composeEditorialModule('weather',800,240)
  assert.ok(weather.blocks.some(block=>block.id==='weather-coast'))
  const match=composeEditorialModule('soccer',800,240)
  assert.equal(match.mode,'information-spread')
  assert.ok(match.blocks.some(block=>block.id==='section-heading'))
  const reminders=composeEditorialModule('reminders',800,240)
  assert.ok(reminders.blocks.some(block=>block.id==='reminder-time'))
  assert.ok(!reminders.blocks.some(block=>block.id==='detail'),
    'The lead reminder time should appear only once')
  assert.ok(!reminders.blocks.some(block=>block.lines?.some(line=>
    line.includes('Friday · 12:30 · Kontrolltime'))))
  const ski=composeEditorialModule('ski',400,240)
  assert.ok(!ski.blocks.some(block=>block.lines?.some(line=>line==='Fresh snow · 15 cm')))
  for(const c of [weather,match,reminders,ski])
    assert.deepEqual(auditEditorialComposition(c),[],c.module)
})

test('PDF review regression: oversized sparse modules are rejected globally',()=>{
  // Page 1: Countdown occupies half the frame for just three lines.
  const leftHeavy=[
    {id:'cell-1',x:0,y:0,cols:2,rows:4,module:'countdown'},
    {id:'cell-2',x:2,y:0,cols:2,rows:2,module:'groceries'},
    {id:'cell-3',x:2,y:2,cols:2,rows:2,module:'soccer'},
  ]
  assert.deepEqual(validateEditorialGrid(leftHeavy),[])
  assert.ok(auditEditorialGridQuality(leftHeavy).some(issue=>
    issue.includes('insufficient disclosure')))

  // Page 3: tall 1×4 AI Follow displays only a tiny island of text.
  const tallAssistant=[
    {id:'cell-1',x:0,y:0,cols:1,rows:4,module:'assistant'},
    {id:'cell-2',x:1,y:0,cols:3,rows:2,module:'reminders'},
    {id:'cell-3',x:1,y:2,cols:3,rows:2,module:'news'},
  ]
  assert.deepEqual(validateEditorialGrid(tallAssistant),[])
  assert.ok(auditEditorialGridQuality(tallAssistant).some(issue=>
    issue.includes('Underfilled tall column')))

  // Page 10: a full-width narrow cell must keep both the meaning and value.
  const countdown=composeEditorialModule('countdown',800,120)
  assert.equal(countdown.mode,'editorial-ribbon')
  assert.ok(countdown.blocks.some(block=>block.id==='heading'&&
    block.lines.includes('Countdown')))
  assert.ok(countdown.blocks.some(block=>block.id==='detail'&&
    block.lines.includes('Days until Christmas')))
  const groceries=composeEditorialModule('groceries',800,120)
  assert.ok(groceries.blocks.some(block=>block.id==='heading'&&
    block.lines.includes('Groceries')))
  // The actual PDF page 10 placed Countdown in a 2×1 cell.
  const shortCountdown=composeEditorialModule('countdown',400,120)
  assert.equal(shortCountdown.mode,'compact-summary')
  assert.ok(shortCountdown.blocks.some(block=>block.id==='heading'&&
    block.lines.includes('Countdown')))
  assert.ok(shortCountdown.blocks.some(block=>block.id==='detail'&&
    block.lines.includes('Days until Christmas')))
  for(const composition of [countdown,groceries,shortCountdown])
    assert.deepEqual(auditEditorialComposition(composition),[],composition.module)
})

test('full-width editorial ribbons always retain a human-readable identity',()=>{
  for(const width of [600,800]){
    for(const moduleName of EDITORIAL_MODULES.filter(name=>name!=='date')){
      const c=composeEditorialModule(moduleName,width,120)
      assert.equal(c.mode,'editorial-ribbon',moduleName)
      assert.ok(c.blocks.some(block=>block.id==='heading'&&block.lines?.length))
      assert.ok(c.blocks.some(block=>block.id==='primary'&&block.lines?.length))
      assert.ok(c.blocks.some(block=>block.id==='detail'&&block.lines?.length))
      assert.deepEqual(auditEditorialComposition(c),[],moduleName+' '+width)
    }
  }
})

test('hard quality gate never admits underfilled featured panels across 1000 seeds',()=>{
  let different=0
  const named=new Set()
  for(let seed=5000;seed<6000;seed++){
    const layout=randomEditorialGrid(seed)
    assert.deepEqual(auditEditorialGridQuality(layout.tiles),[],'seed '+seed)
    if(layout.presetId==='random')different++
    named.add(layout.presetId)
  }
  assert.ok(different>200)
  assert.ok(named.size>=4)
})

test('all compact 2×1 modules retain heading, key value, and context',()=>{
  for(const moduleName of EDITORIAL_MODULES.filter(name=>name!=='date')){
    const c=composeEditorialModule(moduleName,400,120)
    assert.equal(c.mode,'compact-summary',moduleName)
    for(const part of ['heading','primary','detail'])
      assert.ok(c.blocks.some(b=>b.id===part&&b.lines?.length),
        moduleName+' missing '+part)
    assert.deepEqual(auditEditorialComposition(c),[],moduleName)
  }
})
