import {EDITORIAL_MODULES,composeEditorialModule} from './editorialComposition.mjs'

// The test Lab uses the real frame's 800×480 logical canvas: four columns
// of 200 pixels and four rows of 120 pixels. All presets tile the full frame.
export const GRID_WIDTH=800
export const GRID_HEIGHT=480
export const GRID_COLS=4
export const GRID_ROWS=4
export const GRID_CELL_WIDTH=200
export const GRID_CELL_HEIGHT=120

const preset=(id,label,description,rects)=>Object.freeze({
  id,label,description,rects:rects.map(rect=>Object.freeze(rect)),
})

// Rectangles: [column, row, column span, row span]. No empty grid cells,
// clipped tiles or overlap. The irregular arrangements exercise cross-module
// edge cases that a single-cell preview cannot reveal.
export const EDITORIAL_GRID_PRESETS=Object.freeze([
  preset('full','Full frame','One 4×4 module',[[0,0,4,4]]),
  preset('halves-vertical','Two columns','Two 2×4 modules',[[0,0,2,4],[2,0,2,4]]),
  preset('halves-horizontal','Two rows','Two 4×2 modules',[[0,0,4,2],[0,2,4,2]]),
  preset('quarters','Four quarters','Four 2×2 modules',[[0,0,2,2],[2,0,2,2],[0,2,2,2],[2,2,2,2]]),
  preset('feature-left','Feature + stacked','Left 2×4 and two right 2×2',[[0,0,2,4],[2,0,2,2],[2,2,2,2]]),
  preset('feature-right','Stacked + feature','Two left 2×2 and right 2×4',[[0,0,2,2],[0,2,2,2],[2,0,2,4]]),
  preset('hero-sidebar','Wide hero + sidebar','A 3×4 panel and two 1×2 slots',[[0,0,3,4],[3,0,1,2],[3,2,1,2]]),
  preset('tall-strip','Tall strip','One 1×4 alongside two 3×2 panels',[[0,0,1,4],[1,0,3,2],[1,2,3,2]]),
  preset('top-banner','Top banner','A 4×1 ribbon above two 2×3 panels',[[0,0,4,1],[0,1,2,3],[2,1,2,3]]),
  preset('bottom-banner','Bottom banner','Two 2×3 panels above a 4×1 ribbon',[[0,0,2,3],[2,0,2,3],[0,3,4,1]]),
  preset('hero-four','Four-panel hero','Tall anchor with three varied companions',[
    [0,0,2,4],[2,0,2,2],[2,2,2,1],[2,3,2,1],
  ]),
  preset('hero-four-right','Right-hand hero','Three left companions beside tall anchor',[
    [0,0,2,2],[0,2,2,1],[0,3,2,1],[2,0,2,4],
  ]),
  preset('editorial-four','Four-panel folio','Two medium anchors, a featured panel and short footer',[
    [0,0,2,3],[0,3,2,1],[2,0,2,2],[2,2,2,2],
  ]),
  preset('three-columns','Three columns','Narrow, wide, narrow',[[0,0,1,4],[1,0,2,4],[3,0,1,4]]),
  preset('four-columns','Four columns','Four 1×4 vertical stacks',[[0,0,1,4],[1,0,1,4],[2,0,1,4],[3,0,1,4]]),
  preset('four-rows','Four rows','Four 4×1 horizontal ribbons',[[0,0,4,1],[0,1,4,1],[0,2,4,1],[0,3,4,1]]),
  preset('eight-columns','Eight tall rows','Eight 2×1 panels',Array.from({length:4},(_,row)=>[
    [0,row,2,1],[2,row,2,1],
  ]).flat()),
  preset('eight-rows','Eight thin columns','Eight 1×2 panels',Array.from({length:2},(_,row)=>[
    [0,row*2,1,2],[1,row*2,1,2],[2,row*2,1,2],[3,row*2,1,2],
  ]).flat()),
  preset('folio-five','Five-panel folio','Three substantial panels and two restrained ribbons',[
    [0,0,2,2],[2,0,2,1],[2,1,2,1],[0,2,2,2],[2,2,2,2],
  ]),
  preset('asymmetric-five','Asymmetric five','A feature balanced by varied supporting cells',[
    [0,0,1,2],[1,0,3,2],[0,2,2,2],[2,2,1,2],[3,2,1,2],
  ]),
  preset('mosaic-six','Six-panel mosaic','Two anchors with four compact supporting panels',[
    [0,0,2,2],[2,0,2,1],[2,1,2,1],[0,2,2,1],[0,3,2,1],[2,2,2,2],
  ]),
  preset('mixed-mosaic','Editorial mosaic','A different blend of seven cells',[
    [0,0,2,2],[2,0,2,1],[2,1,1,1],[3,1,1,1],
    [0,2,1,2],[1,2,2,2],[3,2,1,2],
  ]),
  preset('sixteen','All 16 cells','Every 1×1 cell occupied',Array.from({length:16},(_,i)=>[i%4,Math.floor(i/4),1,1])),
])

