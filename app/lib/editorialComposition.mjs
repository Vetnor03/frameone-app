import {editorialPlan, editorialContentBudget, editorialModuleKind} from './editorialFrameLayout.mjs'

export const EDITORIAL_MODULES = Object.freeze([
  'date','reminders','weather','news','surf','ski','countdown',
  'soccer','stocks','groceries','assistant',
])

export const EDITORIAL_SAMPLES = Object.freeze({
  date: {heading:'',primary:'21',detail:'Wednesday',extras:[]},
  reminders: {heading:'Reminders',primary:'Kontrolltime Aleris',detail:'Friday · 12:30',
    extras:['18:00 · Passe søsken','Saturday · Pick up parcel']},
  weather: {heading:'Weather',primary:'12°',detail:'Cloudy with sunny spells',
    extras:['Wind NW · 4 m/s','Low 9° · High 13°','A brighter weekend ahead']},
  news: {heading:'Siste nytt',primary:'Aker BP-lederforeningen innkaller til ekstraordinært møte',
    detail:'Top stories',extras:['Oslo-restauranten serverer bjørnekjøtt','Cornell stanser forskningsreiser']},
  surf: {heading:'Surf · Hellestø',primary:'Poor to Fair',detail:'Waves 0.8–1.2 m',
    extras:['Period 10 s','Wind NE · 4 m/s','Today’s Best 14:00–18:00']},
  ski: {heading:'Ski',primary:'15 cm',detail:'Fresh snow',extras:['Cloudy · −4°C','Lifts open 9–16']},
  countdown: {heading:'Countdown',primary:'24',detail:'Days until Christmas',
    extras:['24 December 2026']},
  soccer: {heading:'Viking',primary:'2 – 1',detail:'Full time',
    extras:['Next match · Sunday','League position · 3']},
  stocks: {heading:'Equinor',primary:'274.50',detail:'NOK · +1.4%',
    extras:['Today +3.70','Month +5.2%']},
  groceries: {heading:'Groceries',primary:'Milk',detail:'Bread',
    extras:['Coffee','Apples','Butter']},
  assistant: {heading:'AI Follow',primary:'No new updates',detail:'Following two topics',
    extras:['Last checked today']},
})

const clamp=(v,min,max)=>Math.max(min,Math.min(max,v))
const rect=(x,y,w,h)=>({x,y,w:Math.max(1,w),h:Math.max(1,h)})
const textWeight=(letter,serif)=> {
  if(' MW@%'.includes(letter))return letter===' '?0.33:0.95
  if('ijlI1.,:;!|'.includes(letter))return 0.34
  if('0123456789'.includes(letter))return serif?0.60:0.61
  if(letter>='A'&&letter<='Z')return 0.73
  if(letter==='–'||letter==='—')return 0.78
  return serif?0.59:0.62
}
export function estimatedTextWidth(value,size,serif=false){
  return [...String(value)].reduce((n,ch)=>n+textWeight(ch,serif),0)*size +
    Math.max(0,String(value).length-1)*(size>=22?0:0.24)
}
export function fitEditorialText(value,w,size,serif=false){
  const source=String(value ?? '')
  if(estimatedTextWidth(source,size,serif)<=w-4)return source
  const ending='…'
  let short=source
  while(short.length>0 && estimatedTextWidth(short+ending,size,serif)>w-4)
    short=short.slice(0,-1)
  return short?short.trimEnd()+ending:''
}

function wrapEditorialText(value,w,size,serif=false,maxLines=2){
  const words=String(value).split(/\s+/).filter(Boolean)
  const lines=[]
  let line=''
  for(const word of words){
    const candidate=line?line+' '+word:word
    if(estimatedTextWidth(candidate,size,serif)<=w-4){
      line=candidate
    }else{
      if(line)lines.push(line)
      line=word
    }
  }
  if(line)lines.push(line)
  if(lines.length>maxLines){
    const kept=lines.slice(0,maxLines)
    kept[maxLines-1]=fitEditorialText(lines.slice(maxLines-1).join(' '),w,size,serif)
    return kept
  }
  return lines.map(l=>fitEditorialText(l,w,size,serif))
}

function textBlock(id,value,w,size,{serif=false,maxLines=1,role='primary'}={}){
  const lines=maxLines>1?wrapEditorialText(value,w,size,serif,maxLines):
    [fitEditorialText(value,w,size,serif)].filter(Boolean)
  const lineHeight=size*1.24
  return {id,role,type:'text',x:0,y:0,w,h:Math.ceil(Math.max(1,lines.length)*lineHeight),
    lines,fontSize:size,serif}
}
function graphicBlock(id,w,h,role='figure'){
  return {id,role,type:role==='score'?'score':role==='calendar'?'calendar':'figure',
    x:0,y:0,w,h}
}
function stackCentered(items,region,{gap=9}={}){
  const total=items.reduce((v,b)=>v+b.h,0)+Math.max(0,items.length-1)*gap
  let y=region.y+Math.max(0,(region.h-total)/2)
  return items.map(item=>{
    const laid={...item,x:region.x+(region.w-item.w)/2,y}
    y+=item.h+gap
    return laid
  })
}
const paddedRegion=(p,header=false)=>{
  const top=p.inset+(header?36:0)
  return rect(p.inset,top,p.safeWidth,p.height-top-p.inset)
}

