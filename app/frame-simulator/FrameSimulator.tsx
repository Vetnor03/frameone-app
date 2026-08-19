'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './FrameSimulator.module.css'
import {
  PANEL, VIEWPORT, cellsForLayout, dividersForLayout, frameLayouts, gridX, gridY,
  isSupported, moduleProfiles, quantizeOneBit, resolveGridCell,
  type LayoutName, type ModuleName, type PixelCell,
} from '../lib/frameSimulator'

type Preset = 'normal' | 'long' | 'extreme' | 'empty'
const fake = {
  date: { normal:['Wednesday','August','19','2026'], long:['torsdag','desember','31','2026'], extreme:['Wednesday','September','30','2099'], empty:['Date unavailable','','',''] },
  reminders: { normal:['Today','Dentist · 14:30','Buy coffee','Call Mum'], long:['Tomorrow','Renew the family travel insurance','Call the electrical contractor','Pick up prescriptions'], extreme:['Upcoming','An exceptionally long reminder that exceeds its clipping region','Another overflowing reminder row','Third oversized item'], empty:['No reminders','Nothing upcoming'] },
  weather: { normal:['Oslo','18°','Partly cloudy','12°','21°'], long:['Longyearbyen','-18°','Snow showers and strong wind','-24°','-12°'], extreme:['A very long location name','-123°','Exceptionally prolonged weather condition','-140°','123°'], empty:['Weather unavailable','','','',''] },
  countdown: { normal:['Summer holiday','42','days','30 June'], long:['Anniversary celebration','365','days','19 August 2027'], extreme:['An extremely long countdown event label','99999','days','31 December 2099'], empty:['No Countdown','No events yet','',''] },
} satisfies Record<ModuleName,Record<Preset,string[]>>
const modules: ModuleName[] = ['date','reminders','weather','countdown']

function line(ctx:CanvasRenderingContext2D,x1:number,y1:number,x2:number,y2:number) { ctx.beginPath();ctx.moveTo(x1+.5,y1+.5);ctx.lineTo(x2+.5,y2+.5);ctx.stroke() }
function centered(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,w:number,font:string) { ctx.font=font;ctx.textAlign='center';ctx.fillText(text,x+w/2,y) }
function clippedCentered(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,w:number,h=28) { ctx.save();ctx.beginPath();ctx.rect(x,y-h,w,h+4);ctx.clip();ctx.textAlign='center';ctx.fillText(text,x+w/2,y);ctx.restore() }
function metricHeight(font:string) { const match=font.match(/(\d+)px/); return match ? Number(match[1]) : 16 }