export function validateEditorialGrid(tiles){
  const issues=[]
  const occupied=new Map()
  for(const tile of tiles){
    const {x,y,cols,rows,id,module}=tile
    if(![x,y,cols,rows].every(Number.isInteger)||
       x<0||y<0||cols<1||rows<1||x+cols>GRID_COLS||y+rows>GRID_ROWS) {
      issues.push('Invalid tile bounds: '+id)
      continue
    }
    if(!EDITORIAL_MODULES.includes(module))
      issues.push('Unknown module: '+id)
    for(let row=y;row<y+rows;row++)for(let col=x;col<x+cols;col++){
      const key=row*GRID_COLS+col
      if(occupied.has(key))issues.push('Tile overlap: '+id+' and '+occupied.get(key))
      occupied.set(key,id)
    }
  }
  if(occupied.size!==GRID_COLS*GRID_ROWS)
    issues.push('Uncovered cells: '+(GRID_COLS*GRID_ROWS-occupied.size))
  return issues
}

export function makeEditorialGrid(presetId='quarters'){
  const pattern=EDITORIAL_GRID_PRESETS.find(p=>p.id===presetId)
  if(!pattern)throw new RangeError('Unknown editorial grid preset '+presetId)
  return pattern.rects.map(([x,y,cols,rows],i)=>({
    id:'cell-'+(i+1),x,y,cols,rows,module:EDITORIAL_MODULES[i%EDITORIAL_MODULES.length],
  }))
}

function randomSource(seed){
  let state=seed>>>0
  return ()=>{
    state=(state+0x6D2B79F5)>>>0
    let t=state
    t=Math.imul(t^(t>>>15),t|1)
    t^=t+Math.imul(t^(t>>>7),t|61)
    return ((t^(t>>>14))>>>0)/4294967296
  }
}
// Randomize every assigned module independently of how many tiles another
// layout happens to contain. Avoid repeats while there are unused modules.
function shuffledModules(next,count){
  const result=[]
  while(result.length<count){
    const palette=[...EDITORIAL_MODULES]
    for(let i=palette.length-1;i>0;i--){
      const j=Math.floor(next()*(i+1))
      ;[palette[i],palette[j]]=[palette[j],palette[i]]
    }
    result.push(...palette.slice(0,Math.min(count-result.length,palette.length)))
  }
  return result
}
export function randomEditorialModules(seed,count){
  if(!Number.isInteger(count)||count<1||count>16)
    throw new RangeError('Module count must be 1–16')
  return shuffledModules(randomSource(seed),count)
}

