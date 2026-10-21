'use client'

import {useMemo, useState} from 'react'
import Link from 'next/link'
import {editorialContentBudget, editorialModuleKind, editorialPlan} from '../lib/editorialFrameLayout.mjs'

type Module = 'date' | 'reminders' | 'weather' | 'news' | 'surf' | 'ski' |
  'countdown' | 'soccer' | 'stocks' | 'groceries' | 'assistant'
type FrameTheme = 'light' | 'dark'
type Dimension = 'compact' | 'ribbon' | 'card' | 'column' | 'spread'

const dimensions: Record<Dimension,[number,number]> = {
  compact:[200,120], ribbon:[800,120], card:[400,240],
  column:[200,480], spread:[800,480],
}
const modules: Module[]=['date','reminders','weather','news','surf','ski',
  'countdown','soccer','stocks','groceries','assistant']
const content: Record<Module,{heading:string;primary:string;detail:string;extra:string[]}> = {
  date: {heading:'OCTOBER',primary:'21',detail:'WEDNESDAY',extra:['2026','Autumn']},
  reminders:{heading:'UPCOMING',primary:'Kontrolltime Aleris',detail:'Friday · 12:30',
    extra:['18:00 · Passe søsken','Saturday · Pick up parcel']},
  weather:{heading:'STAVANGER',primary:'12°C',detail:'Cloudy with sunny spells',
    extra:['Wind 4 m/s NW','Low 9°  ·  High 13°','A brighter weekend ahead']},
  news:{heading:'NEWS',primary:'The world today, at a glance',detail:'A quieter, more considered daily briefing',
    extra:['A second important headline','And a third story, when space allows']},
  surf:{heading:'HELLESTØ',primary:'3 / 6',detail:'Fair surf today',
    extra:['Waves 0.8–1.2 m','Period 10 s','Wind NE 4 m/s']},
  ski:{heading:'SKI CONDITIONS',primary:'15 cm',detail:'Fresh snow',
    extra:['Cloudy · −4°C','Lifts open 9–16']},
  countdown:{heading:'COUNTDOWN',primary:'24',detail:'DAYS UNTIL CHRISTMAS',
    extra:['24 December 2026','Coming up']},
  soccer:{heading:'VIKING',primary:'VIK  ·  2 — 1',detail:'Full time',
    extra:['Next match · Sunday','League position · 3']},
  stocks:{heading:'EQUINOR',primary:'274.50',detail:'NOK  ·  +1.4%',
    extra:['Today  +3.70','Month  +5.2%']},
  groceries:{heading:'SHOPPING LIST',primary:'Milk',detail:'Bread',
    extra:['Coffee','Apples','Butter']},
  assistant:{heading:'AI FOLLOW',primary:'No new updates',detail:'Following two topics',
    extra:['Last checked today']},
}
const textFonts={serif:'Georgia, "Times New Roman", serif',
  sans:'Arial, Helvetica, sans-serif'}

