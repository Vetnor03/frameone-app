'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import styles from './FrameSimulator.module.css'
import {
  PANEL, VIEWPORT, calendarGeometry, cellsForLayout, dividersForLayout, gridX, gridY, isoWeekNumber,
  frameModuleRegistry, moduleProfiles, quantizeOneBit, resolveGridCell,
  type CalendarRowMode, type GridCell, type LayoutName, type ModuleName, type PixelCell,
} from '../lib/frameSimulator'
import { createHistory, previewStroke, pushHistory, redoHistory, undoHistory, type EditorCell, type EditorHistory, type Point, type StrokePreview } from '../lib/frameLayoutEditor.mjs'

type Preset = 'normal' | 'long' | 'extreme' | 'empty'
const fake = {
  date: { normal:['Wednesday','August','19','2026'], long:['torsdag','desember','31','2026'], extreme:['Wednesday','September','30','2099'], empty:['Date unavailable','','',''] },
  reminders: { normal:['Today','Dentist · 14:30','Buy coffee','Call Mum'], long:['Tomorrow','Renew the family travel insurance','Call the electrical contractor','Pick up prescriptions'], extreme:['Upcoming','An exceptionally long reminder that exceeds its clipping region','Another overflowing reminder row','Third oversized item'], empty:['No reminders','Nothing upcoming'] },
  weather: { normal:['Oslo','18°','Partly cloudy','12°','21°'], long:['Longyearbyen','-18°','Snow showers and strong wind','-24°','-12°'], extreme:['A very long location name','-123°','Exceptionally prolonged weather condition','-140°','123°'], empty:['Weather unavailable','','','',''] },
  countdown: { normal:['Summer holiday','42','days','30 June'], long:['Anniversary celebration','365','days','19 August 2027'], extreme:['An extremely long countdown event label','99999','days','31 December 2099'], empty:['No Countdown','No events yet','',''] },
  surf: { normal:["Hoddevik",'4/6','1.2–1.8 m','12 s'], long:["Today’s Best: Unstad",'5/6','2.0–3.5 m','15 s'], extreme:['An exceptionally long surf spot','6/6','8.0–12.0 m','22 s'], empty:['No surf forecast','--','--','--'] },
  soccer: { normal:['Arsenal vs Liverpool','Sun 16:30','Position: 1','Points: 68'], long:['Manchester United vs Wolverhampton','Wednesday 20:45','Position: 12','Points: 42'], extreme:['Borussia Mönchengladbach vs Paris Saint-Germain','Saturday 23:59','Position: 99','Points: 999'], empty:['No fixtures','--','Position: --','Points: --'] },
  stocks: { normal:['FRAME','124.50','+2.4%','Month'], long:['Berkshire Hathaway Class B','512.18','-0.42%','Year'], extreme:['AN-EXCEPTIONALLY-LONG-SYMBOL','999999','+999.99%','Max'], empty:['No stock','--','--','Day'] },
  groceries: { normal:['Groceries','Milk','Bread','Apples'], long:['Family shopping list','Extra virgin olive oil','Wholegrain sourdough bread','Laundry detergent'], extreme:['An exceptionally long grocery heading','A grocery item whose label must clip','Another extremely verbose item','One more oversized item'], empty:['All set','Nothing to buy','',''] },
} satisfies Record<ModuleName,Record<Preset,string[]>>
const calendarPreset: Record<Preset,{year:number;month0:number}> = {
  normal:{year:2026,month0:7}, long:{year:2026,month0:11},
  extreme:{year:2099,month0:8}, empty:{year:2026,month0:7},
}
const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December']
type CalendarDisplay = { showMonthTitle:boolean; showWeekNums:boolean; showDowHeader:boolean }

function line(ctx:CanvasRenderingContext2D,x1:number,y1:number,x2:number,y2:number) { ctx.beginPath();ctx.moveTo(x1+.5,y1+.5);ctx.lineTo(x2+.5,y2+.5);ctx.stroke() }
function centered(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,w:number,font:string) { ctx.font=font;ctx.textAlign='center';ctx.fillText(text,x+w/2,y) }
function clippedCentered(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,w:number,h=28) { ctx.save();ctx.beginPath();ctx.rect(x,y-h,w,h+4);ctx.clip();ctx.textAlign='center';ctx.fillText(text,x+w/2,y);ctx.restore() }
function metricHeight(font:string) { const match=font.match(/(\d+)px/); return match ? Number(match[1]) : 16 }