// This is a composition selector, not an unrestricted tiling generator.
// A mathematically valid partition can still be a poor editorial composition.
// Preserve every preset for manual testing, but randomization only presents
// candidates that meet the shared quality constraints.
const RANDOM_PRESETS=Object.freeze([
  'halves-vertical','halves-horizontal','quarters',
  'feature-left','feature-right','hero-sidebar','tall-strip',
  'top-banner','bottom-banner','three-columns',
  'folio-five','asymmetric-five','mosaic-six',
  'hero-four','hero-four-right','editorial-four',
])
const MODULE_FAMILY=Object.freeze({
  date:'ambient',weather:'ambient',surf:'ambient',ski:'ambient',
  reminders:'personal',groceries:'personal',countdown:'personal',
  soccer:'stat',stocks:'stat',news:'editorial',assistant:'editorial',
})
const area=rect=>rect[2]*rect[3]
const tileArea=tile=>tile.cols*tile.rows
const profileCache=new Map()
// Measure the actual disclosed content in each tile, rather than assuming
// a large module looks rich because its allotted rectangle is large.
function tileContentProfile(tile){
  const key=tile.module+':'+tile.cols+'x'+tile.rows
  if(profileCache.has(key))return profileCache.get(key)
  const height=tile.rows*GRID_CELL_HEIGHT
  const composition=composeEditorialModule(tile.module,
    tile.cols*GRID_CELL_WIDTH,height)
  const important=composition.blocks.filter(block=>
    block.id!=='heading'&&block.id!=='month')
  const extent=important.length?
    (Math.max(...important.map(b=>b.y+b.h))-
     Math.min(...important.map(b=>b.y))):0
  const inkHeight=important.reduce((sum,b)=>sum+b.h,0)
  const informativeLines=composition.blocks
    .filter(block=>block.type==='text'&&!['heading','section-heading'].includes(block.id))
    .reduce((sum,b)=>sum+(b.lines?.length??0),0)
  // A score indicator is supporting data, not a large illustration. Counting
  // the small Surf rating rectangles as artwork previously let a sparse
  // half-frame hero pass the quality gate.
  const pictorial=important.some(block=>
    (block.type==='calendar'||block.type==='figure')&&
    block.w*block.h>=Math.max(1500,composition.width*composition.height*.015))
  const focal=important.some(block=>
    (block.role==='hero'||block.id==='primary')&&
    block.type==='text'&&block.fontSize>=56&&block.w>=120)
  const primaryFont=Math.max(0,...composition.blocks
    .filter(block=>block.type==='text'&&
      (block.id==='primary'||block.id==='date'||block.id==='rating-verdict'))
    .map(block=>block.fontSize))
  const coverage=extent/Math.max(1,composition.plan.safeHeight)
  // The primary fact must remain meaningful in randomized compositions.
  // Supporting rows may shorten; the main headline should not end in "...".
  const essential=composition.blocks.find(block=>block.id==='primary')
  const clippedLead=Boolean(essential?.lines?.some(line=>line.endsWith('…')))
  const profile={coverage,inkHeight,informativeLines,pictorial,focal,
    primaryFont,clippedLead}
  profileCache.set(key,profile)
  return profile
}

// Two wide ribbons stacked on the same grid line can look like one
// continuous stream of unrelated facts, even when each ribbon is internally
// coherent. Add one discreet section break at that particular boundary.
// This returns the UPPER ribbon ID, so the line is embedded in its SVG and
// appears in exported PDFs as well as the full-size preview.
export function editorialGroupingCues(tiles){
  const anchors=new Set()
  for(const top of tiles){
    if(top.rows!==1||top.cols<3)continue
    if(tiles.some(bottom=>
      bottom.id!==top.id&&bottom.rows===1&&bottom.cols>=3&&
      bottom.x===top.x&&bottom.cols===top.cols&&
      bottom.y===top.y+1))
      anchors.add(top.id)
  }
  return [...anchors]
}

const adjacent=(a,b)=>{
  const horizontal=(a.x+a.cols===b.x||b.x+b.cols===a.x)&&
    Math.min(a.y+a.rows,b.y+b.rows)>Math.max(a.y,b.y)
  const vertical=(a.y+a.rows===b.y||b.y+b.rows===a.y)&&
    Math.min(a.x+a.cols,b.x+b.cols)>Math.max(a.x,b.x)
  return horizontal||vertical
}