function Ornament({x,y,w,ink}:{x:number;y:number;w:number;ink:string}) {
  if(w<95)return null
  const c=x+w/2
  return <g fill="none" stroke={ink} strokeWidth="1" strokeLinecap="round">
    <path d={`M ${x} ${y} H ${c-30} M ${c+30} ${y} H ${x+w}`}/>
    <circle cx={c} cy={y} r="2.8"/>
    <path d={`M ${c-22} ${y} l 12 -5 l -8 -1 l 8 6 l -8 6 l 8 -1
      M ${c+22} ${y} l -12 -5 l 8 -1 l -8 6 l 8 6 l -8 -1`}/>
  </g>
}
function Botanical({x,y,w,h,ink}:{x:number;y:number;w:number;h:number;ink:string}) {
  return <g stroke={ink} fill="none" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"
    transform={`translate(${x},${y}) scale(${w/108},${h/70})`}>
    <path d="M54 67 L52 38 L56 8 M54 53 L34 41 L25 32 L42 46 L54 53
      M54 42 L73 30 L86 18 L66 36 L54 42 M53 31 L36 23 L27 12 L45 28 L53 31
      M52 39 L37 32 L29 37 L41 37 L52 39 M54 51 L72 44 L82 49 L68 49 L54 51"/>
    <path d="M34 41 Q21 26 25 32 Q40 27 42 46
      M73 30 Q79 12 86 18 Q92 29 66 36
      M36 23 Q24 11 27 12 Q36 7 45 28
      M72 44 Q90 42 82 49 Q81 57 68 49"/>
    <path d="M47 67 H61"/>
  </g>
}
function WeatherLandscape({x,y,w,h,ink}:{x:number;y:number;w:number;h:number;ink:string}) {
  return <g stroke={ink} strokeWidth="1.15" strokeLinecap="round" fill="none"
    transform={`translate(${x},${y}) scale(${w/124},${h/86})`}>
    <circle cx="31" cy="24" r="10"/>
    <path d="M31 7 V3 M31 41 V45 M14 24 H10 M48 24 H52
      M7 57 L25 48 L40 53 L62 40 L83 53 L118 57
      M6 63 H118 M10 70 H49 M62 71 H115"/>
  </g>
}
function Label({x,y,children,ink,size=12,anchor='middle',serif=false}:
  {x:number;y:number;children:string;ink:string;size?:number;anchor?:'middle'|'start';serif?:boolean}) {
  return <text x={x} y={y} fill={ink} fontSize={size} textAnchor={anchor}
    fontFamily={serif?textFonts.serif:textFonts.sans} letterSpacing={serif?0.8:1.5}>
    {children}
  </text>
}
function DesignCanvas({module,width,height,theme}:{
  module:Module;width:number;height:number;theme:FrameTheme
}) {
  const p=editorialPlan(width,height)
  const budget=editorialContentBudget(p,editorialModuleKind(module))
  const paper=theme==='light'?'#FFFFFF':'#101010'
  const ink=theme==='light'?'#171717':'#F7F7F7'
  const muted=theme==='light'?'#555555':'#CCCCCC'
  const v=content[module]
  const cx=width/2, pad=p.inset
  const roomy=p.shape==='spread',wide=p.shape==='ribbon',tall=p.shape==='column'
  const figure=budget.illustration
  const mainSize=roomy?52:tall?32:wide?36:26
  const headerY=pad+24
  const normalItemCount=Math.min(v.extra.length,budget.listItems || (roomy?3:p.shape==='card'?1:0))
  const textWidth=width-pad*2
  const clipped=(value:string,max:number)=>value.length>max?value.slice(0,Math.max(1,max-1))+'…':value
  const textCap=roomy?42:wide?32:tall?17:Math.max(12,Math.floor(textWidth/10))
  const showExtras=normalItemCount>0&&height>190&&budget.secondary
  return <svg role="img" aria-label={`${module} · ${p.shape} · ${theme} experimental composition`}
    viewBox={`0 0 ${width} ${height}`}
    style={{width:'100%',height:'auto',display:'block',background:paper,color:ink}}>
    <rect width={width} height={height} fill={paper}/>
    {module==='date' ? <>
      {wide ? <>
        <Label x={pad+8} y={height/2+8} anchor="start" ink={muted} size={14}>WEDNESDAY</Label>
        <Label x={cx} y={height/2+18} ink={ink} size={60} serif>21</Label>
        <Label x={width-pad-12} y={height/2+7} anchor="start" ink={muted} size={12}>OCTOBER 2026</Label>
      </>:<>
        <Label x={roomy?width*.31:cx} y={pad+25} ink={muted} size={14}>2026</Label>
        <Label x={roomy?width*.31:cx} y={pad+59} ink={ink} size={22} serif>October</Label>
        <Label x={roomy?width*.31:cx} y={roomy?177:Math.min(height*.6,170)}
          ink={ink} size={roomy?100:Math.min(height*.38,70)} serif>21</Label>
        <Label x={roomy?width*.31:cx} y={roomy?209:Math.min(height*.8,215)}
          ink={muted} size={roomy?17:13}>WEDNESDAY</Label>
        {figure&&<Botanical x={width*.31-54} y={height-132} w={108} h={70} ink={ink}/>}
        {roomy&&<g>
          <Ornament x={width*.57} y={70} w={width*.36} ink={ink}/>
          <Label x={width*.75} y={52} ink={muted} size={13}>OCTOBER 2026</Label>
          {Array.from({length:31},(_,i)=>{
            const x=width*.565+(i%7)*width*.055
            const y=120+Math.floor(i/7)*48
            return <g key={i}>
              {i===20&&<circle cx={x} cy={y-6} r={17} fill="none" stroke={ink}/>}
              <Label x={x} y={y} ink={ink} size={14}>{String(i+1)}</Label>
            </g>
          })}
        </g>}
      </>}
    </> : <>
      {budget.heading&&<Label x={cx} y={headerY} ink={muted} size={roomy?17:13} serif>{v.heading}</Label>}
      {budget.heading&&<Ornament x={pad+12} y={headerY+17} w={width-pad*2-24} ink={ink}/>}
      {module==='weather' ? <>
        {figure&&<WeatherLandscape x={width*.15} y={90} w={190} h={130} ink={ink}/>}
        <Label x={figure?width*.69:cx} y={figure?160:wide?height/2+14:Math.min(height*.58,180)}
          ink={ink} size={mainSize+12} serif>{v.primary}</Label>
        <Label x={figure?width*.69:cx} y={figure?194:wide?height/2+36:Math.min(height*.7,210)}
          ink={muted} size={roomy?16:11}>{clipped(v.detail,textCap)}</Label>
      </> : <>
        {module==='reminders' ? <>
          <Label x={pad+10} y={roomy?130:wide?height/2+4:Math.min(height*.45,114)}
            anchor="start" ink={muted} size={roomy?17:12}>12:30</Label>
          <Label x={roomy?pad+100:wide?pad+88:cx} y={roomy?130:wide?height/2+4:Math.min(height*.6,149)}
            anchor={roomy||wide?'start':'middle'} ink={ink} size={roomy?24:14} serif>
            {clipped(v.primary,roomy?38:wide?32:tall?16:22)}
          </Label>
          {roomy&&<Label x={pad+100} y={165} anchor="start" ink={muted} size={13}>Friday 23 October</Label>}
        </> : <>
          <Label x={cx} y={wide?height/2+10:roomy?174:Math.min(height*.58,150)}
            ink={ink} size={module==='news'?roomy?29:17:mainSize}
            serif={module!=='soccer'}>{clipped(v.primary,module==='news'?roomy?45:wide?40:19:textCap)}</Label>
          <Label x={cx} y={wide?height/2+33:roomy?208:Math.min(height*.76,188)}
            ink={muted} size={roomy?16:11}>{clipped(v.detail,textCap)}</Label>
        </>}
      </>}
      {showExtras&&<g>
        <Ornament x={pad+10} y={height*.60} w={width-pad*2-20} ink={ink}/>
        {v.extra.slice(0,normalItemCount).map((item,i)=>
          <Label key={i} x={cx} y={height*.68+i*(roomy?39:25)}
            ink={muted} size={roomy?15:12}>{clipped(item,textCap)}</Label>)}
      </g>}
    </>}
  </svg>
}

