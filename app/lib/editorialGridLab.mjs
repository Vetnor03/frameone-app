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

// Recursive rectangle splits yield genuinely new 4×4 mosaics, not just
// repetitions of the curated preset list. Every split preserves coverage.
function randomRectangles(next){
  const rects=[[0,0,4,4]]
  const target=3+Math.floor(next()*8)
  while(rects.length<target){
    const eligible=rects.map((rect,i)=>({rect,i}))
      .filter(({rect})=>rect[2]>1||rect[3]>1)
    if(!eligible.length)break
    const chosen=eligible[Math.floor(next()*eligible.length)]
    const [x,y,w,h]=chosen.rect
    const splitVertical=w>1&&(h===1||next()<0.5)
    if(splitVertical){
      const cut=1+Math.floor(next()*(w-1))
      rects.splice(chosen.i,1,[x,y,cut,h],[x+cut,y,w-cut,h])
    }else{
      const cut=1+Math.floor(next()*(h-1))
      rects.splice(chosen.i,1,[x,y,w,cut],[x,y+cut,w,h-cut])
    }
  }
  return rects.sort((a,b)=>a[1]-b[1]||a[0]-b[0])
}

export function randomEditorialGrid(seed,previousPresetId=null){
  const next=randomSource(seed)
  const options=EDITORIAL_GRID_PRESETS.filter(p=>p.id!==previousPresetId)
  // Use generated custom mosaics about half the time. 'random' remains a
  // valid state for the UI but never modifies a user's actual saved layout.
  const procedural=next()<0.55
  const preset=procedural?null:options[Math.floor(next()*options.length)]
  const rects=procedural?randomRectangles(next):preset.rects
  const modules=shuffledModules(next,rects.length)
  const tiles=rects.map(([x,y,cols,rows],i)=>({
    id:'cell-'+(i+1),x,y,cols,rows,module:modules[i],
  }))
  return {seed:seed>>>0,presetId:preset?.id??'random',tiles}
}