// Hard constraints guard the most damaging layouts: unidentifiable 1×1
// snippets, a frame consisting entirely of ribbons, and tiny dense headlines.
export function auditEditorialGridQuality(tiles){
  const issues=validateEditorialGrid(tiles)
  if(tiles.length<2||tiles.length>8)
    issues.push('Randomized layouts need between 2 and 8 modules')
  if(tiles.some(tile=>tileArea(tile)<2))
    issues.push('Randomized cells must occupy at least two grid squares')
  if(tiles.every(tile=>tile.cols===4&&tile.rows===1))
    issues.push('Four disconnected horizontal ribbons')
  if(tiles.some(tile=>tile.module==='news'&&tile.cols===1))
    issues.push('Long headlines need at least two grid columns')
  if(tiles.some(tile=>tile.module==='surf'&&tile.cols===1&&tile.rows<=2))
    issues.push('Surf verdict needs a wider cell')
  for(const tile of tiles){
    const p=tileContentProfile(tile)
    // Large, sparse columns are the principal source of the floating
    // information seen in user review PDFs. Require content capacity or art.
    if(tile.rows>=3&&tile.cols===1&&p.coverage<.39)
      issues.push('Underfilled tall column: '+tile.id)
    if(tileArea(tile)>=6&&!p.pictorial&&p.informativeLines<=3)
      issues.push('Large panel with insufficient disclosure: '+tile.id)
    if(tileArea(tile)>=6&&!p.pictorial&&p.coverage<.28)
      issues.push('Large panel has insufficient visual coverage: '+tile.id)
    // A half-frame column is an expensive design decision: it must present a
    // strong typographic focal point, genuine illustration, or genuinely
    // expanded information. Mere presence of the Surf rating bar is not enough.
    if(tileArea(tile)>=8&&tile.cols<=2&&!p.pictorial&&!p.focal&&
      !(p.informativeLines>=7&&p.coverage>=.48))
      issues.push('Oversized panel without sufficient visual focal point: '+tile.id)
    if(tile.rows===1&&tile.cols>=3&&p.informativeLines<2)
      issues.push('Unidentified or underfilled ribbon: '+tile.id)
    if(p.clippedLead)
      issues.push('Primary headline loses its meaning: '+tile.id)
    // Narrow modules that cannot establish a readable primary fact should
    // not be selected merely because they mathematically fit the grid.
    if(tile.cols===1&&tile.rows<=2&&p.primaryFont<19)
      issues.push('Narrow module lacks legible visual anchor: '+tile.id)
  }
  return issues
}

// Layout geometry, information density and module harmony are all scored.
// This is deliberately generic: no per-preset coordinates or screenshot fixes.
export function scoreEditorialGrid(tiles){
  if(validateEditorialGrid(tiles).length)return -10000
  const sizes=tiles.map(tileArea)
  const largest=Math.max(...sizes)
  let score=100-Math.abs(tiles.length-5)*3
  if(largest>=6)score+=9
  else if(sizes.every(size=>size===4))score+=8 // balanced four-quarter grid
  else if(largest<4)score-=22
  if(tiles.length>7)score-=18*(tiles.length-7)
  const ribbonCount=tiles.filter(t=>t.rows===1&&t.cols===4).length
  score-=ribbonCount*8
  if(ribbonCount>=2)score-=32
  // Prefer naturally distinct sections when quality is otherwise equal.
  score-=editorialGroupingCues(tiles).length*10
  const seen=new Set()
  for(const tile of tiles){
    const size=tileArea(tile)
    if(size<2)score-=85
    if(tile.cols===1&&tile.rows>=3)score-=10
    else if(tile.cols===1)score-=5
    if(tile.cols===2&&tile.rows===1)score-=5
    if(tile.cols>=2&&tile.rows>=2)score+=5
    // A poor information/area match must never be rescued solely by
    // visually balanced geometry. The same test works across all modules.
    const content=tileContentProfile(tile)
    if(size>=4&&!content.pictorial)
      score-=Math.max(0,.49-content.coverage)*32
    if(size>=8&&tile.cols<=2&&!content.pictorial&&!content.focal)
      score-=Math.max(0,.6-content.coverage)*60
    if(size>=6&&!content.pictorial&&content.informativeLines<5)
      score-=(5-content.informativeLines)*11
    if(tile.cols===1&&tile.rows>=3)
      score-=Math.max(0,.5-content.coverage)*55
    if(tile.module==='news'&&tile.cols<2)score-=60
    if(tile.module==='surf'&&tile.cols<2)score-=35
    if(tile.module==='reminders'&&tile.cols<2)score-=16
    if(tile.module==='groceries'&&tile.cols<2)score-=11
    if(tile.module==='assistant'&&size>=8)score-=22
    if(tile.module==='countdown'&&size>=8)score-=16
    if(tile.module==='news'&&size>=4)score+=7
    if(tile.module==='surf'&&tile.cols===2&&tile.rows===2)score+=5
    if(seen.has(tile.module)&&tiles.length<=EDITORIAL_MODULES.length)score-=25
    seen.add(tile.module)
  }
  for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++){
    if(adjacent(tiles[i],tiles[j])&&
      MODULE_FAMILY[tiles[i].module]===MODULE_FAMILY[tiles[j].module])
      score-=3
  }
  return score
}

