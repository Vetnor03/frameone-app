// Exhaustive 4x4 tiling audit + seeded randomization + difficult content.
// Standalone Node 22 script. No browser, credentials or network access needed.
// Does NOT claim to certify visual beauty; it catches reproducible geometry,
// rendering and generator-quality failures, preserving their seeds.
import assert from 'node:assert/strict'
import {mkdirSync,writeFileSync} from 'node:fs'
import {EDITORIAL_MODULES,EDITORIAL_SAMPLES,
  composeEditorialModule,auditEditorialComposition} from '../app/lib/editorialComposition.mjs'
import {EDITORIAL_GRID_PRESETS,validateEditorialGrid,randomEditorialGrid,
  auditEditorialGridQuality,scoreEditorialGrid,editorialGridFamily,
  editorialGridSignature} from '../app/lib/editorialGridLab.mjs'

const countArg=Number.parseInt(process.env.EDITORIAL_STRESS_SEEDS||'3000',10)
if(!Number.isInteger(countArg)||countArg<100||countArg>20000)
  throw new Error('EDITORIAL_STRESS_SEEDS must be between 100 and 20000')
const totalCells=16
const full=(1<<totalCells)-1
const summary={
  version:1,
  randomSeeds:countArg,
  uniqueGridPartitions:0,
  gridPanelCounts:{},
  sampledGridAssignments:0,
  contentFixtures:0,
  contentOverflowFailures:0,
  contentTruncationObservations:0,
  randomizationFailures:0,
  families:{},
  randomizedSignatures:0,
  minimumScore:null,
  coverageByShape:{},
  manualPresetsChecked:0,
  failures:[],
  examples:[],
}
const signatures=new Set()
let minScore=Infinity
const fail=(kind,detail)=>{
  if(summary.failures.length<60)summary.failures.push({kind,...detail})
}
const rectCache=new Map()
function firstFree(occupied){
  for(let i=0;i<16;i++)if(!(occupied&(1<<i)))return i
  return -1
}
function availableRectangles(mask){
  const first=firstFree(mask)
  if(first<0)return []
  if(rectCache.has(mask))return rectCache.get(mask)
  const x=first%4,y=Math.floor(first/4),items=[]
  for(let rows=1;rows<=4-y;rows++){
    for(let cols=1;cols<=4-x;cols++){
      let bits=0
      for(let yy=y;yy<y+rows;yy++)
        for(let xx=x;xx<x+cols;xx++)bits|=1<<(yy*4+xx)
      if((mask&bits)===0)items.push({bits,x,y,cols,rows})
    }
  }
  rectCache.set(mask,items)
  return items
}
function tiled(mask,chosen){
  if(mask===full){
    summary.uniqueGridPartitions++
    summary.gridPanelCounts[chosen.length]=(summary.gridPanelCounts[chosen.length]||0)+1
    // Every partition is checked. Module assignment is irrelevant to
    // checking structural geometry; one assignment per partition suffices.
    const tiles=chosen.map(({x,y,cols,rows},i)=>({
      id:'cell-'+(i+1),x,y,cols,rows,
      module:EDITORIAL_MODULES[(summary.uniqueGridPartitions+i)%EDITORIAL_MODULES.length],
    }))
    const issues=validateEditorialGrid(tiles)
    if(issues.length)fail('exhaustive-grid',{
      index:summary.uniqueGridPartitions,issues,geometry:chosen.map(r=>[r.x,r.y,r.cols,r.rows]),
    })
    // Additional assignments + per-module geometry on a uniform sample of
    // all partitions, including awkward vertical strips and 1x1 tiles.
    if(summary.uniqueGridPartitions%31===0){
      const reassigned=tiles.map((tile,i)=>({...tile,
        module:EDITORIAL_MODULES[(i*3+summary.uniqueGridPartitions)%11]}))
      if(validateEditorialGrid(reassigned).length)
        fail('sampled-grid',{index:summary.uniqueGridPartitions})
      for(const tile of reassigned){
        const c=composeEditorialModule(tile.module,tile.cols*200,tile.rows*120)
        const issues=auditEditorialComposition(c)
        if(issues.length)fail('sampled-composition',{
          index:summary.uniqueGridPartitions,module:tile.module,
          size:tile.cols+'x'+tile.rows,issues,
        })
      }
      summary.sampledGridAssignments++
    }
    return
  }
  for(const rect of availableRectangles(mask)){
    chosen.push(rect)
    tiled(mask|rect.bits,chosen)
    chosen.pop()
  }
}
tiled(0,[])
assert.equal(summary.uniqueGridPartitions,70878,'4x4 partition enumeration changed')
for(const preset of EDITORIAL_GRID_PRESETS){
  const tiles=preset.rects.map(([x,y,cols,rows],i)=>({
    id:'preset-'+i,x,y,cols,rows,module:EDITORIAL_MODULES[i%11],
  }))
  assert.deepEqual(validateEditorialGrid(tiles),[],preset.id)
  summary.manualPresetsChecked++
}

