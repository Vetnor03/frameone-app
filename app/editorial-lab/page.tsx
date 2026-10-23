'use client'

import {useEffect,useMemo,useRef,useState} from 'react'
import Link from 'next/link'
import {exportEditorialBatchPdf} from '../lib/editorialPdfExport.mjs'
import {editorialPlan} from '../lib/editorialFrameLayout.mjs'
import {EDITORIAL_MODULES,composeEditorialModule,auditEditorialComposition} from '../lib/editorialComposition.mjs'
import {WEATHER_VIGNETTE_SCENES,weatherCoastalCurves} from '../lib/editorialWeatherVignette.mjs'
import {EDITORIAL_GRID_PRESETS,GRID_CELL_WIDTH,GRID_CELL_HEIGHT,
  makeEditorialGrid,randomEditorialGrid,shuffleEditorialGridModules,
  scoreEditorialGrid,editorialGridFamily,editorialOrnamentTiles,
  editorialGroupingCues,editorialDensityRules,auditEditorialGridQuality,validateEditorialGrid} from '../lib/editorialGridLab.mjs'

type Module = typeof EDITORIAL_MODULES[number]
type Span = 1|2|3|4
type Cell = string
type FrameTheme = 'light'|'dark'
type WeatherScene = keyof typeof WEATHER_VIGNETTE_SCENES
const spans:Span[]=[1,2,3,4]
const cells=spans.flatMap(cols=>spans.map(rows=>({
  key:cols+'x'+rows,width:cols*200,height:rows*120,
})))
const paperFor=(theme:FrameTheme)=>theme==='light'?'#FFFFFF':'#000000'
const inkFor=(theme:FrameTheme)=>theme==='light'?'#000000':'#FFFFFF'

function BookDivider({x,y,width,ink}:{x:number;y:number;width:number;ink:string}){
  if(width<240) return <path d={'M '+x+' '+y+' h '+width} stroke={ink} strokeWidth=".75" opacity=".5"/>
  const cx=x+width/2
  return <g stroke={ink} strokeWidth=".85" fill="none" opacity=".65">
    <path d={'M '+x+' '+y+' H '+(cx-29)+' M '+(cx+29)+' '+y+' H '+(x+width)}/>
    <path d={'M '+(cx-20)+' '+y+' l 10 -4 l -7 4 l 7 4 Z M '+(cx+20)+' '+y+' l -10 -4 l 7 4 l -7 4 Z'}/>
    <circle cx={cx} cy={y} r="2.5"/>
  </g>
}
function Botanical({x,y,w,h,ink}:{x:number;y:number;w:number;h:number;ink:string}){
  return <svg x={x} y={y} width={w} height={h} viewBox="0 0 108 70" fill="none"
    stroke={ink} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"
    aria-label="Decorative botanical engraving">
    <path d="M54 67 L52 38 L56 8 M54 53 L34 41 L25 32 L42 46 L54 53
      M54 42 L73 30 L86 18 L66 36 L54 42 M53 31 L36 23 L27 12 L45 28 L53 31
      M52 39 L37 32 L29 37 L41 37 L52 39 M54 51 L72 44 L82 49 L68 49 L54 51"/>
    <path d="M34 41 Q21 26 25 32 Q40 27 42 46 M73 30 Q79 12 86 18 Q92 29 66 36
      M36 23 Q24 11 27 12 Q36 7 45 28 M72 44 Q90 42 82 49 Q81 57 68 49"/>
    <path d="M47 67 H61"/>
  </svg>
}
function CoastalWeather({x,y,w,h,ink,wmo,windMs}:{
  x:number;y:number;w:number;h:number;ink:string;wmo:number;windMs:number
}){
  // Same hand-composed Bézier handles as firmware; C++ renders short 1-bit segments.
  return <svg x={x} y={y} width={w} height={h} viewBox="0 0 140 96"
    preserveAspectRatio="none" fill="none" stroke={ink} strokeWidth="1.15"
    strokeLinecap="round" strokeLinejoin="round"
    aria-label="Coastal weather field-guide engraving">
    {weatherCoastalCurves(wmo,windMs).map((p,index)=>
      <path key={index} d={`M ${p[0]} ${p[1]} C ${p[2]} ${p[3]} ${p[4]} ${p[5]} ${p[6]} ${p[7]}`}/>)}
  </svg>
}
function RatingBlocks({x,y,w,h=16,ink,theme,reference=false}:{
  x:number;y:number;w:number;h?:number;ink:string;theme:FrameTheme;reference?:boolean
}){
  // The approved physical Medium template uses 20×14 blocks, a 6px gap
  // and radius 3. Other shapes remain free to resize these marks.
  const gap=reference?6:4
  const blockW=reference?20:Math.min(22,(w-5*gap)/6)
  const blockH=reference?14:Math.min(14,Math.max(6,h-2))
  const actual=6*blockW+5*gap
  const left=x+(w-actual)/2
  const muted=theme==='light'?'#777777':'#C0C0C0'
  return <g role="img" aria-label="Three of six filled Surf rating rectangles">
    {Array.from({length:6},(_,index)=><rect key={index}
      x={left+index*(blockW+gap)} y={y+((reference?16:h)-blockH)/2} width={blockW} height={blockH}
      rx={reference?3:2} stroke={index<3?ink:muted} strokeWidth="1.2"
      fill={index<3?ink:'none'}/>)}
  </g>
}
function Calendar({x,y,w,h,ink}:{x:number;y:number;w:number;h:number;ink:string}){
  const days=['M','T','W','T','F','S','S']
  const gridW=w-20
  const pitchX=gridW/7
  const pitchY=(h-62)/5
  // October 1, 2026 falls on Thursday: Monday-first calendar offset 3.
  return <g role="img" aria-label="October 2026 calendar">
    <text x={x+w/2} y={y+17} fontSize="17" fill={ink} textAnchor="middle"
      fontFamily="Georgia, serif">October 2026</text>
    <BookDivider x={x+18} y={y+27} width={w-36} ink={ink}/>
    {days.map((day,i)=><text key={i} x={x+10+pitchX*(i+.5)} y={y+45}
      textAnchor="middle" fill={ink} fontSize="11" opacity=".8">{day}</text>)}
    {Array.from({length:31},(_,i)=>{
      const day=i+1,position=i+3,col=position%7,row=Math.floor(position/7)
      const cx=x+10+pitchX*(col+.5),cy=y+65+row*pitchY
      return <g key={day}>
        {day===21&&<circle cx={cx} cy={cy-4.5} r={Math.min(15,pitchX*.35)}
          fill="none" stroke={ink}/>}
        <text x={cx} y={cy} fontSize="13" textAnchor="middle" fill={ink}>{day}</text>
      </g>
    })}
  </g>
}