function drawCalendar(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,title=true) {
  const p=moduleProfiles.date.calendar, padX=p.padding[0],padY=p.padding[1],weekW=26
  ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();let top=y+padY
  if(title){ctx.font='bold 16px sans-serif';centered(ctx,'August',x,top+18,w,'bold 16px sans-serif');top+=p.titleHeight+p.titleGap}
  const gridX0=x+padX+weekW,gridW=Math.max(7,w-padX*2-weekW),cellW=Math.trunc(gridW/7),rows=5,cellH=Math.max(10,Math.trunc((y+h-padY-top-p.dowHeight)/rows))
  ctx.font='11px sans-serif';['Mo','Tu','We','Th','Fr','Sa','Su'].forEach((d,i)=>centered(ctx,d,gridX0+i*cellW,top+12,cellW,'11px sans-serif'))
  top+=p.dowHeight;line(ctx,gridX0-1,top+2,gridX0-1,top+rows*cellH-2)
  for(let day=1;day<=31;day++){const index=day+2,row=Math.trunc(index/7),col=index%7;centered(ctx,String(day),gridX0+col*cellW,top+row*cellH+Math.trunc(cellH/2)+4,cellW,'11px sans-serif')}
  ctx.restore()
}
function drawMediumStack(ctx:CanvasRenderingContext2D,c:PixelCell,parts:string[],kind:'date'|'countdown') {
  const profile=kind==='date'?moduleProfiles.date.medium:moduleProfiles.countdown.medium
  const fonts=kind==='date'?['14px sans-serif','bold 18px sans-serif','bold 42px sans-serif','bold 17px sans-serif']:['bold 17px sans-serif','bold 28px sans-serif','14px sans-serif','bold 16px sans-serif']
  const heights=fonts.map(metricHeight),gaps=profile.gaps,badgeH=heights[3]+profile.badgePadding[1]*2
  const total=heights[0]+gaps[0]+heights[1]+gaps[1]+heights[2]+gaps[2]+badgeH;let y=c.y+Math.trunc((c.h-total)/2)
  parts.forEach((part,i)=>{if(i===3){const badgeW=Math.min(c.w-profile.maxBadgeInset,Math.max(100,part.length*10+profile.badgePadding[0]*2));ctx.strokeRect(c.x+(c.w-badgeW)/2,y,badgeW,badgeH);centered(ctx,part,c.x+(c.w-badgeW)/2,y+profile.badgePadding[1]+heights[3],badgeW,fonts[3])}else{centered(ctx,part,c.x,y+heights[i],c.w,fonts[i]);y+=heights[i]+gaps[i]}})
}
function drawDate(ctx:CanvasRenderingContext2D,c:PixelCell,d:string[]) {
  if(c.size==='SMALL'){clippedCentered(ctx,`${d[0]} ${d[2]}. ${d[1]}`,c.x+8,c.y+c.h/2+9,c.w-16);return}
  if(c.size==='MEDIUM'){drawMediumStack(ctx,c,[d[3],d[1],d[2],d[0]],'date');return}
  const gap=moduleProfiles.date.large.columnGap,leftW=Math.trunc((c.w-gap)/2),rightX=c.x+leftW+gap
  if(c.size==='LARGE'){drawMediumStack(ctx,{...c,w:leftW},[d[3],d[1],d[2],d[0]],'date');const p=moduleProfiles.date.large.calendarPadding;drawCalendar(ctx,rightX+p,c.y+p,c.w-leftW-gap-p*2,c.h-p*2,false);return}
  const rowGap=moduleProfiles.date.xl.rowGap,topH=Math.trunc((c.h-rowGap)/2),bottomY=c.y+topH+rowGap,rightW=c.w-leftW-gap
  drawMediumStack(ctx,{...c,w:leftW,h:topH},[d[3],d[1],d[2],d[0]],'date');centered(ctx,'UPCOMING HOLIDAYS',c.x,bottomY+30,leftW,'bold 14px sans-serif');centered(ctx,'24.12  Christmas Eve',c.x,bottomY+65,leftW,'14px sans-serif')
  const mp=moduleProfiles.date.xl.monthPadding,rp=moduleProfiles.date.xl.rightPadding;drawCalendar(ctx,rightX,c.y+mp-9,rightW-rp,topH-mp+8,true);drawCalendar(ctx,rightX,bottomY,rightW-rp,c.y+c.h-bottomY-mp,true)
}
function drawReminderMedium(ctx:CanvasRenderingContext2D,c:PixelCell,d:string[],small:boolean) {
  const p=small?moduleProfiles.reminders.small:moduleProfiles.reminders.medium,visible=Math.min(d.length-1,p.maxItems),titleY=c.y+p.topPadding
  ctx.font='bold 17px sans-serif';const titleW=Math.min(c.w-20,d[0].length*10);centered(ctx,d[0],c.x,titleY+17,c.w,'bold 17px sans-serif');ctx.fillRect(c.x+(c.w-titleW)/2,titleY+20,titleW,p.underlineHeight)
  const contentTop=titleY+20+p.underlineHeight+p.contentGap,contentBottom=c.y+c.h-(small?moduleProfiles.reminders.small.contentBottom:12),contentH=contentBottom-contentTop
  if(small){for(let i=1;i<visible;i++)line(ctx,c.x+Math.trunc(c.w*i/visible),contentTop+8,c.x+Math.trunc(c.w*i/visible),contentBottom-8);for(let i=0;i<visible;i++){const x0=c.x+Math.trunc(c.w*i/visible),x1=c.x+Math.trunc(c.w*(i+1)/visible);clippedCentered(ctx,d[i+1],x0+8,contentTop+contentH/2+7,x1-x0-16)}}
  else for(let i=0;i<visible;i++)clippedCentered(ctx,`• ${d[i+1]}`,c.x+12,contentTop+24+i*30,c.w-24)
}
function drawReminders(ctx:CanvasRenderingContext2D,c:PixelCell,d:string[]) {
  if(c.size==='SMALL'){drawReminderMedium(ctx,c,d,true);return}if(c.size==='MEDIUM'){drawReminderMedium(ctx,c,d,false);return}
  const gap=moduleProfiles.reminders.large.columnGap,leftW=Math.trunc((c.w-gap)/2),rightX=c.x+leftW+gap
  if(c.size==='LARGE'){const p=moduleProfiles.reminders.large;drawReminderMedium(ctx,{...c,w:leftW},d,false);drawCalendar(ctx,rightX+p.calendarPadding,c.y+p.calendarPadding,c.w-leftW-gap-p.calendarPadding*2,c.h-p.calendarPadding*2,false);return}
  const p=moduleProfiles.reminders.xl
  const topH=Math.trunc((c.h-p.rowGap)/2),bottomY=c.y+topH+p.rowGap,rightW=c.w-leftW-gap;drawReminderMedium(ctx,{...c,w:leftW,h:topH},d,false);centered(ctx,'NEXT REMINDERS',c.x,bottomY+28,leftW,'bold 14px sans-serif');d.slice(1,4).forEach((v,i)=>clippedCentered(ctx,v,c.x+16,bottomY+58+i*27,leftW-32));drawCalendar(ctx,rightX,c.y+p.monthPadding-9,rightW-p.rightPadding,topH-p.monthPadding+8,true);drawCalendar(ctx,rightX,bottomY,rightW-p.rightPadding,c.y+c.h-bottomY-p.monthPadding,true)
}
function weatherColumn(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,label:string,d:string[]){centered(ctx,label,x,y+20,w,'bold 15px sans-serif');ctx.beginPath();ctx.arc(x+w/2,y+h*.44,Math.max(16,Math.min(w*.2,h*.16)),0,Math.PI*2);ctx.stroke();centered(ctx,`${d[3]} | ${d[4]}`,x,y+h-42,w,'bold 14px sans-serif');centered(ctx,'Wind 5 m/s',x,y+h-20,w,'12px sans-serif')}
function drawWeather(ctx:CanvasRenderingContext2D,c:PixelCell,d:string[]){
  if(c.size==='SMALL'){const p=moduleProfiles.weather.small,top=c.y+(c.h-58)/2;centered(ctx,d[0],c.x,top+16,c.w,'bold 17px sans-serif');ctx.fillRect(c.x+c.w/2-d[0].length*4,top+20,d[0].length*8,p.underlineHeight);centered(ctx,`${d[3]} to ${d[4]}  |  Wind up to 5 m/s  |  Mostly dry`,c.x,top+58,c.w,'bold 15px sans-serif');return}
  if(c.size==='MEDIUM'){centered(ctx,d[0],c.x,c.y+30,c.w,'bold 17px sans-serif');ctx.beginPath();ctx.arc(c.x+c.w/2,c.y+c.h*.48,Math.min(c.w,c.h)*.13,0,Math.PI*2);ctx.stroke();centered(ctx,`${d[3]}  |  ${d[4]}`,c.x,c.y+c.h-58,c.w,'bold 18px sans-serif');centered(ctx,'Wind 5 m/s · Mostly dry',c.x,c.y+c.h-25,c.w,'13px sans-serif');return}
  if(c.size==='LARGE'){const p=moduleProfiles.weather.large;centered(ctx,d[0],c.x,c.y+p.topPadding,c.w,'bold 17px sans-serif');const top=c.y+p.topPadding+30,w=Math.trunc(c.w/p.columns);for(let i=0;i<p.columns;i++){if(i)line(ctx,c.x+i*w,top+16,c.x+i*w,c.y+c.h-18);weatherColumn(ctx,c.x+i*w,top,w,c.y+c.h-top,['Today','Thu','Fri','Sat'][i],d)}return}
  const p=moduleProfiles.weather.xl,topH=Math.trunc(c.h/p.topRows),third=Math.trunc(c.w/p.topColumns);line(ctx,c.x,c.y+topH,c.x+c.w,c.y+topH);for(let i=1;i<3;i++)line(ctx,c.x+i*third,c.y+54,c.x+i*third,c.y+topH-26);weatherColumn(ctx,c.x,c.y,third,topH,'NOW',d);weatherColumn(ctx,c.x+third,c.y,third,topH,'TODAY',d);weatherColumn(ctx,c.x+third*2,c.y,c.w-third*2,topH,'DETAILS',d);for(let i=0;i<4;i++)weatherColumn(ctx,c.x+i*Math.trunc(c.w/4),c.y+topH,Math.trunc(c.w/4),c.h-topH,['Thu','Fri','Sat','Sun'][i],d)
}
function drawCountdown(ctx:CanvasRenderingContext2D,c:PixelCell,d:string[]){
  if(c.size==='SMALL'){clippedCentered(ctx,`${d[0]} in ${d[1]} ${d[2]}`,c.x+moduleProfiles.countdown.small.horizontalInset,c.y+c.h/2+7,c.w-moduleProfiles.countdown.small.horizontalInset*2);return}
  if(c.size==='MEDIUM'){drawMediumStack(ctx,c,d,'countdown');return}
  const p=c.size==='LARGE'?moduleProfiles.countdown.large:moduleProfiles.countdown.xl,gap=p.columnGap,leftW=Math.trunc((c.w-gap)/2),rightX=c.x+leftW+gap
  if(c.size==='LARGE'){drawMediumStack(ctx,{...c,w:leftW},d,'countdown');centered(ctx,'COMING UP',rightX,c.y+55,c.w-leftW-gap,'bold 14px sans-serif');for(let i=0;i<p.listRows;i++)clippedCentered(ctx,`• Event ${i+2} in ${i*14+60} days`,rightX+12,c.y+90+i*28,c.w-leftW-gap-24);return}
  const topH=Math.trunc((c.h-p.rowGap)/2),botY=c.y+topH+p.rowGap,rightW=c.w-leftW-gap;drawMediumStack(ctx,{...c,w:leftW,h:topH},d,'countdown');centered(ctx,'COMING UP',c.x,botY+30,leftW,'bold 14px sans-serif');for(let i=0;i<p.listRows;i++)clippedCentered(ctx,`• Event ${i+2}`,c.x+12,botY+60+i*26,leftW-24);drawCalendar(ctx,rightX,c.y,rightW,topH,true);drawCalendar(ctx,rightX,botY,rightW,c.y+c.h-botY,true)
}
function drawModule(ctx:CanvasRenderingContext2D,c:PixelCell,m:ModuleName,p:Preset,ink:string){const d=fake[m][p];ctx.save();ctx.beginPath();ctx.rect(c.x,c.y,c.w,c.h);ctx.clip();ctx.fillStyle=ink;ctx.strokeStyle=ink;ctx.lineWidth=1;if(m==='date')drawDate(ctx,c,d);if(m==='reminders')drawReminders(ctx,c,d);if(m==='weather')drawWeather(ctx,c,d);if(m==='countdown')drawCountdown(ctx,c,d);ctx.restore()}