// A deterministic fixture generator that varies actual CONTENT while keeping
// the same drawing and packing code. Distinguish deliberate truncation (which
// is recorded for design review) from outright overflow or collisions (fail).
const lengths=[0,1,4,12,28,50,85,140]
const alphabet=[
  'Weather improves throughout the long weekend',
  'Kjøp melk, brød og epler før fredag',
  'Nordvestlig vind og bølger ved Hellestø',
  'Aker BP-lederforeningen innkaller til ekstraordinært møte',
  'Family, school, birthday and football ⚽',
  'TÊTE D’AFFICHE — Café déjà vu',
  'UNBROKENLONGHEADLINEWITHOUTSPACESORPUNCTUATION',
  '12° • 15 cm • 08:30 • 24.10.2026',
]
const normalize=s=>String(s).trim()
const stringFor=(variant,salt)=>{
  const target=lengths[(variant+salt)%lengths.length]
  if(target===0)return ''
  const base=alphabet[(variant*7+salt)%alphabet.length]
  const text=(base+' ').repeat(Math.ceil((target+1)/(base.length+1)))
  return text.slice(0,target).trim()
}
const contentVariants=64
for(const module of EDITORIAL_MODULES)
  for(let cols=1;cols<=4;cols++)
    for(let rows=1;rows<=4;rows++)
      for(let variant=0;variant<contentVariants;variant++){
        // The approved 2x2 Surf and Date are intentional reference layouts;
        // both are tested in their canonical configuration instead.
        const reference=module==='date'||(module==='surf'&&cols===2&&rows===2)
        const original=EDITORIAL_SAMPLES[module]
        const sample=reference?undefined:{
          heading:original.heading,
          primary:variant%11===0?'':(variant%13===0?original.primary:
            stringFor(variant,cols+rows)),
          detail:variant%7===0?'':(variant%5===0?original.detail:
            stringFor(variant+9,rows)),
          extras:variant%6===0?[]:
            Array.from({length:(variant%9)},(_,i)=>stringFor(variant+i+3,cols+i)),
        }
        const view=composeEditorialModule(module,cols*200,rows*120,
          sample?{sample}:{})
        const issues=auditEditorialComposition(view)
        summary.contentFixtures++
        if(issues.length){
          summary.contentOverflowFailures++
          fail('content-geometry',{module,size:cols+'x'+rows,
            variant,issues,
            primary:sample?.primary?.slice(0,60),
            detail:sample?.detail?.slice(0,40)})
        }
        if(sample?.primary){
          const shown=view.blocks.find(b=>b.id==='primary')
          if(shown&&shown.lines.some(line=>line.includes('…')))
            summary.contentTruncationObservations++
        }
      }

// Seeded selection tests validate its own strict quality gate. They are
// distinct from raw tilings, which include intentionally ugly manual shapes.
let previous=null,previousId=null
const recent=[]
for(let seed=0;seed<countArg;seed++){
  const value=randomEditorialGrid((seed*2654435761+0x9E3779B9)>>>0,
    previousId,previous,recent)
  const issues=auditEditorialGridQuality(value.tiles)
  const score=scoreEditorialGrid(value.tiles)
  summary.minimumScore=Math.min(summary.minimumScore??score,score)
  if(issues.length||!Number.isFinite(score)||score<50){
    summary.randomizationFailures++
    fail('quality-gate',{seed:seed>>>0,issues,score,
      family:value.family,preset:value.presetId,
      modules:value.tiles.map(t=>t.module),
      geometry:value.tiles.map(t=>[t.x,t.y,t.cols,t.rows])})
  }
  signatures.add(editorialGridSignature(value.tiles))
  summary.families[editorialGridFamily(value.tiles)]=
    (summary.families[editorialGridFamily(value.tiles)]||0)+1
  const size=value.tiles.length
  summary.coverageByShape[size]=(summary.coverageByShape[size]||0)+1
  if(summary.examples.length<25&&(seed%113===0||score<60))
    summary.examples.push({seed,value,score})
  if(recent.length>=10)recent.shift()
  recent.push(value.tiles)
  previous=value.tiles;previousId=value.presetId
}
summary.randomizedSignatures=signatures.size
summary.minimumScore=Number.isFinite(minScore)?Math.min(summary.minimumScore??minScore,minScore):summary.minimumScore
mkdirSync('artifacts/editorial',{recursive:true})
writeFileSync('artifacts/editorial/stress-summary.json',JSON.stringify(summary,null,2)+'\n')
console.log(JSON.stringify({
  partitions:summary.uniqueGridPartitions,
  sampledGridAssignments:summary.sampledGridAssignments,
  contentFixtures:summary.contentFixtures,
  contentTruncationObservations:summary.contentTruncationObservations,
  generatedLayouts:summary.randomSeeds,
  distinctGeometries:summary.randomizedSignatures,
  families:summary.families,
  minimumScore:summary.minimumScore,
  failureCount:summary.failures.length,
},null,2))
if(summary.failures.length){
  console.error('Stress failures (first 10):',JSON.stringify(summary.failures.slice(0,10),null,2))
  process.exitCode=1
}