export default function EditorialLabPage(){
  const [module,setModule]=useState<Module>('date')
  const [dimension,setDimension]=useState<Dimension>('spread')
  const [theme,setTheme]=useState<FrameTheme>('light')
  const [width,height]=dimensions[dimension]
  const plan=useMemo(()=>editorialPlan(width,height),[width,height])
  return <main className="min-h-screen bg-[#EDEAE4] p-4 text-[#222] sm:p-8">
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-xs uppercase tracking-[0.25em] text-[#72675C]">RE:MIND · experimental</p>
          <h1 className="font-serif text-3xl sm:text-4xl">Editorial design laboratory</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#6C645A]">
            Visual study using sample content. This is a composition and art-direction review,
            not a pixel-perfect preview of the current firmware.
          </p>
        </div>
        <Link href="/" className="rounded-lg border border-[#C7C0B6] px-4 py-2 text-sm">Back to RE:MIND</Link>
      </div>
      <div className="mb-5 flex flex-wrap gap-3">
        <label className="text-xs">Module
          <select value={module} onChange={e=>setModule(e.target.value as Module)}
            className="mt-1 block rounded-md border border-[#BAB0A4] bg-white px-3 py-2 text-sm">
            {modules.map(k=><option key={k} value={k}>{k[0].toUpperCase()+k.slice(1)}</option>)}
          </select>
        </label>
        <label className="text-xs">Custom-grid cell
          <select value={dimension} onChange={e=>setDimension(e.target.value as Dimension)}
            className="mt-1 block rounded-md border border-[#BAB0A4] bg-white px-3 py-2 text-sm">
            {(Object.keys(dimensions) as Dimension[]).map(k=><option key={k} value={k}>
              {k} · {dimensions[k].join('×')}
            </option>)}
          </select>
        </label>
        <fieldset className="flex items-end gap-2" aria-label="Frame theme">
          {(['light','dark'] as const).map(v=><button key={v} type="button"
            onClick={()=>setTheme(v)} aria-pressed={theme===v}
            className={`rounded-md border px-4 py-2 text-sm ${theme===v?'border-[#46403B] bg-[#25211D] text-white':'border-[#BAB0A4] bg-white'}`}>
            {v==='light'?'Light':'Dark'}
          </button>)}
        </fieldset>
      </div>
      <div className="overflow-x-auto rounded-xl bg-[#7F6E59] p-3 shadow-xl sm:p-5">
        <div className="mx-auto flex min-h-[380px] max-w-[850px] items-center justify-center bg-[#203341] px-5 py-10 sm:px-8">
          <div className="w-full overflow-hidden border-[6px] border-[#EDE8DD] bg-white shadow-[0_2px_14px_rgba(0,0,0,0.25)]"
            style={{maxWidth:width}}>
            <DesignCanvas module={module} width={width} height={height} theme={theme}/>
          </div>
        </div>
      </div>
      <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-lg bg-white p-4"><b>Composition</b><p className="mt-1 text-[#6C645A]">{plan.shape} · {plan.columns} column(s)</p></div>
        <div className="rounded-lg bg-white p-4"><b>Padding</b><p className="mt-1 text-[#6C645A]">{plan.inset}px · {plan.gap}px spacing</p></div>
        <div className="rounded-lg bg-white p-4"><b>Decorative artwork</b>
          <p className="mt-1 text-[#6C645A]">{plan.illustrationsAllowed?'Allowed only in this spacious cell':'Hidden to protect information'}</p>
        </div>
      </div>
      <p className="mt-5 text-sm text-[#6C645A]">Light and Dark refer to the existing physical-frame themes.
        The colored frame and blue mount are presentation context only. Physical e-paper remains black and white.</p>
    </div>
  </main>
}