// Only split when both children retain adequate breathing room. Favor the
// largest panels and balanced cuts, instead of repeatedly slicing tiny scraps.
function randomRectangles(next,target=3+Math.floor(next()*5)){
  const rects=[[0,0,4,4]]
  for(let attempt=0;attempt<24&&rects.length<target;attempt++){
    const splits=[]
    rects.forEach((rect,i)=>{
      const [x,y,w,h]=rect
      for(let cut=1;cut<w;cut++){
        const a=[x,y,cut,h],b=[x+cut,y,w-cut,h]
        if(area(a)>=2&&area(b)>=2)splits.push({i,a,b,weight:Math.min(area(a),area(b))})
      }
      for(let cut=1;cut<h;cut++){
        const a=[x,y,w,cut],b=[x,y+cut,w,h-cut]
        if(area(a)>=2&&area(b)>=2)splits.push({i,a,b,weight:Math.min(area(a),area(b))})
      }
    })
    if(!splits.length)break
    // Two passes of weighted choice: larger panels and near-equal subpanels.
    const weights=splits.map(split=>split.weight*split.weight)
    let draw=next()*weights.reduce((sum,n)=>sum+n,0)
    let picked=splits[splits.length-1]
    for(let i=0;i<splits.length;i++){
      draw-=weights[i]
      if(draw<0){picked=splits[i];break}
    }
    rects.splice(picked.i,1,picked.a,picked.b)
  }
  return rects.sort((a,b)=>a[1]-b[1]||a[0]-b[0])
}

function withModules(rects,next){
  const modules=shuffledModules(next,rects.length)
  return rects.map(([x,y,cols,rows],i)=>({
    id:'cell-'+(i+1),x,y,cols,rows,module:modules[i],
  }))
}

// Aesthetic variety is a constraint, not a tiny random perturbation of a
// scoring function. First select a composition family, then score candidates
// *within that family*. Otherwise four quarters win almost every time.
// The fingerprint deliberately ignores module assignment and cell ID:
// a different headline does not turn the same four rectangles into a new
// page design. Sort to normalize equivalent draw/traversal order.
export function editorialGridSignature(tiles){
  return [...tiles].map(({x,y,cols,rows})=>[x,y,cols,rows].join(','))
    .sort().join('|')
}
export function editorialGridFamily(tiles){
  const n=tiles.length
  const sizes=tiles.map(tileArea)
  const maximum=Math.max(...sizes)
  if(n>=5)return 'mosaic'
  if(n===4&&sizes.every(size=>size===4))return 'balanced'
  if(n===4&&maximum<=5)return 'balanced'
  if(n<=4&&maximum>=8)return 'hero'
  return 'editorial'
}
function fitsFamily(tiles,family){
  if(family==='mosaic')return tiles.length>=5&&tiles.length<=7
  if(family==='balanced')return tiles.length===4&&Math.max(...tiles.map(tileArea))<=5
  if(family==='hero')return tiles.length>=2&&tiles.length<=4&&
    Math.max(...tiles.map(tileArea))>=8
  return tiles.length>=3&&tiles.length<=4&&editorialGridFamily(tiles)==='editorial'
}
const FAMILIES=['hero','balanced','mosaic','editorial']