// The only horizontal arrangement is a named composition rule; all child
// rectangles have fixed bounds before browser SVG elements are created.
function dateComposition(p){
  const body=paddedRegion(p)
  if(p.shape==='ribbon'&&body.w>=300){
    const widths=[Math.floor(body.w*.32),Math.floor(body.w*.24)]
    widths.push(body.w-widths[0]-widths[1]-12)
    const gap=6
    const parts=[
      textBlock('weekday','Wednesday',widths[0],clamp(body.h*.15,11,16),{role:'secondary'}),
      textBlock('date','21',widths[1],clamp(body.h*.45,28,58),{serif:true,role:'hero'}),
      textBlock('month','October 2026',widths[2],clamp(body.h*.13,11,15),{serif:true,role:'primary'}),
    ]
    let x=body.x
    const blocks=parts.map(block=>{
      const placed={...block,x,y:body.y+(body.h-block.h)/2}
      x+=block.w+gap
      return placed
    })
    return {body,blocks,centered:true,mode:'ribbon'}
  }
  const twoColumn=body.w>=520&&body.h>=290
  let hero=body,calendar=null
  if(twoColumn){
    const gutter=18,heroW=Math.floor((body.w-gutter)*.43)
    hero=rect(body.x,body.y,heroW,body.h)
    calendar=rect(body.x+heroW+gutter,body.y,body.w-heroW-gutter,body.h)
  }
  const isShort=hero.h<158
  let dateSize=clamp(Math.min(hero.w*.43,hero.h*.22),31,twoColumn?82:76)
  const metaSize=clamp(hero.w*.065,11,15)
  let stack=[
    ...(hero.h>=190?[textBlock('year','2026',hero.w,metaSize,{role:'secondary'})]:[]),
    textBlock('month','October',hero.w,clamp(hero.w*.11,15,23),{serif:true,role:'heading'}),
    textBlock('date','21',hero.w,dateSize,{serif:true,role:'hero'}),
    textBlock('weekday','Wednesday',hero.w,isShort?11:clamp(hero.w*.067,11,15),{role:'secondary'}),
  ]
  if(twoColumn&&hero.h>=380){
    stack=[...stack,graphicBlock('botanical',Math.min(96,hero.w*.42),65)]
  }
  const gap=isShort?5:clamp(hero.h*.035,8,15)
  const blocks=stackCentered(stack,hero,{gap})
  if(calendar){
    const calW=Math.min(calendar.w,340)
    const calH=Math.min(calendar.h,260)
    blocks.push({...graphicBlock('calendar',calW,calH,'calendar'),
      x:calendar.x+(calendar.w-calW)/2,y:calendar.y+(calendar.h-calH)/2})
  }
  return {body,blocks,centered:true,mode:twoColumn?'spread':'stack'}
}


// Approved Surf Medium reference: the existing 2×2 two-column composition.
// It is not a generic widget. Keep the verdict, six rating rectangles (or
// experience dice), wave range, and the distinct swell/wind detail columns.
function surfMediumComposition(p){
  const w=p.width,h=p.height
  const heading=textBlock('spot','Hellestø',Math.min(240,w-32),18,
    {role:'heading'})
  heading.x=(w-heading.w)/2;heading.y=15
  const bar={id:'spot-underline',role:'divider',type:'divider',x:w/2-39,y:45,w:78,h:2}
  const rule={id:'column-divider',role:'divider',type:'divider',x:w/2,y:77,w:1,h:132}
  const text=(id,value,x,y,width,size,role='primary')=>{
    const b=textBlock(id,value,width,size,{role,maxLines:1})
    return {...b,x,y}
  }
  const blocks=[
    heading,bar,rule,
    text('rating-verdict','Poor to Fair',17,75,166,18,'primary'),
    {id:'rating',role:'score',type:'score',x:32,y:117,w:136,h:16},
    text('wave-range','1.6–2.0 m',17,179,166,18,'measurement'),
    text('details-heading','Details:',214,75,172,18,'heading'),
    {id:'swell-arrow',role:'direction',type:'direction',x:235,y:109,w:30,h:27},
    {id:'wind-arrow',role:'direction',type:'direction',x:334,y:109,w:30,h:27},
    {id:'wave-period-icon',role:'data-icon',type:'icon',x:240,y:150,w:28,h:18},
    {id:'wind-speed-icon',role:'data-icon',type:'icon',x:333,y:150,w:33,h:18},
    text('swell-period','7 s',219,184,76,14,'measurement'),
    text('wind-speed','8 m/s',314,184,77,14,'measurement'),
  ]
  return {body:rect(p.inset,p.inset,p.safeWidth,p.safeHeight),
    blocks,centered:false,mode:'surf-medium-reference'}
}