function EditorialCanvas({module,width,height,theme,weatherScene='partly',
  ornament=true,sectionBreak=false,density='open',separateRight=false,separateBottom=false,centralJunction=false}:{
  module:Module;width:number;height:number;theme:FrameTheme;
  weatherScene?:WeatherScene;ornament?:boolean;sectionBreak?:boolean;
  density?:'open'|'chapter-grid'|'fine-grid';separateRight?:boolean;separateBottom?:boolean;
  centralJunction?:boolean
}) {
  const layout=composeEditorialModule(module,width,height,{weatherScene})
  const weather=WEATHER_VIGNETTE_SCENES[weatherScene]??WEATHER_VIGNETTE_SCENES.partly
  const paper=paperFor(theme),ink=inkFor(theme)
  return <svg role="img"
    aria-label={module+' '+width+'×'+height+' editorial concept, '+theme+' theme'}
    viewBox={'0 0 '+width+' '+height} preserveAspectRatio="xMidYMid meet"
    data-editorial-probe="true" data-module={module} data-width={width} data-height={height}
    className="block h-auto w-full" style={{backgroundColor:paper}}>
    <rect width={width} height={height} fill={paper}/>
    {density!=='open'&&<g data-editorial-density={density} stroke={ink}
      fill="none" strokeWidth={density==='fine-grid'?0.75:0.65}
      opacity={density==='fine-grid'?.28:.27}>
      {separateRight&&<line x1={width-3} y1={6} x2={width-3} y2={height-6}/>}
      {separateBottom&&<line x1={6} y1={height-3} x2={width-6} y2={height-3}/>}
    </g>}
    {density==='fine-grid'&&centralJunction&&
      <path data-editorial-center-accent="true"
        d={`M ${width-4} ${height-7} L ${width-1} ${height-4} L ${width-4} ${height-1} L ${width-7} ${height-4} Z`}
        fill={paper} stroke={ink} strokeWidth=".85" opacity=".57"/>}
    {sectionBreak&&density==='open'&&<line data-editorial-section-break="true"
      x1={Math.round(width*.18)} x2={Math.round(width*.82)}
      y1={height-2} y2={height-2} stroke={ink}
      strokeWidth=".8" opacity=".24"/>}
    {layout.blocks.map((block: {
      id:string;type:string;role:string;x:number;y:number;w:number;h:number;
      lines?:string[];fontSize?:number;serif?:boolean
    })=>{
      if(block.type==='figure')
        return block.id==='weather-coast'
          ? <CoastalWeather key={block.id} x={block.x} y={block.y}
              w={block.w} h={block.h} ink={ink}
              wmo={weather.wmo} windMs={weather.windMs}/>
          : <Botanical key={block.id} x={block.x} y={block.y}
              w={block.w} h={block.h} ink={ink}/>
      if(block.type==='divider')
        return <line key={block.id} x1={block.x} y1={block.y}
          x2={block.x+block.w} y2={block.y+(block.w<=2?block.h:0)}
          stroke={ink} strokeWidth={block.w<=2?'1':'2'} opacity=".8"/>
      if(block.type==='direction'){
        const isWind=block.id==='wind-arrow'
        return <g key={block.id} transform={`translate(${block.x},${block.y})`}
          stroke={ink} fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {isWind?<path d={`M 3 ${block.h*.48} L ${block.w-4} ${block.h*.48}
            M ${block.w-13} ${block.h*.21} L ${block.w-4} ${block.h*.48}
            L ${block.w-13} ${block.h*.75}`}/>:
            <path d={`M 4 ${block.h-3} L ${block.w-4} 3
              M ${block.w-14} 3 H ${block.w-4} V 13`}/>}
        </g>
      }
      if(block.type==='icon')
        return <g key={block.id} transform={`translate(${block.x},${block.y})`}
          stroke={ink} strokeWidth="1.4" strokeLinecap="round" fill="none">
          {block.id==='wave-period-icon'?
            <path d="M 1 10 Q 5 4 9 10 Q 13 16 17 10 Q 21 4 25 10 M 3 16 H 25"/>:
            <path d="M 1 5 H 29 M 5 10 H 24 M 2 15 H 30"/>}
        </g>
      if(block.type==='score')
        return <RatingBlocks key={block.id} x={block.x} y={block.y}
          w={block.w} h={block.h} ink={ink} theme={theme}
          reference={layout.mode==='surf-medium-reference'}/>
      if(block.type==='calendar')
        return <Calendar key={block.id} x={block.x} y={block.y}
          w={block.w} h={block.h} ink={ink}/>
      const size=block.fontSize??13
      const lineHeight=size*1.24
      const lines=block.lines??[]
      return <g key={block.id} data-role={block.role} data-block={block.id}>
        {lines.map((line,i)=><text key={i} data-audit-block={block.id}
          x={block.x+block.w/2}
          y={block.y+(i+.5)*lineHeight}
          textAnchor="middle" dominantBaseline="middle"
          fontFamily={block.serif?'Georgia, "Times New Roman", serif':'Arial, Helvetica, sans-serif'}
          fontSize={size} fill={ink} opacity={['secondary','list'].includes(block.role)?'.72':'1'}>
          {line}
        </text>)}
        {ornament&&density==='open'&&
          !['compact-summary','miniature','editorial-ribbon'].includes(layout.mode)&&
          (block.id==='heading'||block.id==='month')&&
          layout.mode!=='surf-medium-reference' && <BookDivider
          x={block.x+Math.min(40,block.w*.15)}
          y={block.y+block.h+3}
          width={block.w-Math.min(80,block.w*.3)}
          ink={ink}/>}
      </g>
    })}
  </svg>
}

