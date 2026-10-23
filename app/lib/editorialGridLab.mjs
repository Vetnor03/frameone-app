import {EDITORIAL_MODULES} from './editorialComposition.mjs'

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
  preset('three-columns','Three columns','Narrow, wide, narrow',[[0,0,1,4],[1,0,2,4],[3,0,1,4]]),
  preset('four-columns','Four columns','Four 1×4 vertical stacks',[[0,0,1,4],[1,0,1,4],[2,0,1,4],[3,0,1,4]]),
  preset('four-rows','Four rows','Four 4×1 horizontal ribbons',[[0,0,4,1],[0,1,4,1],[0,2,4,1],[0,3,4,1]]),
  preset('eight-columns','Eight tall rows','Eight 2×1 panels',Array.from({length:4},(_,row)=>[
    [0,row,2,1],[2,row,2,1],
  ]).flat()),
  preset('eight-rows','Eight thin columns','Eight 1×2 panels',Array.from({length:2},(_,row)=>[
    [0,row*2,1,2],[1,row*2,1,2],[2,row*2,1,2],[3,row*2,1,2],
  ]).flat()),
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
])
const MODULE_FAMILY=Object.freeze({
  date:'ambient',weather:'ambient',surf:'ambient',ski:'ambient',
  reminders:'personal',groceries:'personal',countdown:'personal',
  soccer:'stat',stocks:'stat',news:'editorial',assistant:'editorial',
})
const area=rect=>rect[2]*rect[3]
const tileArea=tile=>tile.cols*tile.rows
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
  score-=ribbonCount*17
  if(ribbonCount>=2)score-=32
  const seen=new Set()
  for(const tile of tiles){
    const size=tileArea(tile)
    if(size<2)score-=85
    if(tile.cols===1&&tile.rows>=3)score-=10
    else if(tile.cols===1)score-=5
    if(tile.cols===2&&tile.rows===1)score-=5
    if(tile.cols>=2&&tile.rows>=2)score+=5
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
function randomRectangles(next){
  const rects=[[0,0,4,4]]
  const target=3+Math.floor(next()*5)
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

/** @param {number} seed @param {string|null} [previousPresetId] */
export function randomEditorialGrid(seed,previousPresetId=null){
  const next=randomSource(seed)
  // Retain a genuinely mixed distribution of generated and named layouts.
  // Within the selected family, choose the highest-quality candidate.
  const procedural=next()<0.55
  const options=EDITORIAL_GRID_PRESETS.filter(p=>
    RANDOM_PRESETS.includes(p.id)&&p.id!==previousPresetId)
  let winner=null,best=-Infinity
  const attempts=procedural?24:32
  for(let i=0;i<attempts;i++){
    const preset=procedural?null:options[Math.floor(next()*options.length)]
    const rects=procedural?randomRectangles(next):preset.rects
    const tiles=withModules(rects,next)
    const issues=auditEditorialGridQuality(tiles)
    if(issues.length)continue
    // A little deterministic variation avoids repeatedly selecting a single
    // beautiful but predictable arrangement.
    const score=scoreEditorialGrid(tiles)+next()*9
    if(score>best){
      best=score
      winner={seed:seed>>>0,presetId:preset?.id??'random',tiles}
    }
  }
  // Every seed has a valid graceful fallback; never present a broken mosaic.
  if(!winner){
    const rects=EDITORIAL_GRID_PRESETS.find(p=>p.id==='quarters').rects
    winner={seed:seed>>>0,presetId:'quarters',tiles:withModules(rects,next)}
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