function contentComposition(module,p){
  const info=EDITORIAL_SAMPLES[module]
  const budget=editorialContentBudget(p,editorialModuleKind(module))
  const showHeader=Boolean(budget.heading&&p.height>=190)
  const body=paddedRegion(p,showHeader)
  // A spacious Weather cell gets an illustration column, and the information
  // stays centered in a separate column. No illustration can cover data.
  const withWeatherArt=module==='weather'&&budget.illustration&&body.w>=540&&body.h>=240
  const artWidth=withWeatherArt?Math.floor(body.w*.39):0
  const rightX=withWeatherArt?body.x+artWidth+18:body.x
  const contentArea=withWeatherArt?rect(rightX,body.y,body.w-artWidth-18,body.h):body
  const width=contentArea.w
  const compact=body.h<125
  const roomy=p.shape==='spread'
  const blocks=[]
  const heroSize=module==='news'?clamp(width*.055,14,roomy?25:18):
    ['reminders','assistant','groceries'].includes(module)?clamp(width*.065,14,roomy?26:19):
    clamp(Math.min(width*.19,body.h*.38),22,roomy?62:43)
  const hasRoomForDetail=body.h>105
  // Main information is a protected content group. In narrow cells the role
  // gains line wrapping rather than being moved to an arbitrary absolute Y.
  if(module==='reminders'){
    blocks.push(textBlock('reminder-time','Friday · 12:30',width,clamp(width*.065,11,15),
      {role:'secondary'}))
    blocks.push(textBlock('primary',info.primary,width,heroSize,
      {serif:true,maxLines:2}))
  }else{
    blocks.push(textBlock('primary',info.primary,width,heroSize,
      {serif:module!=='soccer',maxLines:module==='news'?2:1}))
  }
  if(module==='surf'){
    blocks.push(graphicBlock('rating',Math.min(160,width-8),16,'score'))
  }
  if(hasRoomForDetail){
    blocks.push(textBlock('detail',info.detail,width,clamp(width*.04,11,16),
      {role:'secondary',maxLines:2}))
  }
  const existing=blocks.reduce((v,b)=>v+b.h,0)+Math.max(0,blocks.length-1)*9
  let remaining=Math.max(0,body.h-existing-26)
  let count=0
  // All modules use the same information budget. "show more" means another
  // row that physically fits, not arbitrary percentages or overlapping text.
  for(const extra of info.extras){
    if(count>=Math.max(0,budget.listItems||2))break
    const rowSize=clamp(width*.034,11,15)
    const row=textBlock('extra-'+count,extra,width,rowSize,{role:'list'})
    if(remaining<row.h+9)break
    blocks.push(row)
    remaining-=row.h+9
    count++
  }
  const content=stackCentered(blocks,contentArea,{gap:compact?6:9})
  if(withWeatherArt){
    const artwork=graphicBlock('weather-landscape',Math.min(210,artWidth-16),Math.min(142,body.h*.46))
    content.push({...artwork,x:body.x+(artWidth-artwork.w)/2,
      y:body.y+(body.h-artwork.h)/2})
  }
  const header=showHeader?{...textBlock('heading',info.heading,p.safeWidth,14,
    {role:'heading',serif:true}),x:p.inset,y:p.inset+4}:null
  if(header)content.unshift(header)
  return {body,blocks:content,centered:true,mode:p.shape}
}

export function composeEditorialModule(module,width,height){
  if(!EDITORIAL_MODULES.includes(module))throw new RangeError('Unknown module '+module)
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<100||height<80)
    throw new RangeError('Invalid cell dimensions')
  const plan=editorialPlan(width,height)
  const layout=module==='date'?dateComposition(plan):
    module==='surf'&&width===400&&height===240?surfMediumComposition(plan):
    contentComposition(module,plan)
  return {...layout,module,width,height,plan}
}

// A pure geometry audit (no screenshots, no special-case hand tuning).
// Run in CI for every module x 16 grid shapes x 2 themes.
export function auditEditorialComposition(composition){
  const issues=[]
  const {blocks,width,height,body}=composition
  const epsilon=0.6
  for(const b of blocks){
    if(b.x<-epsilon||b.y<-epsilon||b.x+b.w>width+epsilon||b.y+b.h>height+epsilon)
      issues.push('outside frame: '+b.id)
    if(b.type==='text'&&b.lines.some(line=>
      estimatedTextWidth(line,b.fontSize,b.serif)>b.w+epsilon))
      issues.push('text overflow: '+b.id)
  }
  for(let i=0;i<blocks.length;i++)for(let j=i+1;j<blocks.length;j++){
    const a=blocks[i],b=blocks[j]
    const dx=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)
    const dy=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)
    if(dx>1&&dy>1)issues.push('overlap: '+a.id+' / '+b.id)
  }
  const main=blocks.filter(b=>b.id!=='heading'&&b.id!=='calendar')
  if(main.length&&composition.centered&&!blocks.some(b=>b.id==='calendar')){
    const low=Math.min(...main.map(b=>b.y)),high=Math.max(...main.map(b=>b.y+b.h))
    const bodyCenter=body.y+body.h/2
    if(Math.abs((low+high)/2-bodyCenter)>2)
      issues.push('group is not vertically centered')
  }
  return issues
}