// Repeating the same ornament on every tile made previously good grid layouts
// look like a spreadsheet of identical chapter headings. A limited number of
// emphasis points gives the frame a calmer reading rhythm.
export function editorialOrnamentTiles(tiles){
  const priority={news:3,reminders:3,weather:2,date:2,groceries:1,stocks:1}
  const max=tiles.length>=4?2:1
  const candidates=tiles.filter(tile=>!(tile.module==='surf'&&tile.cols===2&&tile.rows===2))
    .sort((a,b)=>{
      const preference=tile=>Math.min(10,tileArea(tile))*3+(priority[tile.module]??0)
      return preference(b)-preference(a)||a.y-b.y||a.x-b.x
    })
  return candidates.slice(0,max).map(tile=>tile.id)
}

// Measure novelty separately from quality. A pretty four-quarter grid is
// still pretty, but should appear less often in a ten-frame review.
function diversityPenalty(tiles,history){
  if(!history.length)return 0
  const signature=editorialGridSignature(tiles)
  const matches=history.filter(prev=>editorialGridSignature(prev)===signature).length
  const family=editorialGridFamily(tiles)
  const sameFamily=history.filter(prev=>editorialGridFamily(prev)===family).length
  const mostRecent=history.slice(-3).some(prev=>
    editorialGridSignature(prev)===signature)
  return matches*28+sameFamily*7+(mostRecent?16:0)
}
/** @param {number} seed @param {string|null} [previousPresetId]
 *  @param {Array|null} [previousTiles] @param {Array<Array>} [recentLayouts] */
