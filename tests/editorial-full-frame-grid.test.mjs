import test from 'node:test'
import assert from 'node:assert/strict'
import {EDITORIAL_MODULES,composeEditorialModule,auditEditorialComposition} from
  '../app/lib/editorialComposition.mjs'
import {EDITORIAL_GRID_PRESETS,GRID_WIDTH,GRID_HEIGHT,
  makeEditorialGrid,randomEditorialGrid,randomEditorialReviewGrid,randomEditorialModules,validateEditorialGrid,
  auditEditorialGridQuality,scoreEditorialGrid,shuffleEditorialGridModules,
  editorialGridFamily,editorialOrnamentTiles,editorialGridSignature,
  editorialGroupingCues,editorialDensityRules
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

test('Round 5 PDF: half-frame columns must earn their visual dominance',()=>{
  // Page 3: Surf on the entire right half; score rectangles alone do not
  // constitute the strong illustrative anchor required by the new rules.
  const sparseSurf=[
    {id:'cell-1',x:0,y:0,cols:2,rows:2,module:'ski'},
    {id:'cell-2',x:0,y:2,cols:2,rows:2,module:'soccer'},
    {id:'cell-3',x:2,y:0,cols:2,rows:4,module:'surf'},
  ]
  assert.deepEqual(validateEditorialGrid(sparseSurf),[])
  assert.ok(auditEditorialGridQuality(sparseSurf).some(issue=>
    issue.includes('Oversized panel without sufficient visual focal point')))

  // Page 10: Same structural failure with a small fact in a large Ski panel.
  const sparseSki=[
    {id:'cell-1',x:0,y:0,cols:2,rows:4,module:'ski'},
    {id:'cell-2',x:2,y:0,cols:2,rows:2,module:'reminders'},
    {id:'cell-3',x:2,y:2,cols:2,rows:2,module:'groceries'},
  ]
  assert.deepEqual(validateEditorialGrid(sparseSki),[])
  assert.ok(auditEditorialGridQuality(sparseSki).some(issue=>
    issue.includes('Oversized panel without sufficient visual focal point')))

  // Hero-capable content can still use significant negative space.
  const day=composeEditorialModule('date',400,480)
  assert.ok(day.blocks.some(block=>block.id==='date'&&block.fontSize>=56))
})

test('Round 5 PDF: an information value appears only once despite punctuation',()=>{
  for(const [moduleName,width,height,fragment] of [
    ['surf',400,480,'Waves'],
    ['ski',400,240,'Fresh snow'],
  ]){
    const composition=composeEditorialModule(moduleName,width,height)
    const lines=composition.blocks.flatMap(block=>block.lines??[])
    if(moduleName==='surf'){
      const waveLines=lines.filter(line=>line.startsWith(fragment))
      assert.equal(waveLines.length,1,
        'Surf repeats wave height once as subtitle and once as an extra')
    }else{
      assert.ok(!lines.includes('Fresh snow · 15 cm'),
        'Ski re-displays the hero measurement as an extra')
    }
    assert.deepEqual(auditEditorialComposition(composition),[],moduleName)
  }
})

test('Round 6 PDF: ten-preview batches diversify geometry without relaxing quality',()=>{
  const variedCounts=[]
  for(const base of [1587897083,4242332852,2601801325,961269798,2989078282]){
    const recent=[]
    let previous=makeEditorialGrid('quarters'),previousId='quarters'
    const signatures=[]
    const families=[]
    for(let i=0;i<10;i++){
      const result=randomEditorialGrid(
        (base+i*0x9E3779B9)>>>0,previousId,previous,recent)
      assert.deepEqual(auditEditorialGridQuality(result.tiles),[],
        'A quality gate failed after novelty-aware selection, seed '+result.seed)
      assert.ok(scoreEditorialGrid(result.tiles)>48,'Low-quality layout in review batch')
      signatures.push(editorialGridSignature(result.tiles))
      families.push(editorialGridFamily(result.tiles))
      recent.push(result.tiles)
      previous=result.tiles
      previousId=result.presetId
    }
    const distinctShapes=new Set(signatures).size
    variedCounts.push(distinctShapes)
    assert.ok(distinctShapes>=5,'Contact sheet repeats too many shapes: '+base)
    assert.ok(new Set(families).size>=3,'Not enough compositional families: '+base)
    const counts=new Map()
    for(const signature of signatures)
      counts.set(signature,(counts.get(signature)??0)+1)
    assert.ok(Math.max(...counts.values())<=4,
      'One geometry dominates the ten-preview review batch: '+base)
  }
  assert.ok(variedCounts.some(n=>n>=7),'No sufficiently varied contact sheet')
})

test('Round 6 PDF: narrow columns cannot use tiny primary content as an anchor',()=>{
  const groceries={id:'cell-1',x:0,y:0,cols:1,rows:2,module:'groceries'}
  const others=[
    {id:'cell-2',x:1,y:0,cols:3,rows:2,module:'news'},
    {id:'cell-3',x:0,y:2,cols:2,rows:2,module:'stocks'},
    {id:'cell-4',x:2,y:2,cols:2,rows:2,module:'weather'},
  ]
  const tiles=[groceries,...others]
  assert.deepEqual(validateEditorialGrid(tiles),[])
  assert.ok(auditEditorialGridQuality(tiles).some(issue=>
    issue.includes('Narrow module lacks legible visual anchor')))
})

test('Round 8 PDFs: horizontal ribbons never repeat the same supporting fact',()=>{
  // PDF (5), page 10: Surf Waves appeared twice with different punctuation.
  const surf=composeEditorialModule('surf',800,120)
  assert.equal(surf.mode,'editorial-ribbon')
  const support=surf.blocks.filter(b=>b.id==='detail'||b.id.startsWith('extra-'))
  const waveRows=support.flatMap(b=>b.lines).filter(line=>line.startsWith('Waves'))
  assert.equal(waveRows.length,1,
    'The wave measurement should occur once, even when punctuation differs')
  assert.ok(surf.blocks.some(b=>b.id==='rating'&&b.type==='score'),
    'A compact Surf ribbon retains its rating bar instead of duplicating rows')
  assert.deepEqual(auditEditorialComposition(surf),[])

  for(const moduleName of EDITORIAL_MODULES.filter(m=>m!=='date')){
    for(const [width,height] of [[800,120],[800,240],[400,240]]){
      const c=composeEditorialModule(moduleName,width,height)
      assert.deepEqual(auditEditorialComposition(c),[],
        'Duplicate or layout issue in '+moduleName+' '+width+'x'+height)
    }
  }
})

test('Round 8 PDFs: duplicated user content is normalized before disclosure',()=>{
  const sample={
    primary:'Wave conditions',
    detail:'Waves 0.8–1.2 m',
    extras:[
      'Waves · 0.8–1.2 m',
      'WAVES: 0.8–1.2 m',
      'Swell period · 10 s',
      'Swell period: 10 s',
      'Wind · NE 4 m/s',
    ],
  }
  const ribbon=composeEditorialModule('surf',800,120,{sample})
  const lines=ribbon.blocks.flatMap(b=>b.lines??[])
  const allWaves=lines.filter(line=>line.toLowerCase().includes('waves 0.8'))
  assert.equal(allWaves.length,1,allWaves.join(' | '))
  assert.deepEqual(auditEditorialComposition(ribbon),[])
  const richer=composeEditorialModule('surf',800,480,{sample})
  assert.deepEqual(auditEditorialComposition(richer),[])
  const extras=richer.blocks.filter(b=>b.id.startsWith('extra-'))
    .flatMap(b=>b.lines)
  assert.ok(!extras.some(line=>line.toLowerCase().includes('waves 0.8')))
  assert.equal(extras.filter(line=>line.startsWith('Swell period')).length,1)
})

test('Round 9 PDFs: text-led panels use available space for legible headlines',()=>{
  // PDF (7), page 7: News had a very small headline despite a full 2×2
  // quadrant. Test a shared rule for all text-dominant modules, not an
  // individual screenshot override.
  for(const moduleName of ['news','reminders','assistant','groceries']){
    const quadrant=composeEditorialModule(moduleName,400,240)
    const headline=quadrant.blocks.find(b=>b.id==='primary')
    assert.ok(headline&&headline.fontSize>=16,
      moduleName+' text hierarchy too weak in 2×2 cell')
    if(moduleName==='news')assert.equal(headline.lines.join(' '),
      'Aker BP-lederforeningen innkaller til ekstraordinært møte',
      'News main headline must not be cut to a meaningless fragment')
    assert.deepEqual(auditEditorialComposition(quadrant),[],moduleName)
  }
  const compactNews=composeEditorialModule('news',400,120)
  assert.ok(compactNews.blocks.find(b=>b.id==='primary')?.fontSize>=17)
  assert.deepEqual(auditEditorialComposition(compactNews),[])
})

test('Round 10 PDFs: maximize legible size without dropping headline meaning',()=>{
  const lead='Aker BP-lederforeningen innkaller til ekstraordinært møte'
  for(const [width,height] of [[400,240],[400,360],[600,240],[800,240],[800,480]]){
    const c=composeEditorialModule('news',width,height)
    const primary=c.blocks.find(b=>b.id==='primary')
    assert.ok(primary, 'No headline at '+width+'×'+height)
    assert.equal(primary.lines.join(' '),lead,
      'Lost words from headline at '+width+'×'+height)
    assert.ok(!primary.lines.some(line=>line.includes('…')),
      'Incorrect ellipsis at '+width+'×'+height)
    assert.deepEqual(auditEditorialComposition(c),[])
  }
  const small=composeEditorialModule('news',400,120)
  assert.ok(small.blocks.find(b=>b.id==='primary').fontSize>=15)
})

test('Round 10 PDFs: longer headlines adapt before truncating',()=>{
  const short='Kunstutstilling åpner i Stavanger sentrum'
  const long='Aker BP-lederforeningen innkaller til ekstraordinært møte'
  for(const width of [400,600,800]){
    const shortView=composeEditorialModule('news',width,240,
      {sample:{primary:short}})
    const longView=composeEditorialModule('news',width,240,
      {sample:{primary:long}})
    const small=shortView.blocks.find(b=>b.id==='primary')
    const large=longView.blocks.find(b=>b.id==='primary')
    assert.ok(small.fontSize>=large.fontSize,
      'Short lead should not get smaller typography than a long lead')
    assert.equal(large.lines.join(' '),long,
      'No truncation allowed when full headline fits two lines')
    assert.deepEqual(auditEditorialComposition(shortView),[])
    assert.deepEqual(auditEditorialComposition(longView),[])
  }
})

test('Round 10 PDF: randomized cells never show a clipped primary headline',()=>{
  let checked=0
  for(let seed=4000;seed<4350;seed++){
    const layout=randomEditorialGrid(seed)
    assert.deepEqual(auditEditorialGridQuality(layout.tiles),[],
      'Randomizer accepted clipped headline at seed '+seed)
    for(const tile of layout.tiles){
      const c=composeEditorialModule(tile.module,tile.cols*200,tile.rows*120)
      const lead=c.blocks.find(block=>block.id==='primary')
      if(!lead)continue
      assert.ok(lead.lines.every(line=>!line.endsWith('…')),
        'Cut-off main headline in '+tile.module+' '+tile.cols+'×'+tile.rows+
        ', seed '+seed)
      checked++
    }
  }
  assert.ok(checked>800)
})

test('Round 11: wide one-row modules read as a single recognizable group',()=>{
  for(const moduleName of ['stocks','groceries','news','reminders','soccer','weather','countdown','date']){
    for(const width of [600,800]){
      const c=composeEditorialModule(moduleName,width,120)
      const labels=c.blocks.filter(b=>b.type==='text'&&b.lines?.length)
      // Text may span full-width for longer headlines, but text ANCHORS
      // must cluster around the same center (no remote left/middle/right).
      const anchors=labels.map(b=>b.x+b.w/2)
      const span=Math.max(...anchors)-Math.min(...anchors)
      assert.ok(span<width*.20,
        moduleName+' '+width+'×120 has detached text groups, span '+span)
      assert.deepEqual(auditEditorialComposition(c),[],
        'Overflow after regrouping '+moduleName+' '+width)
    }
  }
  const eq=composeEditorialModule('stocks',600,120)
  assert.deepEqual(eq.blocks.filter(b=>b.type==='text')
    .map(b=>b.id).slice(0,3),['heading','primary','detail'])
  const date=composeEditorialModule('date',600,120)
  assert.equal(date.mode,'ribbon')
  assert.deepEqual(date.blocks.map(b=>b.lines[0]),
    ['October 2026','21','Wednesday'])
})

test('Round 11: only adjacent matching horizontal bands receive a separator',()=>{
  // Screenshot layout: Countdown left, two wide rows right,
  // News and Groceries below. Equinor must visually belong to its own row.
  const screenshot=[
    {id:'countdown',x:0,y:0,cols:1,rows:2,module:'countdown'},
    {id:'equinor',x:1,y:0,cols:3,rows:1,module:'stocks'},
    {id:'date',x:1,y:1,cols:3,rows:1,module:'date'},
    {id:'news',x:0,y:2,cols:2,rows:2,module:'news'},
    {id:'groceries',x:2,y:2,cols:2,rows:2,module:'groceries'},
  ]
  assert.deepEqual(validateEditorialGrid(screenshot),[])
  assert.deepEqual(editorialGroupingCues(screenshot),['equinor'])
  assert.deepEqual(editorialGroupingCues(makeEditorialGrid('quarters')),[])
  assert.deepEqual(editorialGroupingCues(makeEditorialGrid('halves-horizontal')),[])
  // A run of three wide bands gets one separator per actual boundary.
  const ribbons=[
    {id:'one',x:0,y:0,cols:4,rows:1,module:'stocks'},
    {id:'two',x:0,y:1,cols:4,rows:1,module:'date'},
    {id:'three',x:0,y:2,cols:4,rows:1,module:'news'},
    {id:'four',x:0,y:3,cols:4,rows:1,module:'weather'},
  ]
  assert.deepEqual(editorialGroupingCues(ribbons),['one','two','three'])
})

test('Customer-authored sixteen-cell grids remain valid with any module assignments',()=>{
  const tiles=makeEditorialGrid('sixteen')
  assert.equal(tiles.length,16)
  assert.deepEqual(validateEditorialGrid(tiles),[])
  const density=editorialDensityRules(tiles)
  assert.equal(density.mode,'fine-grid')
  assert.equal(Object.values(density.boundaries).filter(edge=>edge.right).length,12)
  assert.equal(Object.values(density.boundaries).filter(edge=>edge.bottom).length,12)
  for(let i=0;i<EDITORIAL_MODULES.length;i++){
    const c=composeEditorialModule(EDITORIAL_MODULES[i],200,120)
    if(EDITORIAL_MODULES[i]!=='date'){
      assert.equal(c.mode,'miniature',EDITORIAL_MODULES[i])
      for(const id of ['heading','primary','detail'])
        assert.ok(c.blocks.some(b=>b.id===id&&b.lines.length),
          'Miniature '+EDITORIAL_MODULES[i]+' lost '+id)
    }
    assert.deepEqual(auditEditorialComposition(c),[],
      'Geometry failure in customer-sized '+EDITORIAL_MODULES[i])
  }
  const changed=tiles.map((tile,i)=>({...tile,
    module:EDITORIAL_MODULES[(i*7)%EDITORIAL_MODULES.length]}))
  assert.deepEqual(validateEditorialGrid(changed),[])
  assert.deepEqual(validateEditorialGrid(shuffleEditorialGridModules(2938,changed)),[])
})

test('Visual boundaries change with density, never the validity of a layout',()=>{
  for(const preset of EDITORIAL_GRID_PRESETS){
    const tiles=makeEditorialGrid(preset.id)
    const before=JSON.stringify(tiles)
    const policy=editorialDensityRules(tiles)
    assert.ok(['open','chapter-grid','fine-grid'].includes(policy.mode))
    assert.deepEqual(validateEditorialGrid(tiles),[])
    assert.equal(JSON.stringify(tiles),before,'Density policy modified the grid')
  }
  assert.equal(editorialDensityRules(makeEditorialGrid('quarters')).mode,'open')
  assert.equal(editorialDensityRules(makeEditorialGrid('eight-columns')).mode,'chapter-grid')
})

test('Miniature score graphics never collide with their supporting caption',()=>{
  for(const [w,h] of [[200,120],[200,240],[400,120],[600,120]]){
    const c=composeEditorialModule('surf',w,h)
    const score=c.blocks.find(b=>b.id==='rating')
    const detail=c.blocks.find(b=>b.id==='detail')
    if(!score||!detail)continue
    assert.ok(score.h>=14,'Surf score needs its actual rendered height')
    assert.ok(detail.y-(score.y+score.h)>=4,
      'Surf caption too close to score at '+w+'×'+h)
    assert.deepEqual(auditEditorialComposition(c),[],'Surf '+w+'×'+h)
  }
})

test('Dense dividers preserve orientation with one quiet focal junction',()=>{
  const sixteen=makeEditorialGrid('sixteen')
  const policy=editorialDensityRules(sixteen)
  assert.equal(policy.mode,'fine-grid')
  assert.equal(Object.values(policy.boundaries).filter(b=>b.centralJunction).length,1)
  assert.equal(Object.values(policy.boundaries).filter(b=>b.right).length,12)
  assert.equal(Object.values(policy.boundaries).filter(b=>b.bottom).length,12)
  const medium=makeEditorialGrid('eight-columns')
  assert.equal(editorialDensityRules(medium).mode,'chapter-grid')
  const sparse=makeEditorialGrid('quarters')
  assert.equal(editorialDensityRules(sparse).mode,'open')
  assert.ok(Object.values(editorialDensityRules(sparse).boundaries)
    .every(b=>!b.centralJunction))
})

test('Round 12 PDFs: page-level heading ornaments form an intentional row rhythm',()=>{
  // PDF (18), page 4: previously both right-hand tiles gained elaborate
  // book dividers while the two left tiles were completely undecorated.
  const quarterFrame=[
    {id:'ski',x:0,y:0,cols:2,rows:2,module:'ski'},
    {id:'reminders',x:2,y:0,cols:2,rows:2,module:'reminders'},
    {id:'stocks',x:0,y:2,cols:2,rows:2,module:'stocks'},
    {id:'news',x:2,y:2,cols:2,rows:2,module:'news'},
  ]
  assert.deepEqual(validateEditorialGrid(quarterFrame),[])
  const accents=editorialOrnamentTiles(quarterFrame)
  assert.equal(accents.length,2)
  const chosen=quarterFrame.filter(tile=>accents.includes(tile.id))
  assert.equal(chosen[0].y,chosen[1].y,
    'Chapter rules should share a common horizontal baseline where possible')
  assert.ok(chosen.some(tile=>tile.x===0)&&chosen.some(tile=>tile.x===2),
    'Both ornaments must not occupy only the right-hand column')
  // No renderer art change, only page-level decisions.
  for(const tile of quarterFrame)
    assert.deepEqual(auditEditorialComposition(
      composeEditorialModule(tile.module,tile.cols*200,tile.rows*120)),[])
})

test('Round 12 PDFs: stacked bands have one separator, never a second Date rule',()=>{
  // PDF (17), page 9: the full-width News ribbon and Date ribbon had two
  // competing rules close together.
  const tiles=[
    {id:'ski',x:0,y:0,cols:2,rows:2,module:'ski'},
    {id:'countdown',x:2,y:0,cols:2,rows:2,module:'countdown'},
    {id:'news',x:0,y:2,cols:4,rows:1,module:'news'},
    {id:'date',x:0,y:3,cols:4,rows:1,module:'date'},
  ]
  assert.deepEqual(validateEditorialGrid(tiles),[])
  assert.deepEqual(editorialGroupingCues(tiles),['news'])
  assert.ok(!editorialOrnamentTiles(tiles).includes('date'),
    'Date heading must not add another horizontal rule near the existing boundary')
  assert.deepEqual(validateEditorialGrid(tiles),[],
    'Customer layout is always valid regardless of aesthetics')
  assert.equal(editorialOrnamentTiles(makeEditorialGrid('sixteen')).length,0,
    'Dense grids use the surrounding line grammar, not repeated ornaments')
})

test('100-layout QA reviews exercise every customer-legal density from 1–16',()=>{
  const counts=new Map()
  const signatures=new Set()
  for(let index=0;index<100;index++){
    const density=1+((index*7)%16)
    const seed=(3642187536+index*0x9E3779B9)>>>0
    const design=randomEditorialReviewGrid(seed,density)
    assert.equal(design.seed,seed)
    assert.equal(design.tiles.length,density)
    assert.deepEqual(validateEditorialGrid(design.tiles),[])
    assert.deepEqual(randomEditorialReviewGrid(seed,density),design)
    assert.ok(design.tiles.every(t=>t.cols>=1&&t.rows>=1))
    assert.ok(design.tiles.every(t=>EDITORIAL_MODULES.includes(t.module)))
    counts.set(density,(counts.get(density)??0)+1)
    signatures.add(design.tiles.map(t=>
      [t.x,t.y,t.cols,t.rows,t.module].join(',')).join('|'))
  }
  assert.deepEqual([...counts.keys()].sort((a,b)=>a-b),
    Array.from({length:16},(_,i)=>i+1))
  assert.ok(Math.min(...counts.values())>=6,
    'Each 1–16 module density must occur at least six times')
  assert.ok(signatures.size>=80,'Layouts are insufficiently varied')
})

test('QA stress sampling never rejects an intentionally dense valid customer layout',()=>{
  const a=randomEditorialReviewGrid(19477170,16)
  assert.equal(a.tiles.length,16)
  assert.ok(a.tiles.every(t=>t.cols===1&&t.rows===1))
  assert.deepEqual(validateEditorialGrid(a.tiles),[])
  assert.equal(editorialDensityRules(a.tiles).mode,'fine-grid')
  assert.throws(()=>randomEditorialReviewGrid(12,0),RangeError)
  assert.throws(()=>randomEditorialReviewGrid(12,17),RangeError)
})

test('Round 16: full frame numeric facts receive genuine display-scale typography',()=>{
  for(const moduleName of ['countdown','stocks','soccer','ski','weather']){
    const full=composeEditorialModule(moduleName,800,480)
    const quarter=composeEditorialModule(moduleName,400,240)
    const fullLead=full.blocks.find(block=>block.id==='primary')
    const quarterLead=quarter.blocks.find(block=>block.id==='primary')
    assert.ok(fullLead&&quarterLead)
    assert.ok(fullLead.fontSize>=70,moduleName+' too small on full screen')
    assert.ok(fullLead.fontSize>quarterLead.fontSize,
      moduleName+' does not exploit the available full frame')
    assert.deepEqual(auditEditorialComposition(full),[],
      'Full-screen typography clips '+moduleName)
    assert.deepEqual(auditEditorialComposition(quarter),[],
      'Medium typography regressed '+moduleName)
  }
})

test('Round 16: short News cell uses context-preserving headlines',()=>{
  const tiny=composeEditorialModule('news',200,120)
  const lead=tiny.blocks.find(block=>block.id==='primary')
  assert.ok(lead)
  assert.ok(lead.lines.length>=2&&lead.lines.length<=3)
  assert.ok(!lead.lines.some(line=>line.endsWith('…')),
    'Tiny headlines must use all available vertical space before clipping')
  assert.deepEqual(auditEditorialComposition(tiny),[])
})

test('Round 16: repeated modules are spread through dense QA layouts',()=>{
  const seeds=[3438288,482138944,3819704928,2383602960,
    2432900466,735521833]
  for(const seed of seeds){
    const design=randomEditorialReviewGrid(seed,16)
    assert.deepEqual(validateEditorialGrid(design.tiles),[])
    assert.deepEqual(randomEditorialReviewGrid(seed,16),design)
    const seen=new Map()
    for(const tile of design.tiles)
      seen.set(tile.module,(seen.get(tile.module)||0)+1)
    assert.equal([...seen.values()].reduce((sum,n)=>sum+n,0),16)
    const repeated=design.tiles.filter(t=>seen.get(t.module)>1)
    for(const t of repeated){
      const others=repeated.filter(o=>o.id!==t.id&&o.module===t.module)
      assert.ok(others.every(o=>Math.abs(t.x-o.x)+Math.abs(t.y-o.y)>=2),
        'Duplicate modules remain adjacent in seed '+seed)
    }
  }
})

test('Round 18: sparse topology can earn quiet dividing contours without limiting customer choices',()=>{
  const cases=[
    {name:'balanced quarters remain open',mode:'open',tiles:[
      {x:0,y:0,cols:2,rows:2},{x:2,y:0,cols:2,rows:2},
      {x:0,y:2,cols:2,rows:2},{x:2,y:2,cols:2,rows:2}]},
    {name:'four full-width horizontal ribbons remain open',mode:'open',tiles:[
      {x:0,y:0,cols:4,rows:1},{x:0,y:1,cols:4,rows:1},
      {x:0,y:2,cols:4,rows:1},{x:0,y:3,cols:4,rows:1}]},
    {name:'asymmetrical three columns gain contour cues',mode:'contour',tiles:[
      {x:0,y:0,cols:2,rows:4},{x:2,y:0,cols:1,rows:4},
      {x:3,y:0,cols:1,rows:4}]},
    {name:'ambiguous five-module broken mosaic gains contour cues',mode:'contour',tiles:[
      {x:0,y:0,cols:2,rows:2},{x:2,y:0,cols:1,rows:2},
      {x:3,y:0,cols:1,rows:4},{x:0,y:2,cols:1,rows:2},
      {x:1,y:2,cols:2,rows:2}]},
    {name:'simple halves stay minimal',mode:'open',tiles:[
      {x:0,y:0,cols:2,rows:4},{x:2,y:0,cols:2,rows:4}]},
  ]
  for(const item of cases){
    const grid=item.tiles.map((tile,index)=>({
      ...tile,id:'cell-'+(index+1),
      module:EDITORIAL_MODULES[index%EDITORIAL_MODULES.length]}))
    assert.deepEqual(validateEditorialGrid(grid),[],item.name)
    const before=JSON.stringify(grid)
    assert.equal(editorialDensityRules(grid).mode,item.mode,item.name)
    assert.equal(JSON.stringify(grid),before,
      'The contour rule must never modify a user-created grid')
  }
})

test('Round 18: short informative full-screen messages earn visual presence',()=>{
  const full=composeEditorialModule('assistant',800,480)
  const half=composeEditorialModule('assistant',400,240)
  const lead=full.blocks.find(b=>b.id==='primary')
  const smaller=half.blocks.find(b=>b.id==='primary')
  assert.ok(lead&&smaller)
  assert.ok(lead.fontSize>=40,'A single empty-status module must be readable')
  assert.ok(lead.fontSize>smaller.fontSize)
  assert.deepEqual(auditEditorialComposition(full),[])
  // Long news headlines remain measured and readable, not simply enlarged.
  const news=composeEditorialModule('news',800,480)
  const headline=news.blocks.find(b=>b.id==='primary')
  assert.ok(headline)
  assert.ok(headline.fontSize<=30)
  assert.deepEqual(auditEditorialComposition(news),[])
})