export default function FrameSimulator(){
  const output=useRef<HTMLCanvasElement>(null),overlay=useRef<HTMLCanvasElement>(null)
  const [layout,setLayout]=useState<LayoutName>('default'),[dark,setDark]=useState(false),[preset,setPreset]=useState<Preset>('normal'),[test,setTest]=useState(false),[mod,setMod]=useState<ModuleName>('date'),[colSpan,setCS]=useState(4),[rowSpan,setRS]=useState(1),[col,setCol]=useState(0),[row,setRow]=useState(0)
  const [flags,setFlags]=useState({panel:true,viewport:true,grid:false,cells:true,slots:true,coords:true,content:false})
  const toggle=(k:keyof typeof flags)=>setFlags(v=>({...v,[k]:!v[k]}));let cells:PixelCell[]=[];let supported=true
  try{cells=test?[resolveGridCell({col:Math.min(col,4-colSpan),row:Math.min(row,4-rowSpan),colSpan,rowSpan,slot:0,size:colSpan===4&&rowSpan===1?'SMALL':colSpan===2&&rowSpan===2?'MEDIUM':colSpan===4&&rowSpan===2?'LARGE':'XL'})]:cellsForLayout(layout);supported=!test||isSupported(mod,colSpan,rowSpan)}catch{cells=[];supported=false}
  const cellKey=cells.map(c=>`${c.x},${c.y},${c.w},${c.h}`).join('|')
  useEffect(()=>{const ctx=output.current!.getContext('2d')!,ox=overlay.current!.getContext('2d')!,paper=dark?'#000':'#fff',ink=dark?'#fff':'#000';ctx.imageSmoothingEnabled=false;ctx.fillStyle=paper;ctx.fillRect(0,0,PANEL.width,PANEL.height);ctx.strokeStyle=ink;const assigned:ModuleName[]=test?[mod]:['date','reminders','weather','countdown'];if(!test)dividersForLayout(layout).forEach(d=>line(ctx,d.x1,d.y1,d.x2,d.y2));if(supported)cells.forEach((cell,i)=>drawModule(ctx,cell,assigned[i%assigned.length],preset,ink));else{ctx.fillStyle=ink;centered(ctx,'UNSUPPORTED — NEEDS NEW VARIANT',0,250,800,'bold 28px monospace')}quantizeOneBit(ctx,dark)
    ox.clearRect(0,0,800,480);ox.font='12px monospace';if(flags.panel){ox.strokeStyle='#ff3b3b';ox.strokeRect(.5,.5,799,479)}if(flags.viewport){ox.strokeStyle='#00a8ff';ox.strokeRect(VIEWPORT.x+.5,VIEWPORT.y+.5,VIEWPORT.width-1,VIEWPORT.height-1)}if(flags.grid){ox.strokeStyle='#ff00cc';for(let i=0;i<=4;i++){line(ox,gridX(i),VIEWPORT.y,gridX(i),VIEWPORT.y+VIEWPORT.height);line(ox,VIEWPORT.x,gridY(i),VIEWPORT.x+VIEWPORT.width,gridY(i))}}cells.forEach(cell=>{if(flags.cells){ox.strokeStyle='#00d26a';ox.strokeRect(cell.x+.5,cell.y+.5,cell.w-1,cell.h-1)}ox.fillStyle='#e6007a';if(flags.slots)ox.fillText(`S${cell.slot}`,cell.x+5,cell.y+14);if(flags.coords)ox.fillText(`${cell.x},${cell.y} ${cell.w}×${cell.h} [${cell.colSpan}×${cell.rowSpan}]`,cell.x+5,cell.y+29);if(flags.content){ox.strokeStyle='#ff8c00';ox.setLineDash([4,3]);ox.strokeRect(cell.x+12.5,cell.y+8.5,cell.w-25,cell.h-17);ox.setLineDash([])}})
  },[layout,dark,preset,test,mod,colSpan,rowSpan,col,row,flags,supported,cellKey])
  return <main className={styles.shell}><h1 className={styles.title}>800×480 e-paper frame simulator</h1><p className={styles.note}>Production structural calculations are mirrored; browser glyph metrics remain approximate. Final output is thresholded to paper/ink after rendering.</p><div className={styles.controls}><label>Mode <select value={test?'test':'layout'} onChange={e=>setTest(e.target.value==='test')}><option value="layout">Production layouts</option><option value="test">Module geometry test</option></select></label>{!test?<label>Layout <select value={layout} onChange={e=>setLayout(e.target.value as LayoutName)}>{Object.keys(frameLayouts.layouts).map(x=><option key={x}>{x}</option>)}</select></label>:<span className={styles.section}><label>Module <select value={mod} onChange={e=>setMod(e.target.value as ModuleName)}>{modules.map(x=><option key={x}>{x}</option>)}</select></label>{(['colSpan','rowSpan'] as const).map(key=><label key={key}>{key}<input type="number" min="1" max="4" value={key==='colSpan'?colSpan:rowSpan} onChange={e=>(key==='colSpan'?setCS:setRS)(+e.target.value)}/></label>)}<label>col <input type="number" min="0" max="3" value={col} onChange={e=>setCol(+e.target.value)}/></label><label>row <input type="number" min="0" max="3" value={row} onChange={e=>setRow(+e.target.value)}/></label></span>}<label>Preset <select value={preset} onChange={e=>setPreset(e.target.value as Preset)}>{['normal','long','extreme','empty'].map(x=><option key={x}>{x}</option>)}</select></label><label><input type="checkbox" checked={dark} onChange={e=>setDark(e.target.checked)}/>dark frame</label>{Object.entries(flags).map(([k,v])=><label key={k}><input type="checkbox" checked={v} onChange={()=>toggle(k as keyof typeof flags)}/>{k}</label>)}</div>{test&&!supported&&<p className={styles.warning}>UNSUPPORTED — NEEDS NEW VARIANT. The renderer is not scaled or redesigned.</p>}<div className={styles.stage}><canvas ref={output} className={styles.canvas} width="800" height="480" aria-label="Static one-bit e-paper output"/><canvas ref={overlay} className={styles.overlay} width="800" height="480" aria-label="Developer geometry overlays"/></div><p className={styles.legend}>Overlay colors: red panel · blue viewport · magenta grid · green cells · orange content bounds. Disable overlays for final static output.</p></main>
}