export function randomEditorialGrid(seed,previousPresetId=null,previousTiles=null,recentLayouts=[]){
  const next=randomSource(seed)
  const previousFamily=Array.isArray(previousTiles)?editorialGridFamily(previousTiles):null
  const history=Array.isArray(recentLayouts)?recentLayouts.filter(Array.isArray):[]
  const familyChoices=FAMILIES.filter(name=>name!==previousFamily)
  // In a batch, choose among the least-represented families, not a purely
  // independent random pick. Every result is STILL quality-gated afterward.
  const usage=familyChoices.map(name=>history.filter(layout=>
    editorialGridFamily(layout)===name).length)
  const lowest=Math.min(...usage)
  const underused=history.length?familyChoices.filter((_,i)=>usage[i]===lowest):familyChoices
  const family=underused[Math.floor(next()*underused.length)]
  const procedural=next()<0.55
  const options=EDITORIAL_GRID_PRESETS.filter(p=>
    RANDOM_PRESETS.includes(p.id)&&p.id!==previousPresetId&&
    fitsFamily(p.rects.map(([x,y,cols,rows])=>({x,y,cols,rows})),family))
  let winner=null,best=-Infinity
  const attempts=procedural?48:36
  for(let i=0;i<attempts;i++){
    const requested=family==='mosaic'?5+Math.floor(next()*3):
      family==='balanced'?4:family==='hero'?3+Math.floor(next()*2):
      (next()<.72?4:3)
    const preset=procedural||!options.length?null:options[Math.floor(next()*options.length)]
    const rects=preset?([...preset.rects]):randomRectangles(next,requested)
    const tiles=withModules(rects,next)
    if(!fitsFamily(tiles,family))continue
    if(previousTiles&&JSON.stringify(tiles.map(({x,y,cols,rows})=>[x,y,cols,rows]))===
      JSON.stringify(previousTiles.map(({x,y,cols,rows})=>[x,y,cols,rows])))continue
    if(auditEditorialGridQuality(tiles).length)continue
    const baseQuality=scoreEditorialGrid(tiles)
    const score=baseQuality-diversityPenalty(tiles,history)+next()*8
    if(score>best){
      best=score
      winner={seed:seed>>>0,presetId:preset?.id??'random',tiles,family}
    }
  }
  if(!winner){
    const id=family==='mosaic'?'folio-five':
      family==='hero'?'hero-four':family==='editorial'?'editorial-four':'quarters'
    const fallback=EDITORIAL_GRID_PRESETS.find(p=>p.id===id)
    // The backup must be scored and quality-gated too. A random assignment
    // here previously bypassed every hard constraint and could recreate the
    // exact poor layout we had just rejected.
    let fallbackWinner=null,fallbackScore=-Infinity
    for(let attempt=0;attempt<144;attempt++){
      const candidate=withModules(fallback.rects,next)
      if(auditEditorialGridQuality(candidate).length)continue
      const score=scoreEditorialGrid(candidate)-diversityPenalty(candidate,history)
      if(score>fallbackScore){fallbackScore=score;fallbackWinner=candidate}
    }
    if(!fallbackWinner){
      // Four balanced panels provide a universally safe geometric fallback.
      const base=EDITORIAL_GRID_PRESETS.find(p=>p.id==='quarters')
      for(let attempt=0;attempt<256;attempt++){
        const candidate=withModules(base.rects,next)
        if(auditEditorialGridQuality(candidate).length)continue
        const score=scoreEditorialGrid(candidate)-diversityPenalty(candidate,history)
        if(score>fallbackScore){fallbackScore=score;fallbackWinner=candidate}
      }
      if(!fallbackWinner)throw new Error('Cannot create a valid editorial layout')
      winner={seed:seed>>>0,presetId:base.id,tiles:fallbackWinner,
        family:editorialGridFamily(fallbackWinner)}
    }else{
      winner={seed:seed>>>0,presetId:fallback.id,tiles:fallbackWinner,
        family:editorialGridFamily(fallbackWinner)}
    }
  }
  // Reject a composition that technically meets minimum disclosure but
  // still scores poorly as a whole. Recompose with a different visual family
  // rather than lowering the acceptance standard for sparse panels.
  if(scoreEditorialGrid(winner.tiles)<56){
    const alternateIds=[
      'quarters','editorial-four','hero-four','hero-four-right',
      'folio-five','asymmetric-five','mosaic-six',
    ]
    let substitute=null,alternateScore=scoreEditorialGrid(winner.tiles)
    for(const id of alternateIds){
      const pattern=EDITORIAL_GRID_PRESETS.find(p=>p.id===id)
      for(let i=0;i<24;i++){
        const tiles=withModules(pattern.rects,next)
        const family=editorialGridFamily(tiles)
        if(family===previousFamily||auditEditorialGridQuality(tiles).length)continue
        const score=scoreEditorialGrid(tiles)-diversityPenalty(tiles,history)
        if(score>alternateScore){alternateScore=score
          substitute={seed:seed>>>0,presetId:id,tiles,family}}
      }
    }
    if(substitute)winner=substitute
  }
  return winner
}

// Keep a selected arrangement fixed while searching for a harmonious,
// non-repeating module assignment. Uses the same scoring rule as Randomize.
export function shuffleEditorialGridModules(seed,tiles){
  const next=randomSource(seed)
  let winner=null,best=-Infinity
  for(let i=0;i<32;i++){
    const modules=shuffledModules(next,tiles.length)
    const candidate=tiles.map((tile,index)=>({...tile,module:modules[index]}))
    const issues=auditEditorialGridQuality(candidate)
    if(issues.length)continue
    const score=scoreEditorialGrid(candidate)+next()*9
    if(score>best){best=score;winner=candidate}
  }
  // An unusual manually authored 1×1/16-cell grid cannot meet the randomizer's
  // constraints; preserve its geometry and offer a valid module shuffle anyway.
  if(winner)return winner
  const fallback=shuffledModules(randomSource(seed),tiles.length)
  return tiles.map((tile,index)=>({...tile,module:fallback[index]}))
}