type FrameTile={id:string;x:number;y:number;cols:number;rows:number;module:Module}
type DensityPolicy={mode:'open'|'chapter-grid'|'fine-grid';
  boundaries:Record<string,{right:boolean;bottom:boolean;centralJunction:boolean}>}
const moduleLabel=(module:Module)=>module==='assistant'
  ?'AI Follow':module.charAt(0).toUpperCase()+module.slice(1)

// Full-frame editing is a layout-study surface. Every cell uses the *same*
// EditorialCanvas renderer as the single-cell Lab; no fake thumbnail geometry.
function FullFrameLab({theme,weatherScene}:{
  theme:FrameTheme;weatherScene:WeatherScene
}){
  const [presetId,setPresetId]=useState('quarters')
  const [tiles,setTiles]=useState<FrameTile[]>(()=>makeEditorialGrid('quarters') as FrameTile[])
  const [selectedId,setSelectedId]=useState('cell-1')
  const [lastSeed,setLastSeed]=useState<number|null>(null)
  const [autoQuality,setAutoQuality]=useState(false)
  const [clean,setClean]=useState(false)
  const [copyStatus,setCopyStatus]=useState('')
  const [batch,setBatch]=useState<ReturnType<typeof randomEditorialGrid>[]>([])
  const batchRoot=useRef<HTMLElement|null>(null)
  const [exportBusy,setExportBusy]=useState(false)
  const [exportStatus,setExportStatus]=useState('')
  const selected=tiles.find(tile=>tile.id===selectedId)??tiles[0]
  const qualityScore=useMemo(()=>Math.round(scoreEditorialGrid(tiles)),[tiles])
  const emphasized=useMemo(()=>new Set(editorialOrnamentTiles(tiles)),[tiles])
  const groupCues=useMemo(()=>new Set(editorialGroupingCues(tiles)),[tiles])
  const densityRules=useMemo(()=>editorialDensityRules(tiles) as DensityPolicy,[tiles])
  const validation=useMemo(()=>{
    const problems=validateEditorialGrid(tiles)
    if(autoQuality)problems.push(...auditEditorialGridQuality(tiles))
    for(const tile of tiles){
      const content=composeEditorialModule(tile.module,
        tile.cols*GRID_CELL_WIDTH,tile.rows*GRID_CELL_HEIGHT,{weatherScene})
      for(const issue of auditEditorialComposition(content))
        problems.push(tile.id+' ('+tile.module+'): '+issue)
    }
    return problems
  },[tiles,weatherScene,autoQuality])
  const choosePreset=(id:string)=>{
    if(id==='random')return
    setTiles(previous=>(makeEditorialGrid(id) as FrameTile[]).map((tile:FrameTile,index:number)=>({
      ...tile,module:(previous[index]?.module??tile.module) as Module,
    })))
    setPresetId(id)
    setSelectedId('cell-1')
    setLastSeed(null)
    setAutoQuality(false)
    setBatch([])
  }
  const randomize=()=>{
    const seed=Math.floor(Math.random()*0x100000000)
    const result=randomEditorialGrid(seed,presetId,tiles)
    setBatch([])
    setTiles(result.tiles as FrameTile[])
    setPresetId(result.presetId)
    setSelectedId('cell-1')
    setLastSeed(result.seed)
    setAutoQuality(true)
  }
  const generateBatch=()=>{
    const base=Math.floor(Math.random()*0x100000000)
    const previews:ReturnType<typeof randomEditorialGrid>[]=[]
    let previous:FrameTile[]=tiles,previousId=presetId
    const history:FrameTile[][]=[]
    for(let i=0;i<10;i++){
      const result=randomEditorialGrid(
        (base+i*0x9E3779B9)>>>0,previousId,previous,history)
      previews.push(result)
      previous=result.tiles as FrameTile[]
      previousId=result.presetId
      history.push(previous)
    }
    setBatch(previews)
    const first=previews[0]
    setTiles(first.tiles as FrameTile[])
    setPresetId(first.presetId)
    setSelectedId('cell-1')
    setLastSeed(first.seed)
    setAutoQuality(true)
  }
  const downloadBatchPdf=async()=>{
    if(exportBusy||!batchRoot.current||batch.length===0)return
    setExportBusy(true)
    setExportStatus('Preparing full-resolution pages...')
    try{
      const pages=await exportEditorialBatchPdf(batchRoot.current,batch,{theme,weatherScene})
      setExportStatus('Downloaded '+pages+' full-size pages as a PDF')
    }catch(error){
      setExportStatus(error instanceof Error?error.message:'Could not export PDF')
    }finally{
      setExportBusy(false)
    }
  }
  const pickBatch=(index:number)=>{
    const chosen=batch[index]
    if(!chosen)return
    setTiles(chosen.tiles as FrameTile[])
    setPresetId(chosen.presetId)
    setSelectedId('cell-1')
    setLastSeed(chosen.seed)
    setAutoQuality(true)
  }
  const shuffleModules=()=>{
    const seed=Math.floor(Math.random()*0x100000000)
    setTiles(previous=>{
      return shuffleEditorialGridModules(seed,previous) as FrameTile[]
    })
    setLastSeed(seed)
    // Shuffling a customer-authored 16-cell grid must never re-enable a
    // generator's aesthetic selection constraints on their chosen geometry.
    setAutoQuality(false)
  }
  const updateModule=(id:string,module:Module)=>{
    setTiles(previous=>previous.map(tile=>tile.id===id?{...tile,module}:tile))
    setSelectedId(id)
    setLastSeed(null)
    setAutoQuality(false)
  }
  const copySetup=async()=>{
    try{
      await navigator.clipboard.writeText(JSON.stringify({
        presetId,seed:lastSeed,qualityScore,tiles:tiles.map(({id,x,y,cols,rows,module})=>
          ({id,x,y,cols,rows,module})),
      },null,2))
      setCopyStatus('Copied')
    }catch{
      setCopyStatus('Copy unavailable')
    }
  }
  const preset=EDITORIAL_GRID_PRESETS.find(p=>p.id===presetId)
  return <section data-testid="full-frame-lab" className="space-y-4">
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs">Full-frame arrangement
        <select data-testid="frame-preset" value={presetId}
          onChange={event=>choosePreset(event.target.value)}
          className="mt-1 block min-w-44 rounded border border-[#A99E93] bg-white px-3 py-2 text-sm">
          {presetId==='random'&&<option value="random">Random mosaic · generated</option>}
          {EDITORIAL_GRID_PRESETS.map(p=><option key={p.id} value={p.id}>{p.label} · {p.rects.length} modules</option>)}
        </select>
      </label>
      <button type="button" data-testid="frame-randomize"
        onClick={randomize}
        className="rounded bg-[#29231F] px-4 py-2 text-sm font-medium text-white">
        Randomize layout + modules
      </button>
      <button type="button" data-testid="frame-batch"
        onClick={generateBatch}
        className="rounded border border-[#A99E93] bg-[#EFEAE3] px-4 py-2 text-sm font-medium">
        Generate 10 previews
      </button>
      <button type="button" data-testid="frame-shuffle"
        onClick={shuffleModules}
        className="rounded border border-[#B6A99B] bg-white px-4 py-2 text-sm">
        Shuffle modules only
      </button>
      <button type="button" data-testid="frame-clean"
        aria-pressed={clean} onClick={()=>setClean(v=>!v)}
        className="rounded border border-[#B6A99B] bg-white px-4 py-2 text-sm">
        {clean?'Show editing':'Clean preview'}
      </button>
      <button type="button" onClick={()=>void copySetup()}
        className="rounded border border-[#B6A99B] bg-white px-4 py-2 text-sm">
        Copy setup
      </button>
      {copyStatus&&<span className="text-xs" role="status">{copyStatus}</span>}
    </div>
    <p className="text-sm text-[#62584E]">
      {preset?.description??'Automatically generated 4×4 mosaic'}. Click a cell to edit it, or change modules below.
      Randomizing creates a new grid and module selection.
      {lastSeed!==null&&<span data-testid="frame-seed" className="ml-2 font-mono text-xs">Seed {lastSeed} · {editorialGridFamily(tiles)} · Layout score {qualityScore}</span>}
    </p>
    <div className="rounded-xl bg-[#82715F] p-3 sm:p-5">
      <div className="flex justify-center bg-[#213543] p-3 sm:p-7">
        <div className="w-full max-w-[800px] border-[6px] border-[#F0EADF] bg-white">
          <div data-testid="editorial-full-frame" data-preset={presetId} data-tile-count={tiles.length}
            className="relative w-full" style={{aspectRatio:'800 / 480'}}>
            {tiles.map(tile=>{
              const width=tile.cols*GRID_CELL_WIDTH
              const height=tile.rows*GRID_CELL_HEIGHT
              const isSelected=selectedId===tile.id
              return <div data-frame-tile={tile.id} data-module={tile.module}
                data-columns={tile.cols} data-rows={tile.rows} key={tile.id}
                className="absolute overflow-hidden"
                style={{
                  left:(tile.x*25)+'%',top:(tile.y*25)+'%',
                  width:(tile.cols*25)+'%',height:(tile.rows*25)+'%',
                  backgroundColor:paperFor(theme),
                  boxShadow:densityRules.mode==='open'?
                    'inset 0 0 0 0.6px '+(theme==='light'?'#BFBAB1':'#696969'):
                    'none',
                }}>
                <EditorialCanvas module={tile.module} width={width} height={height}
                  theme={theme} weatherScene={weatherScene}
                  ornament={emphasized.has(tile.id)}
                  sectionBreak={groupCues.has(tile.id)}
                  density={densityRules.mode}
                  separateRight={densityRules.boundaries[tile.id]?.right}
                  separateBottom={densityRules.boundaries[tile.id]?.bottom}
                  centralJunction={densityRules.boundaries[tile.id]?.centralJunction}/>
                {!clean&&<button type="button"
                  aria-label={'Edit cell '+tile.id.replace('cell-','')+': '+moduleLabel(tile.module)}
                  aria-pressed={isSelected}
                  onClick={()=>setSelectedId(tile.id)}
                  className={'absolute inset-0 cursor-pointer border-2 transition-colors '+
                    (isSelected?'border-[#AD7D33]':'border-transparent hover:border-[#AD7D33]/50')}
                  style={{background:'transparent'}}/>}
              </div>
            })}
          </div>
        </div>
      </div>
    </div>
    {batch.length>0&&<section className="rounded-lg border border-[#D0C5B8] bg-white p-3"
      data-testid="frame-batch-results" ref={batchRoot}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">10 independently randomized layouts · choose any to inspect at full size</p>
          <p className="text-xs text-[#62584E]">Export shows each complete 800×480 frame on its own landscape page with the original seed.</p>
        </div>
        <button type="button" data-testid="frame-export-pdf"
          disabled={exportBusy} onClick={()=>void downloadBatchPdf()}
          className="rounded bg-[#29231F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {exportBusy?'Preparing PDF...':'Download all 10 as PDF'}
        </button>
      </div>
      {exportStatus&&<p className="mb-3 text-xs" role="status" data-testid="frame-pdf-status">{exportStatus}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {batch.map((design,index)=>{
          const accents=new Set(editorialOrnamentTiles(design.tiles))
          const sectionBreaks=new Set(editorialGroupingCues(design.tiles))
          const previewDensity=editorialDensityRules(design.tiles) as DensityPolicy
          return <button type="button" key={index}
            onClick={()=>pickBatch(index)}
            aria-label={'Inspect random design '+(index+1)}
            className={'rounded border p-2 text-left '+(lastSeed===design.seed?
              'border-[#AD7D33] ring-2 ring-[#AD7D33]/40':'border-[#D0C5B8]')}>
            <div className="mb-1 text-xs">#{index+1} · {design.tiles.length} modules</div>
            <div className="relative w-full overflow-hidden border border-[#E5E0D8]"
              data-batch-preview={index}
              style={{aspectRatio:'800 / 480',backgroundColor:paperFor(theme)}}>
              {design.tiles.map((tile:FrameTile)=>{
                const w=tile.cols*GRID_CELL_WIDTH,h=tile.rows*GRID_CELL_HEIGHT
                return <div key={tile.id} className="absolute" data-export-tile={tile.id}
                  style={{left:(tile.x*25)+'%',top:(tile.y*25)+'%',
                    width:(tile.cols*25)+'%',height:(tile.rows*25)+'%'}}>
                  <EditorialCanvas module={tile.module} width={w} height={h}
                    theme={theme} weatherScene={weatherScene}
                    ornament={accents.has(tile.id)}
                    sectionBreak={sectionBreaks.has(tile.id)}
                    density={previewDensity.mode}
                    separateRight={previewDensity.boundaries[tile.id]?.right}
                    separateBottom={previewDensity.boundaries[tile.id]?.bottom}
                    centralJunction={previewDensity.boundaries[tile.id]?.centralJunction}/>
                </div>
              })}
            </div>
          </button>
        })}
      </div>
    </section>}
    <div data-testid="frame-layout-audit" data-issues={validation.length}
      className={'rounded bg-white p-3 text-sm '+(validation.length?'text-red-700':'text-[#476242]')}>
      {tiles.length} modules · {validation.length===0?'16/16':'Check'} grid squares covered ·
      {' '+validation.length} detected layout problems
      {validation.length>0&&<ul className="mt-2 list-disc pl-5">
        {validation.slice(0,8).map((issue,i)=><li key={i}>{issue}</li>)}
      </ul>}
    </div>
    {!clean&&<>
      <div className="rounded-lg border border-[#D0C5B8] bg-white p-3">
        <label className="block text-sm font-medium">
          Editing cell {selected.id.replace('cell-','')} · {selected.cols}×{selected.rows}
          <select data-testid="frame-selected-module"
            value={selected.module}
            onChange={event=>updateModule(selected.id,event.target.value as Module)}
            className="mt-2 block w-full max-w-sm rounded border border-[#B6A99B] bg-white px-3 py-2">
            {EDITORIAL_MODULES.map(name=><option key={name} value={name}>{moduleLabel(name)}</option>)}
          </select>
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(tile=><label key={tile.id}
          className={'rounded border p-3 text-xs '+(tile.id===selectedId?
            'border-[#AD7D33] bg-white':'border-[#D0C5B8] bg-[#FAF9F6]')}>
          <span className="mb-1 block font-semibold">
            Cell {tile.id.replace('cell-','')} · {tile.cols}×{tile.rows}
          </span>
          <select aria-label={'Module in cell '+tile.id.replace('cell-','')}
            data-testid={'frame-module-'+tile.id}
            value={tile.module}
            onChange={event=>updateModule(tile.id,event.target.value as Module)}
            className="w-full rounded border border-[#B6A99B] bg-white px-2 py-2 text-sm">
            {EDITORIAL_MODULES.map(name=><option key={name} value={name}>{moduleLabel(name)}</option>)}
          </select>
        </label>)}
      </div>
    </>}
    <p className="text-xs text-[#62584E]">
      This is a conceptual full-frame composition test, using sample module content.
      It does not modify saved frame layouts or mirror physical firmware pixels.
    </p>
  </section>
}