function drawCalendar(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,year:number,month0:number,mode:CalendarRowMode,display:CalendarDisplay) {
  const p=moduleProfiles.date.calendar,padX=p.padding[0],padY=p.padding[1],weekW=display.showWeekNums?p.weekWidth:0,titleH=display.showMonthTitle?p.titleHeight:0,titleGap=display.showMonthTitle?p.titleGap:0,dowH=display.showDowHeader?p.dowHeight:0
  ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();let top=y+padY
  if(display.showMonthTitle){ctx.font='bold 16px sans-serif';centered(ctx,monthNames[month0],x,top+18,w,'bold 16px sans-serif');top+=titleH+titleGap}
  const {firstWeekday,dayCount,rows}=calendarGeometry(year,month0,mode)
  const gridX0=x+padX+weekW,gridW=Math.max(7,w-padX*2-weekW),cellW=Math.trunc(gridW/7),cellH=Math.max(10,Math.trunc((h-padY*2-titleH-titleGap-dowH)/rows))
  if(display.showDowHeader){ctx.font='11px sans-serif';['Mo','Tu','We','Th','Fr','Sa','Su'].forEach((d,i)=>centered(ctx,d,gridX0+i*cellW,top+12,cellW,'11px sans-serif'));top+=dowH}
  if(display.showWeekNums){line(ctx,gridX0-1,top+2,gridX0-1,top+rows*cellH-2);for(let row=0;row<rows;row++){const firstDay=row*7-firstWeekday+1,lastDay=firstDay+6;if(lastDay<1||firstDay>dayCount)continue;const sampleDay=Math.max(1,Math.min(dayCount,firstDay));centered(ctx,String(isoWeekNumber(year,month0,sampleDay)),x+padX,top+row*cellH+Math.trunc(cellH/2)+4,weekW,'11px sans-serif')}}
  for(let day=1;day<=dayCount;day++){const index=firstWeekday+day-1,row=Math.trunc(index/7),col=index%7;if(row>=rows)continue;centered(ctx,String(day),gridX0+col*cellW,top+row*cellH+Math.trunc(cellH/2)+4,cellW,'11px sans-serif')}
  ctx.restore()
}
function drawMediumStack(ctx:CanvasRenderingContext2D,c:PixelCell,parts:string[],kind:'date'|'countdown') {
  const profile=kind==='date'?moduleProfiles.date.medium:moduleProfiles.countdown.medium
  const fonts=kind==='date'?['14px sans-serif','bold 18px sans-serif','bold 42px sans-serif','bold 17px sans-serif']:['bold 17px sans-serif','bold 28px sans-serif','14px sans-serif','bold 16px sans-serif']
  const heights=fonts.map(metricHeight),gaps=profile.gaps,badgeH=heights[3]+profile.badgePadding[1]*2
  const total=heights[0]+gaps[0]+heights[1]+gaps[1]+heights[2]+gaps[2]+badgeH;let y=c.y+Math.trunc((c.h-total)/2)
  parts.forEach((part,i)=>{if(i===3){const badgeW=Math.min(c.w-profile.maxBadgeInset,Math.max(100,part.length*10+profile.badgePadding[0]*2));ctx.strokeRect(c.x+(c.w-badgeW)/2,y,badgeW,badgeH);centered(ctx,part,c.x+(c.w-badgeW)/2,y+profile.badgePadding[1]+heights[3],badgeW,fonts[3])}else{centered(ctx,part,c.x,y+heights[i],c.w,fonts[i]);y+=heights[i]+gaps[i]}})
}
function drawDate(ctx:CanvasRenderingContext2D,c:PixelCell,d:string[],preset:Preset) {
  const {year,month0}=calendarPreset[preset],nextMonth0=(month0+1)%12,nextYear=month0===11?year+1:year
  if(c.size==='SMALL'){clippedCentered(ctx,`${d[0]} ${d[2]}. ${d[1]}`,c.x+8,c.y+c.h/2+9,c.w-16);return}
  if(c.size==='MEDIUM'){drawMediumStack(ctx,c,[d[3],d[1],d[2],d[0]],'date');return}
  const gap=moduleProfiles.date.large.columnGap,leftW=Math.trunc((c.w-gap)/2),rightX=c.x+leftW+gap
  if(c.size==='LARGE'){drawMediumStack(ctx,{...c,w:leftW},[d[3],d[1],d[2],d[0]],'date');const p=moduleProfiles.date.large.calendarPadding;drawCalendar(ctx,rightX+p,c.y+p,c.w-leftW-gap-p*2,c.h-p*2,year,month0,'dateLarge',{showMonthTitle:false,showWeekNums:true,showDowHeader:true});return}
  const rowGap=moduleProfiles.date.xl.rowGap,topH=Math.trunc((c.h-rowGap)/2),bottomY=c.y+topH+rowGap,rightW=c.w-leftW-gap
  drawMediumStack(ctx,{...c,w:leftW,h:topH},[d[3],d[1],d[2],d[0]],'date');centered(ctx,'UPCOMING HOLIDAYS',c.x,bottomY+30,leftW,'bold 14px sans-serif');centered(ctx,'24.12  Christmas Eve',c.x,bottomY+65,leftW,'14px sans-serif')
  const mp=moduleProfiles.date.xl.monthPadding,rp=moduleProfiles.date.xl.rightPadding;drawCalendar(ctx,rightX,c.y+mp-9,rightW-rp,topH-mp+8,year,month0,'date',{showMonthTitle:true,showWeekNums:true,showDowHeader:true});drawCalendar(ctx,rightX,bottomY,rightW-rp,c.y+c.h-bottomY-mp,nextYear,nextMonth0,'date',{showMonthTitle:true,showWeekNums:true,showDowHeader:false})
}
function drawReminderMedium(ctx:CanvasRenderingContext2D,c:PixelCell,d:string[],small:boolean) {
  const p=small?moduleProfiles.reminders.small:moduleProfiles.reminders.medium,visible=Math.min(d.length-1,p.maxItems),titleY=c.y+p.topPadding
  ctx.font='bold 17px sans-serif';const titleW=Math.min(c.w-20,d[0].length*10);centered(ctx,d[0],c.x,titleY+17,c.w,'bold 17px sans-serif');ctx.fillRect(c.x+(c.w-titleW)/2,titleY+20,titleW,p.underlineHeight)
  const contentTop=titleY+20+p.underlineHeight+p.contentGap,contentBottom=c.y+c.h-(small?moduleProfiles.reminders.small.contentBottom:12),contentH=contentBottom-contentTop
  if(small){for(let i=1;i<visible;i++)line(ctx,c.x+Math.trunc(c.w*i/visible),contentTop+8,c.x+Math.trunc(c.w*i/visible),contentBottom-8);for(let i=0;i<visible;i++){const x0=c.x+Math.trunc(c.w*i/visible),x1=c.x+Math.trunc(c.w*(i+1)/visible);clippedCentered(ctx,d[i+1],x0+8,contentTop+contentH/2+7,x1-x0-16)}}
  else for(let i=0;i<visible;i++)clippedCentered(ctx,`• ${d[i+1]}`,c.x+12,contentTop+24+i*30,c.w-24)
}
function drawReminders(ctx:CanvasRenderingContext2D,c:PixelCell,d:string[],preset:Preset) {
  const {year,month0}=calendarPreset[preset],nextMonth0=(month0+1)%12,nextYear=month0===11?year+1:year
  if(c.size==='SMALL'){drawReminderMedium(ctx,c,d,true);return}if(c.size==='MEDIUM'){drawReminderMedium(ctx,c,d,false);return}
  const gap=moduleProfiles.reminders.large.columnGap,leftW=Math.trunc((c.w-gap)/2),rightX=c.x+leftW+gap
  if(c.size==='LARGE'){const p=moduleProfiles.reminders.large;drawReminderMedium(ctx,{...c,w:leftW},d,false);drawCalendar(ctx,rightX+p.calendarPadding,c.y+p.calendarPadding,c.w-leftW-gap-p.calendarPadding*2,c.h-p.calendarPadding*2,year,month0,'remindersLarge',{showMonthTitle:false,showWeekNums:true,showDowHeader:true});return}
  const p=moduleProfiles.reminders.xl
  const topH=Math.trunc((c.h-p.rowGap)/2),bottomY=c.y+topH+p.rowGap,rightW=c.w-leftW-gap;drawReminderMedium(ctx,{...c,w:leftW,h:topH},d,false);centered(ctx,'NEXT REMINDERS',c.x,bottomY+28,leftW,'bold 14px sans-serif');d.slice(1,4).forEach((v,i)=>clippedCentered(ctx,v,c.x+16,bottomY+58+i*27,leftW-32));drawCalendar(ctx,rightX,c.y+p.monthPadding-9,rightW-p.rightPadding,topH-p.monthPadding+8,year,month0,'remindersXL',{showMonthTitle:true,showWeekNums:true,showDowHeader:true});drawCalendar(ctx,rightX,bottomY,rightW-p.rightPadding,c.y+c.h-bottomY-p.monthPadding,nextYear,nextMonth0,'remindersXL',{showMonthTitle:true,showWeekNums:true,showDowHeader:false})
}
function weatherColumn(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,label:string,d:string[]){centered(ctx,label,x,y+20,w,'bold 15px sans-serif');ctx.beginPath();ctx.arc(x+w/2,y+h*.44,Math.max(16,Math.min(w*.2,h*.16)),0,Math.PI*2);ctx.stroke();centered(ctx,`${d[3]} | ${d[4]}`,x,y+h-42,w,'bold 14px sans-serif');centered(ctx,'Wind 5 m/s',x,y+h-20,w,'12px sans-serif')}
function drawWeather(ctx:CanvasRenderingContext2D,c:PixelCell,d:string[]){
  if(c.size==='SMALL'){const p=moduleProfiles.weather.small,top=c.y+(c.h-58)/2;centered(ctx,d[0],c.x,top+16,c.w,'bold 17px sans-serif');ctx.fillRect(c.x+c.w/2-d[0].length*4,top+20,d[0].length*8,p.underlineHeight);centered(ctx,`${d[3]} to ${d[4]}  |  Wind up to 5 m/s  |  Mostly dry`,c.x,top+58,c.w,'bold 15px sans-serif');return}
  if(c.size==='MEDIUM'){centered(ctx,d[0],c.x,c.y+30,c.w,'bold 17px sans-serif');ctx.beginPath();ctx.arc(c.x+c.w/2,c.y+c.h*.48,Math.min(c.w,c.h)*.13,0,Math.PI*2);ctx.stroke();centered(ctx,`${d[3]}  |  ${d[4]}`,c.x,c.y+c.h-58,c.w,'bold 18px sans-serif');centered(ctx,'Wind 5 m/s · Mostly dry',c.x,c.y+c.h-25,c.w,'13px sans-serif');return}
  if(c.size==='LARGE'){const p=moduleProfiles.weather.large;centered(ctx,d[0],c.x,c.y+p.topPadding,c.w,'bold 17px sans-serif');const top=c.y+p.topPadding+30,w=Math.trunc(c.w/p.columns);for(let i=0;i<p.columns;i++){if(i)line(ctx,c.x+i*w,top+16,c.x+i*w,c.y+c.h-18);weatherColumn(ctx,c.x+i*w,top,w,c.y+c.h-top,['Today','Thu','Fri','Sat'][i],d)}return}
  const p=moduleProfiles.weather.xl,topH=Math.trunc(c.h/p.topRows),third=Math.trunc(c.w/p.topColumns);line(ctx,c.x,c.y+topH,c.x+c.w,c.y+topH);for(let i=1;i<3;i++)line(ctx,c.x+i*third,c.y+54,c.x+i*third,c.y+topH-26);weatherColumn(ctx,c.x,c.y,third,topH,'NOW',d);weatherColumn(ctx,c.x+third,c.y,third,topH,'TODAY',d);weatherColumn(ctx,c.x+third*2,c.y,c.w-third*2,topH,'DETAILS',d);for(let i=0;i<4;i++)weatherColumn(ctx,c.x+i*Math.trunc(c.w/4),c.y+topH,Math.trunc(c.w/4),c.h-topH,['Thu','Fri','Sat','Sun'][i],d)
}
function drawCountdown(ctx:CanvasRenderingContext2D,c:PixelCell,d:string[],preset:Preset){
  const {year,month0}=calendarPreset[preset],nextMonth0=(month0+1)%12,nextYear=month0===11?year+1:year
  if(c.size==='SMALL'){clippedCentered(ctx,`${d[0]} in ${d[1]} ${d[2]}`,c.x+moduleProfiles.countdown.small.horizontalInset,c.y+c.h/2+7,c.w-moduleProfiles.countdown.small.horizontalInset*2);return}
  if(c.size==='MEDIUM'){drawMediumStack(ctx,c,d,'countdown');return}
  const p=c.size==='LARGE'?moduleProfiles.countdown.large:moduleProfiles.countdown.xl,gap=p.columnGap,leftW=Math.trunc((c.w-gap)/2),rightX=c.x+leftW+gap
  if(c.size==='LARGE'){drawMediumStack(ctx,{...c,w:leftW},d,'countdown');centered(ctx,'COMING UP',rightX,c.y+55,c.w-leftW-gap,'bold 14px sans-serif');for(let i=0;i<p.listRows;i++)clippedCentered(ctx,`• Event ${i+2} in ${i*14+60} days`,rightX+12,c.y+90+i*28,c.w-leftW-gap-24);return}
  const topH=Math.trunc((c.h-p.rowGap)/2),botY=c.y+topH+p.rowGap,rightW=c.w-leftW-gap;drawMediumStack(ctx,{...c,w:leftW,h:topH},d,'countdown');centered(ctx,'COMING UP',c.x,botY+30,leftW,'bold 14px sans-serif');for(let i=0;i<p.listRows;i++)clippedCentered(ctx,`• Event ${i+2}`,c.x+12,botY+60+i*26,leftW-24);drawCalendar(ctx,rightX,c.y,rightW,topH,year,month0,'countdown',{showMonthTitle:true,showWeekNums:false,showDowHeader:true});drawCalendar(ctx,rightX,botY,rightW,c.y+c.h-botY,nextYear,nextMonth0,'countdown',{showMonthTitle:true,showWeekNums:false,showDowHeader:false})
}
function drawSparkline(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number){const points=[.72,.55,.62,.3,.45,.18,.26,.08];ctx.beginPath();points.forEach((v,i)=>{const px=x+i*w/(points.length-1),py=y+v*h;i?ctx.lineTo(px,py):ctx.moveTo(px,py)});ctx.stroke()}
function drawNewModule(ctx:CanvasRenderingContext2D,c:PixelCell,d:string[],kind:'surf'|'soccer'|'stocks'|'groceries'){
  const pad=kind==='stocks'?14:12
  if(c.size==='SMALL'){
    centered(ctx,d[0],c.x,c.y+34,c.w,'bold 17px sans-serif');ctx.fillRect(c.x+c.w*.35,c.y+39,c.w*.3,2)
    const values=kind==='groceries'?d.slice(1,4):d.slice(1,4);values.forEach((v,i)=>{if(i)line(ctx,c.x+c.w*(i+1)/3,c.y+55,c.x+c.w*(i+1)/3,c.y+c.h-12);clippedCentered(ctx,v,c.x+c.w*i/3+5,c.y+c.h-24,c.w/3-10)})
    return
  }
  centered(ctx,d[0],c.x,c.y+pad+18,c.w,'bold 17px sans-serif');ctx.fillRect(c.x+c.w*.3,c.y+pad+23,c.w*.4,2)
  if(kind==='stocks'){drawSparkline(ctx,c.x+24,c.y+62,c.w-48,Math.max(36,c.h-112));centered(ctx,`${d[1]}   ${d[2]}`,c.x,c.y+c.h-20,c.w,'bold 15px sans-serif')}
  else if(kind==='groceries'){const rows=c.size==='MEDIUM'?4:7;for(let i=0;i<rows;i++){const y=c.y+65+i*26;ctx.strokeRect(c.x+24,y-11,10,10);clippedCentered(ctx,d[1+i%3]||'Grocery item',c.x+42,y,c.w-62)}}
  else if(kind==='soccer'){centered(ctx,d[1],c.x,c.y+72,c.w,'14px sans-serif');centered(ctx,'2  –  1',c.x,c.y+118,c.w,'bold 28px sans-serif');centered(ctx,`${d[2]}     ${d[3]}`,c.x,c.y+c.h-24,c.w,'14px sans-serif')}
  else {centered(ctx,d[1],c.x,c.y+92,c.w,'bold 34px sans-serif');centered(ctx,`${d[2]}  ·  ${d[3]} period`,c.x,c.y+132,c.w,'bold 15px sans-serif');const columns=c.size==='MEDIUM'?2:4;for(let i=0;i<columns;i++){if(i)line(ctx,c.x+i*c.w/columns,c.y+154,c.x+i*c.w/columns,c.y+c.h-15);centered(ctx,['Morning','Noon','Evening','Tomorrow'][i],c.x+i*c.w/columns,c.y+177,c.w/columns,'12px sans-serif')}}
  if(c.size==='LARGE'||c.size==='XL'){const split=c.size==='XL'?c.y+c.h/2:c.x+c.w/2;if(c.size==='XL')line(ctx,c.x+20,split,c.x+c.w-20,split);else line(ctx,split,c.y+55,split,c.y+c.h-18)}
}
function drawModule(ctx:CanvasRenderingContext2D,c:PixelCell,m:ModuleName,p:Preset,ink:string){const d=fake[m][p];ctx.save();ctx.beginPath();ctx.rect(c.x,c.y,c.w,c.h);ctx.clip();ctx.fillStyle=ink;ctx.strokeStyle=ink;ctx.lineWidth=1;if(m==='date')drawDate(ctx,c,d,p);if(m==='reminders')drawReminders(ctx,c,d,p);if(m==='weather')drawWeather(ctx,c,d);if(m==='countdown')drawCountdown(ctx,c,d,p);if(m==='surf'||m==='soccer'||m==='stocks'||m==='groceries')drawNewModule(ctx,c,d,m);ctx.restore()}

