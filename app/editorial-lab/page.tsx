'use client'

import {useEffect,useMemo,useRef,useState} from 'react'
import Link from 'next/link'
import {editorialPlan} from '../lib/editorialFrameLayout.mjs'
import {EDITORIAL_MODULES,composeEditorialModule,auditEditorialComposition} from '../lib/editorialComposition.mjs'

type Module = typeof EDITORIAL_MODULES[number]
type Span = 1|2|3|4
type Cell = string
type FrameTheme = 'light'|'dark'
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
function WeatherEngraving({x,y,w,h,ink}:{
  x:number;y:number;w:number;h:number;ink:string
}){
  return <svg x={x} y={y} width={w} height={h} viewBox="0 0 124 86"
    fill="none" stroke={ink} strokeWidth="1.25" strokeLinecap="round"
    strokeLinejoin="round" aria-label="Decorative coastal weather engraving">
    <circle cx="31" cy="24" r="10"/>
    <path d="M31 7 V3 M31 41 V45 M14 24 H10 M48 24 H52"/>
    <path d="M6 58 L26 46 L43 52 L65 39 L85 52 L119 58
      M7 65 H118 M11 72 H48 M63 72 H115"/>
    <path d="M71 20 Q82 9 95 20 Q108 13 117 27
      M83 31 Q98 25 115 33"/>
  </svg>
}
function RatingBlocks({x,y,w,ink,theme,reference=false}:{
  x:number;y:number;w:number;ink:string;theme:FrameTheme;reference?:boolean
}){
  // The approved physical Medium template uses 20×14 blocks, a 6px gap
  // and radius 3. Other shapes remain free to resize these marks.
  const gap=reference?6:4
  const blockW=reference?20:Math.min(22,(w-5*gap)/6)
  const blockH=14
  const actual=6*blockW+5*gap
  const left=x+(w-actual)/2
  const muted=theme==='light'?'#777777':'#C0C0C0'
  return <g role="img" aria-label="Three of six filled Surf rating rectangles">
    {Array.from({length:6},(_,index)=><rect key={index}
      x={left+index*(blockW+gap)} y={y+(16-blockH)/2} width={blockW} height={blockH}
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

function EditorialCanvas({module,width,height,theme}:{
  module:Module;width:number;height:number;theme:FrameTheme
}) {
  const layout=composeEditorialModule(module,width,height)
  const paper=paperFor(theme),ink=inkFor(theme)
  return <svg role="img"
    aria-label={module+' '+width+'×'+height+' editorial concept, '+theme+' theme'}
    viewBox={'0 0 '+width+' '+height} preserveAspectRatio="xMidYMid meet"
    data-editorial-probe="true" data-module={module} data-width={width} data-height={height}
    className="block h-auto w-full" style={{backgroundColor:paper}}>
    <rect width={width} height={height} fill={paper}/>
    {layout.blocks.map((block: {
      id:string;type:string;role:string;x:number;y:number;w:number;h:number;
      lines?:string[];fontSize?:number;serif?:boolean
    })=>{
      if(block.type==='figure')
        return block.id==='weather-landscape'
          ? <WeatherEngraving key={block.id} x={block.x} y={block.y}
              w={block.w} h={block.h} ink={ink}/>
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
          w={block.w} ink={ink} theme={theme}
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
        {block.role==='heading' && layout.mode!=='surf-medium-reference' && <BookDivider
          x={block.x+Math.min(40,block.w*.15)}
          y={block.y+block.h+3}
          width={block.w-Math.min(80,block.w*.3)}
          ink={ink}/>}
      </g>
    })}
  </svg>
}

export default function EditorialLabPage(){
  const [module,setModule]=useState<Module>('date')
  const [cell,setCell]=useState<Cell>('4x4')
  const [theme,setTheme]=useState<FrameTheme>('light')
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
  return <main className="min-h-screen bg-[#EDEAE4] p-4 text-[#28221C] sm:p-8">
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
                <EditorialCanvas module={module} width={d.width} height={d.height} theme={theme}/>
              </div>
            </div>
          </button>
        })}
      </div>:<div className="rounded-xl bg-[#82715F] p-3 sm:p-5">
        <div className="flex min-h-[390px] items-center justify-center bg-[#213543] p-4 sm:p-8">
          <div className="w-full border-[6px] border-[#F0EADF] bg-white"
            style={{maxWidth:selected.width}}>
            <EditorialCanvas module={module} width={selected.width}
              height={selected.height} theme={theme}/>
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
      <div ref={browserProbes} aria-hidden="true"
        style={{position:'absolute',left:'-100000px',top:0,visibility:'hidden',pointerEvents:'none'}}>
        {probeCases.map(({name,dimension,mode})=><div key={name+dimension.key+mode}
          style={{width:dimension.width,height:dimension.height}}>
          <EditorialCanvas module={name} width={dimension.width}
            height={dimension.height} theme={mode}/>
        </div>)}
      </div>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded bg-white p-4"><b>Composition</b><p>{plan.shape} · {plan.columns} column(s)</p></div>
        <div className="rounded bg-white p-4"><b>Safe inset</b><p>{plan.inset}px · {plan.gap}px spacing</p></div>
        <div className="rounded bg-white p-4"><b>Editorial rule</b><p>Group centered; secondary text yields to essentials</p></div>
      </div>
    </div>
  </main>
}