export default function EditorialLabPage(){
  const [view,setView]=useState<'single'|'frame'>('single')
  const [module,setModule]=useState<Module>('date')
  const [cell,setCell]=useState<Cell>('4x4')
  const [theme,setTheme]=useState<FrameTheme>('light')
  const [weatherScene,setWeatherScene]=useState<WeatherScene>('partly')
  const [matrix,setMatrix]=useState(false)
  const browserProbes=useRef<HTMLDivElement|null>(null)
  const [browserAudit,setBrowserAudit]=useState<{checked:number;issues:string[]}|null>(null)
  const probeCases=useMemo(()=>EDITORIAL_MODULES.flatMap(name=>cells.flatMap(dimension=>
    (['light','dark'] as const).map(mode=>({name,dimension,mode}))
  )),[])
  useEffect(()=>{
    let cancelled=false
    const check=()=>{
      if(cancelled||!browserProbes.current)return
      const problems:string[]=[]
      const views=browserProbes.current.querySelectorAll<SVGSVGElement>('svg[data-editorial-probe]')
      for(const view of views){
        const moduleName=view.dataset.module??'?'
        const width=Number(view.dataset.width),height=Number(view.dataset.height)
        const labels=view.querySelectorAll<SVGTextElement>('text[data-audit-block]')
        const boxes:Array<{name:string;box:DOMRect}>=[]
        for(const label of labels){
          const box=label.getBBox()
          const identity=moduleName+' '+width+'×'+height+' '+(label.dataset.auditBlock??'?')
          if(box.width>0&&box.height>0){
            if(box.x<-.5||box.y<-.5||box.x+box.width>width+.5||box.y+box.height>height+.5)
              problems.push(identity+': glyphs outside frame')
            boxes.push({name:identity,box:box as DOMRect})
          }
        }
        for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
          const a=boxes[i],b=boxes[j]
          const dx=Math.min(a.box.x+a.box.width,b.box.x+b.box.width)-Math.max(a.box.x,b.box.x)
          const dy=Math.min(a.box.y+a.box.height,b.box.y+b.box.height)-Math.max(a.box.y,b.box.y)
          if(dx>1&&dy>1)problems.push(a.name+' / '+b.name+': glyph overlap')
        }
      }
      if(!cancelled)setBrowserAudit({checked:views.length,issues:problems})
    }
    void document.fonts.ready.then(check,()=>{
      if(!cancelled)setBrowserAudit({checked:0,issues:['Browser font measurements unavailable']})
    })
    return ()=>{cancelled=true}
  },[])
  const selected=cells.find(item=>item.key===cell)??cells[cells.length-1]
  const plan=editorialPlan(selected.width,selected.height)
  const audit=useMemo(()=>{
    const issues=[]
    for(const name of EDITORIAL_MODULES)for(const dimension of cells)
      for(const mode of ['light','dark']){
        const layout=composeEditorialModule(name,dimension.width,dimension.height)
        const found=auditEditorialComposition(layout)
        for(const issue of found)issues.push(name+' '+dimension.key+' '+mode+': '+issue)
      }
    return {checked:EDITORIAL_MODULES.length*cells.length*2,issues}
  },[])
  const hasProblems=audit.issues.length>0
  return <main data-editorial-scroll="true"
    className="h-dvh min-h-0 w-full overflow-x-hidden overflow-y-auto overscroll-y-contain bg-[#EDEAE4] p-4 text-[#28221C] sm:p-8"
    style={{WebkitOverflowScrolling:'touch'}}>
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-1 text-xs uppercase tracking-[.23em] text-[#706354]">RE:MIND · Design study</p>
          <h1 className="font-serif text-3xl sm:text-4xl">Editorial design laboratory</h1>
          <p className="mt-2 max-w-3xl text-sm text-[#645B50]">
            All content uses a shared centered layout engine. This browser concept
            is not a pixel-perfect physical firmware preview.
          </p>
        </div>
        <Link href="/" className="rounded border border-[#B6A99B] px-4 py-2 text-sm">Back to RE:MIND</Link>
      </header>
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Editorial Lab view">
        <button type="button" data-testid="full-frame-tab"
          aria-pressed={view==='frame'} onClick={()=>setView('frame')}
          className={'rounded px-4 py-3 text-sm font-medium '+(view==='frame'
            ?'bg-[#29231F] text-white':'border border-[#B6A99B] bg-white')}>
          Full frame · mix modules
        </button>
        <button type="button" data-testid="single-module-tab"
          aria-pressed={view==='single'} onClick={()=>setView('single')}
          className={'rounded px-4 py-3 text-sm font-medium '+(view==='single'
            ?'bg-[#29231F] text-white':'border border-[#B6A99B] bg-white')}>
          Single module · 16 shapes
        </button>
      </div>
      {view==='frame'&&<div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium">Frame appearance</span>
        {(['light','dark'] as const).map(mode=><button key={mode}
          type="button" aria-pressed={theme===mode}
          onClick={()=>setTheme(mode)}
          className={'rounded border px-4 py-2 text-sm '+(theme===mode?
            'border-[#29231F] bg-[#29231F] text-white':'border-[#B6A99B] bg-white')}>
          {mode==='light'?'Light':'Dark'}
        </button>)}
        <label className="text-xs">Weather sky
          <select data-testid="full-frame-weather-sky" value={weatherScene}
            onChange={e=>setWeatherScene(e.target.value as WeatherScene)}
            className="ml-2 rounded border border-[#B6A99B] bg-white px-2 py-2 text-sm">
            {Object.entries(WEATHER_VIGNETTE_SCENES).map(([key,item])=>
              <option key={key} value={key}>{item.label}</option>)}
          </select>
        </label>
      </div>}
      {view==='frame'&&<FullFrameLab theme={theme} weatherScene={weatherScene}/>}
      {view==='single'&&<>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs">Module
          <select value={module} onChange={e=>setModule(e.target.value as Module)}
            className="mt-1 block rounded border border-[#A99E93] bg-white px-3 py-2 text-sm">
            {EDITORIAL_MODULES.map(name=><option key={name} value={name}>
              {name==='assistant'?'AI Follow':name.charAt(0).toUpperCase()+name.slice(1)}
            </option>)}
          </select>
        </label>
        <label className="text-xs">Custom grid
          <select value={cell} onChange={e=>setCell(e.target.value)}
            className="mt-1 block rounded border border-[#A99E93] bg-white px-3 py-2 text-sm">
            {cells.map(d=><option key={d.key} value={d.key}>
              {d.key.replace('x','×')} · {d.width}×{d.height}px
            </option>)}
          </select>
        </label>
        <fieldset className="flex items-end gap-2" aria-label="Frame theme">
          {(['light','dark'] as const).map(mode=><button key={mode}
            type="button" aria-pressed={theme===mode} onClick={()=>setTheme(mode)}
            className={'rounded border px-4 py-2 text-sm '+(theme===mode
              ?'border-[#28211C] bg-[#28211C] text-white':'border-[#BCB1A5] bg-white')}>
            {mode==='light'?'Light':'Dark'}
          </button>)}
        </fieldset>
        {module==='weather'&&<label className="text-xs">Sky illustration
          <select value={weatherScene} onChange={e=>setWeatherScene(e.target.value as WeatherScene)}
            data-testid="weather-sky-selector"
            className="mt-1 block rounded border border-[#A99E93] bg-white px-3 py-2 text-sm">
            {Object.entries(WEATHER_VIGNETTE_SCENES).map(([key,scene])=>
              <option key={key} value={key}>{scene.label}</option>)}
          </select>
        </label>}
        <button type="button" onClick={()=>setMatrix(v=>!v)}
          aria-pressed={matrix}
          className="rounded border border-[#A99E93] bg-white px-4 py-2 text-sm">
          {matrix?'Single preview':'View all 16 shapes'}
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-4 rounded bg-white p-3 text-sm">
        <strong>Automatic layout audit</strong>
        <span data-testid="editorial-geometry-audit" data-issues={audit.issues.length}
          data-checked={audit.checked}>
          {audit.checked} module × grid × theme combinations checked
        </span>
        <span className={hasProblems?'text-red-700':'text-[#476242]'}>
          {audit.issues.length} geometric issues
        </span>
        <span data-testid="editorial-browser-audit" data-issues={browserAudit?.issues.length??-1}
          data-checked={browserAudit?.checked??0}
          className={browserAudit?.issues.length?'text-red-700':'text-[#476242]'}>
          {browserAudit
            ? browserAudit.checked+' browser renderings · '+browserAudit.issues.length+' glyph issues'
            : 'Measuring rendered browser glyphs…'}
        </span>
        <span className="text-[#81776D]">Real e-paper QA still required.</span>
      </div>

      {matrix?<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cells.map(d=>{
          // Fit BOTH width and height within the gallery thumbnail. A tall
          // 1x4 cell must never spill into the next card row.
          const scale=Math.min(152/d.width,122/d.height)
          return <button key={d.key} type="button" data-editorial-cell={d.key}
            onClick={()=>{setCell(d.key);setMatrix(false)}}
            className="min-w-0 rounded-lg border border-[#CEC4B7] bg-[#DDD4C7] p-3 text-left">
            <span className="mb-2 block text-xs font-medium">{d.key.replace('x','×')} · {d.width}×{d.height}</span>
            <div className="flex h-40 min-w-0 items-center justify-center overflow-hidden bg-[#243746] p-3">
              <div data-editorial-thumbnail="true" className="shrink border-[3px] border-[#ECE6DC]"
                style={{width:d.width*scale,aspectRatio:d.width+'/'+d.height,maxWidth:'100%',maxHeight:122}}>
                <EditorialCanvas module={module} width={d.width} height={d.height} theme={theme}
                  weatherScene={weatherScene}/>
              </div>
            </div>
          </button>
        })}
      </div>:<div className="rounded-xl bg-[#82715F] p-3 sm:p-5">
        <div className="flex min-h-[390px] items-center justify-center bg-[#213543] p-4 sm:p-8">
          <div className="w-full border-[6px] border-[#F0EADF] bg-white"
            style={{maxWidth:selected.width}}>
            <EditorialCanvas module={module} width={selected.width}
              height={selected.height} theme={theme} weatherScene={weatherScene}/>
          </div>
        </div>
      </div>}
      {browserAudit&&browserAudit.issues.length>0&&
        <div className="mt-4 rounded border border-amber-300 bg-white p-3 text-xs">
          <strong>Browser typography issues detected</strong>
          <ul>{browserAudit.issues.slice(0,8).map((issue,index)=>
            <li key={index}>{issue}</li>)}</ul>
        </div>}
      {hasProblems&&<div className="mt-4 rounded border border-red-300 bg-white p-3">
        <p className="font-medium text-red-800">Composition issues need fixing before pilot</p>
        <ul className="mt-2 text-xs">{audit.issues.slice(0,12).map(msg=><li key={msg}>{msg}</li>)}</ul>
      </div>}
      </>}
      <div ref={browserProbes} aria-hidden="true"
        style={{position:'absolute',left:'-100000px',top:0,visibility:'hidden',pointerEvents:'none'}}>
        {probeCases.map(({name,dimension,mode})=><div key={name+dimension.key+mode}
          style={{width:dimension.width,height:dimension.height}}>
          <EditorialCanvas module={name} width={dimension.width}
            height={dimension.height} theme={mode}/>
        </div>)}
      </div>
      {view==='single'&&<div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded bg-white p-4"><b>Composition</b><p>{plan.shape} · {plan.columns} column(s)</p></div>
        <div className="rounded bg-white p-4"><b>Safe inset</b><p>{plan.inset}px · {plan.gap}px spacing</p></div>
        <div className="rounded bg-white p-4"><b>Editorial rule</b><p>Group centered; secondary text yields to essentials</p></div>
      </div>}
    </div>
  </main>
}