const geometrySize=(cell:Pick<EditorCell,'colSpan'|'rowSpan'>):PixelCell['size']|null=>cell.colSpan===4&&cell.rowSpan===1?'SMALL':cell.colSpan===2&&cell.rowSpan===2?'MEDIUM':cell.colSpan===4&&cell.rowSpan===2?'LARGE':cell.colSpan===4&&cell.rowSpan===4?'XL':null
const editorPixelCell=(cell:EditorCell,slot:number):PixelCell=>resolveGridCell({...cell,slot,size:geometrySize(cell)??'XL'} as GridCell)
const productionAssignments:Record<LayoutName,ModuleName[]>={full:['date'],default:['date','reminders','weather'],pyramid:['date','reminders','weather','countdown'],square:['date','reminders','weather','countdown']}

export default function FrameSimulator(){
  const output=useRef<HTMLCanvasElement>(null),overlay=useRef<HTMLCanvasElement>(null),drag=useRef<{id:number;start:Point}|null>(null)
  const [layout,setLayout]=useState<LayoutName|'custom'>('default'),[dark,setDark]=useState(false),[preset,setPreset]=useState<Preset>('normal'),[debug,setDebug]=useState(false)
  const [history,setHistory]=useState<EditorHistory>(()=>createHistory()),[stroke,setStroke]=useState<{start:Point;end:Point}|null>(null),[selected,setSelected]=useState<string|null>(null),[feedback,setFeedback]=useState('')
  const custom=history.present
  const preview=useMemo<StrokePreview|null>(()=>stroke&&layout==='custom'?previewStroke(custom,stroke):null,[stroke,custom,layout])
  const displayCells=layout==='custom'?(preview?.valid?preview.cells:custom):[]
  const pointer=(e:React.PointerEvent<HTMLDivElement>):Point=>{const r=e.currentTarget.getBoundingClientRect();return{x:(e.clientX-r.left)*VIEWPORT.width/r.width,y:(e.clientY-r.top)*VIEWPORT.height/r.height}}
  const selectAt=(point:Point)=>{const logical={x:point.x/VIEWPORT.width*4,y:point.y/VIEWPORT.height*4};const cell=custom.find(c=>logical.x>=c.col&&logical.x<=c.col+c.colSpan&&logical.y>=c.row&&logical.y<=c.row+c.rowSpan);setSelected(cell?.id??null)}
  const onDown=(e:React.PointerEvent<HTMLDivElement>)=>{if(layout!=='custom')return;e.currentTarget.setPointerCapture(e.pointerId);const start=pointer(e);drag.current={id:e.pointerId,start};setStroke({start,end:start});setFeedback('')}
  const onMove=(e:React.PointerEvent<HTMLDivElement>)=>{if(drag.current?.id===e.pointerId)setStroke({start:drag.current.start,end:pointer(e)})}
  const onUp=(e:React.PointerEvent<HTMLDivElement>)=>{if(drag.current?.id!==e.pointerId)return;const end=pointer(e),length=Math.hypot(end.x-drag.current.start.x,end.y-drag.current.start.y);if(length<8)selectAt(end);else if(preview?.valid){setHistory(h=>pushHistory(h,preview.cells));setSelected(preview.intendedId??null)}else setFeedback(preview?.reason??'Try drawing a longer line');drag.current=null;setStroke(null)}
  const choose=(moduleId:ModuleName|'empty')=>{if(!selected)return;setHistory(h=>pushHistory(h,h.present.map(c=>c.id===selected?{...c,moduleId}:c)));setSelected(null)}
  const reset=()=>{setHistory(createHistory());setSelected(null);setFeedback('')}
  const beginCustom=()=>{setLayout('custom');reset()}
  const editCopy=()=>{if(layout==='custom')return;const cells=cellsForLayout(layout).map((c,i)=>({id:`copy-${layout}-${i}`,col:c.col,row:c.row,colSpan:c.colSpan,rowSpan:c.rowSpan,moduleId:productionAssignments[layout][i]??'empty'} as EditorCell));setHistory(createHistory(cells));setLayout('custom')}
  useEffect(()=>{const ctx=output.current!.getContext('2d')!,ox=overlay.current!.getContext('2d')!,paper=dark?'#000':'#fff',ink=dark?'#fff':'#000';ctx.imageSmoothingEnabled=false;ctx.fillStyle=paper;ctx.fillRect(0,0,PANEL.width,PANEL.height);ctx.strokeStyle=ink
    if(layout==='custom'){displayCells.forEach((cell,i)=>{const px=editorPixelCell(cell,i),size=geometrySize(cell);if(cell.moduleId!=='empty'){if(size)drawModule(ctx,px,cell.moduleId,preset,ink);else{ctx.fillStyle=ink;centered(ctx,'UNSUPPORTED — NEEDS NEW VARIANT',px.x,px.y+px.h/2,px.w,'bold 18px monospace')}}});const committed=displayCells.map((c,i)=>editorPixelCell(c,i));committed.forEach(c=>ctx.strokeRect(c.x+.5,c.y+.5,c.w-1,c.h-1))}
    else{const cells=cellsForLayout(layout);dividersForLayout(layout).forEach(d=>line(ctx,d.x1,d.y1,d.x2,d.y2));cells.forEach((cell,i)=>drawModule(ctx,cell,productionAssignments[layout][i]??'date',preset,ink))}
    quantizeOneBit(ctx,dark);ox.clearRect(0,0,PANEL.width,PANEL.height)
    if(debug){ox.strokeStyle='#b14cff';for(let i=0;i<=4;i++){line(ox,gridX(i),VIEWPORT.y,gridX(i),VIEWPORT.y+VIEWPORT.height);line(ox,VIEWPORT.x,gridY(i),VIEWPORT.x+VIEWPORT.width,gridY(i))}const cells=layout==='custom'?displayCells.map((c,i)=>editorPixelCell(c,i)):cellsForLayout(layout);ox.font='12px monospace';cells.forEach((c,i)=>{ox.fillStyle='#8a2be2';ox.fillText(`${i} ${c.col},${c.row} ${c.colSpan}×${c.rowSpan} ${c.size}`,c.x+6,c.y+16)})}
    if(layout==='custom'){displayCells.forEach((cell,i)=>{const c=editorPixelCell(cell,i);if(cell.id===selected){ox.strokeStyle='#1687ff';ox.lineWidth=3;ox.strokeRect(c.x+2,c.y+2,c.w-4,c.h-4);ox.lineWidth=1}});if(preview?.valid&&preview.normalized){const n=preview.normalized;ox.fillStyle='rgba(40,160,255,.12)';displayCells.forEach((cell,i)=>{const c=editorPixelCell(cell,i);ox.fillRect(c.x+2,c.y+2,c.w-4,c.h-4)});const intended=displayCells.find(c=>c.id===preview.intendedId);if(intended){const c=editorPixelCell(intended,0);ox.fillStyle='rgba(0,190,120,.22)';ox.fillRect(c.x,c.y,c.w,c.h)}ox.strokeStyle='#087bea';ox.lineWidth=3;if(n.orientation==='vertical')line(ox,gridX(n.boundary),gridY(n.rangeStart),gridX(n.boundary),gridY(n.rangeEnd));else line(ox,gridX(n.rangeStart),gridY(n.boundary),gridX(n.rangeEnd),gridY(n.boundary));ox.lineWidth=1}}
  },[layout,dark,preset,debug,displayCells,selected,preview])
  return <main className={styles.shell}><header className={styles.header}><div><h1 className={styles.title}>Frame layout studio</h1><p className={styles.note}>Draw a line, then choose what belongs in each rectangle.</p></div><div className={styles.controls}><label>Layout <select value={layout} onChange={e=>setLayout(e.target.value as LayoutName|'custom')}><option value="full">Full</option><option value="default">Default</option><option value="pyramid">Pyramid</option><option value="square">Square</option>{layout==='custom'&&<option value="custom">Custom</option>}</select></label><button onClick={beginCustom}>New layout</button>{layout!=='custom'&&<button onClick={editCopy}>Edit copy</button>}<button onClick={reset} disabled={layout!=='custom'}>Reset</button><button onClick={()=>setHistory(undoHistory)} disabled={layout!=='custom'||!history.past.length}>Undo</button><button onClick={()=>setHistory(redoHistory)} disabled={layout!=='custom'||!history.future.length}>Redo</button><span className={styles.group}>Theme <button className={dark?'':styles.active} onClick={()=>setDark(false)}>Light</button><button className={dark?styles.active:''} onClick={()=>setDark(true)}>Dark</button></span><label>Preset <select value={preset} onChange={e=>setPreset(e.target.value as Preset)}>{['normal','long','extreme','empty'].map(x=><option key={x}>{x[0].toUpperCase()+x.slice(1)}</option>)}</select></label><label className={styles.toggle}><input type="checkbox" checked={debug} onChange={e=>setDebug(e.target.checked)}/> Debug</label></div></header><div className={styles.workspace}><div className={styles.stage} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={()=>{drag.current=null;setStroke(null)}}><canvas ref={output} className={styles.canvas} width="800" height="480" aria-label="One-bit e-paper viewport preview"/><canvas ref={overlay} className={styles.overlay} width="800" height="480" aria-label="Layout editor overlays"/>{layout==='custom'&&<div className={styles.hint}>Draw to divide · tap a cell to choose content</div>}</div>{feedback&&<p className={styles.feedback}>{feedback}</p>}{selected&&layout==='custom'&&<aside className={styles.picker}><strong>Choose content</strong><div>{frameModuleRegistry.map(module=><button key={module.id} onClick={()=>choose(module.id)}>{module.label}</button>)}<button onClick={()=>choose('empty')}>Empty / clear</button></div></aside>}</div>{debug&&<p className={styles.debug}>Viewport 785×458 · production origin (9, 22) · generated slots are ordered top-to-bottom, then left-to-right.</p>}</main>
}
