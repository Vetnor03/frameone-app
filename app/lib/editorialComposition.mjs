import {editorialPlan, editorialContentBudget, editorialModuleKind} from './editorialFrameLayout.mjs'
import {WEATHER_VIGNETTE_SCENES} from './editorialWeatherVignette.mjs'

export const EDITORIAL_MODULES = Object.freeze([
  'date','reminders','weather','news','surf','ski','countdown',
  'soccer','stocks','groceries','assistant',
])

export const EDITORIAL_SAMPLES = Object.freeze({
  date: {heading:'',primary:'21',detail:'Wednesday',extras:[]},
  reminders: {heading:'Reminders',primary:'Kontrolltime Aleris',detail:'Friday · 12:30',
    extras:['Today · 18:00 · Passe søsken','Friday · 12:30 · Kontrolltime','Saturday · Pick up parcel','Sunday · Family dinner','Monday · Return library books','Tuesday · Gym appointment']},
  weather: {heading:'Weather',primary:'12°',detail:'Cloudy with sunny spells',
    extras:['Today · High 13° / Low 9°','Wind · NW 4 m/s','Rain probability · 20%','Tomorrow · 11° / Rain','Saturday · 12° / Brighter','Weekend · More sunshine']},
  news: {heading:'Siste nytt',primary:'Aker BP-lederforeningen innkaller til ekstraordinært møte',
    detail:'Top stories',extras:['Oslo-restauranten serverer bjørnekjøtt','Cornell stanser forskningsreiser','Lokale nyheter fra Rogaland','Ny utvikling i Europa','Siste oppdatering kl. 12:30']},
  surf: {heading:'Surf · Hellestø',primary:'Poor to Fair',detail:'Waves 0.8–1.2 m',
    extras:['Waves · 0.8–1.2 m','Swell period · 10 s','Wind · NE 4 m/s','Swell direction · NW','Today’s Best · 14:00–18:00','Tomorrow · Improving conditions']},
  ski: {heading:'Ski',primary:'15 cm',detail:'Fresh snow',extras:['Temperature · −4°C','Fresh snow · 15 cm','Open lifts · 9–16','Wind · 3 m/s','Tomorrow · Mostly clear']},
  countdown: {heading:'Countdown',primary:'24',detail:'Days until Christmas',
    extras:['24 December 2026']},
  soccer: {heading:'Viking',primary:'2 – 1',detail:'Full time',
    extras:['Next match · Sunday','League position · 3','Form · W D W W L','Home · Stavanger','Kickoff · 18:00','Competition · Eliteserien']},
  stocks: {heading:'Equinor',primary:'274.50',detail:'NOK · +1.4%',
    extras:['Today · +3.70 NOK','Month · +5.2%','Week · +2.6%','Previous close · 270.80','Range · 268.00–277.00']},
  groceries: {heading:'Groceries',primary:'Milk',detail:'Bread',
    extras:['Coffee','Apples','Butter','Cheese','Tomatoes','Pasta','Oat milk']},
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

// Content-first typography: use the largest legible size that displays every
// word in the allotted lines. Only truncate when the minimum size still fails.
export function fitEditorialHeadline(value,width,preferredSize,{
  minSize=16,maxLines=2,serif=true,
}={}){
  const source=String(value??'').trim().replace(/\s+/g,' ')
  const top=Math.max(minSize,preferredSize)
  for(let size=top;size>=minSize;size-=0.5){
    const lines=wrapEditorialText(source,width,size,serif,maxLines)
    if(lines.join(' ')===source&&lines.every(line=>
      estimatedTextWidth(line,size,serif)<=width-4)){
      return {fontSize:size,lines,complete:true}
    }
  }
  const lines=wrapEditorialText(source,width,minSize,serif,maxLines)
  return {fontSize:minSize,lines,complete:lines.join(' ')===source}
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
  const top=p.inset+(header?(p.height<155?26:36):0)
  return rect(p.inset,top,p.safeWidth,p.height-top-p.inset)
}

// The only horizontal arrangement is a named composition rule; all child
// rectangles have fixed bounds before browser SVG elements are created.
function dateComposition(p){
  const body=paddedRegion(p)
  if(p.shape==='ribbon'&&body.w>=300){
    // One coherent date group. Spreading weekday, date and month across
    // three distant columns made the band read as three unrelated modules.
    const items=[
      textBlock('month','October 2026',body.w,15,{serif:true,role:'heading'}),
      textBlock('date','21',body.w,43,{serif:true,role:'hero'}),
      textBlock('weekday','Wednesday',body.w,13,{role:'secondary'}),
    ]
    return {body,blocks:stackCentered(items,body,{gap:5}),
      centered:true,mode:'ribbon'}
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
// Approved Surf Medium layout. Coordinates follow ModuleSurf.cpp's established
// 2×2 structure (400×240 logical reference), with scale-free proportional
// regions and measured text widths. Firmware remains authoritative.
function surfMediumComposition(p){
  const w=p.width
  const leftW=w/2,rightW=w-leftW
  const label=(id,value,x,top,width,size,role='primary')=>{
    const b=textBlock(id,value,width,size,{role,maxLines:1})
    return {...b,x,y:top}
  }
  const spot=label('spot','Hellestø',w*.18,20,w*.64,19,'heading')
  const underlineW=Math.min(112,estimatedTextWidth('Hellestø',19,false))
  const bar={id:'spot-underline',role:'divider',type:'divider',
    x:(w-underlineW)/2,y:50,w:underlineW,h:2}
  const rule={id:'column-divider',role:'divider',type:'divider',
    x:leftW,y:89,w:1,h:133}
  // Existing Medium firmware uses FONT_B12 for the verdict and Details
  // headings; 20px rating rectangles × 14px with 6px gaps; FONT_B9 for waves.
  const scoreW=6*20+5*6
  const blocks=[
    spot,bar,rule,
    label('rating-verdict','Poor to Fair',18,89,leftW-36,19,'primary'),
    {id:'rating',role:'score',type:'score',x:(leftW-scoreW)/2,y:151,w:scoreW,h:14},
    label('wave-range','1.6–2.0 m',18,205,leftW-36,14,'measurement'),
    label('details-heading','Details:',rightW+18,89,rightW-36,19,'heading'),
    {id:'swell-arrow',role:'direction',type:'direction',x:leftW+38,y:128,w:30,h:26},
    {id:'wind-arrow',role:'direction',type:'direction',x:leftW+137,y:128,w:30,h:26},
    {id:'wave-period-icon',role:'data-icon',type:'icon',x:leftW+42,y:173,w:28,h:18},
    {id:'wind-speed-icon',role:'data-icon',type:'icon',x:leftW+135,y:173,w:33,h:18},
    label('swell-period','7 s',leftW+19,205,76,14,'measurement'),
    label('wind-speed','8 m/s',leftW+114,205,76,14,'measurement'),
  ]
  return {body:rect(p.inset,p.inset,p.safeWidth,p.safeHeight),
    blocks,centered:false,mode:'surf-medium-reference'}
}

// A ribbon is a small editorial row, not a tall card squeezed into 120px.
// Shared three-zone grammar: identity / essential fact / supporting context.
// In particular, every ribbon keeps the label and its primary explanation.
// Shared semantic de-duplication used by ALL composition modes, including
// horizontal ribbons. Use punctuation-insensitive comparisons for separators
// without destroying numeric sign or decimal information.
function normalizeInformation(value){
  return String(value??'').normalize('NFKC').toLocaleLowerCase()
    .replace(/[\s.,;:·•'"()]/g,'').replace(/[–—]/g,'-')
}
function distinctSupportingLines(info){
  const primary=normalizeInformation(info.primary)
  const detail=normalizeInformation(info.detail)
  const headlineKey=normalizeInformation(String(info.primary??'').trim().split(/\s+/)[0])
  const seen=new Set([primary,detail].filter(Boolean))
  return (info.extras??[]).filter(value=>{
    const key=normalizeInformation(value)
    if(!key||seen.has(key))return false
    if(primary&&detail&&key.includes(primary)&&key.includes(detail))return false
    // Some reminder systems abbreviate the title in their supporting list
    // ("Friday 12:30 Kontrolltime" vs "Kontrolltime Aleris").
    // Matching both time and a meaningful title token identifies the same
    // event without suppressing other items on a different day.
    if(detail&&headlineKey.length>=5&&key.includes(detail)&&
      key.includes(headlineKey))return false
    seen.add(key)
    return true
  })
}

// Different source strings can be truncated to the same *visible* value.
// De-duplicate after fitting as well as before it, keeping the first item.
function distinctVisibleSupporting(blocks,existing=[]){
  const seen=new Set(existing.map(b=>
    normalizeInformation((b.lines??[]).join(' '))).filter(Boolean))
  return blocks.filter(block=>{
    const key=normalizeInformation((block.lines??[]).join(' '))
    if(!key||key==='…'||seen.has(key))return false
    seen.add(key)
    return true
  })
}
// Full-width and 3-column ribbons are read as a single section, not
// three disconnected facts placed at far-left, center and far-right.
// Identity, primary value and explanation stay together as a coherent group.
function ribbonComposition(module,p,info){
  const body=rect(p.inset,p.inset,p.safeWidth,p.safeHeight)
  const serif=module!=='soccer'
  const heading=textBlock('heading',info.heading,body.w,14,
    {serif:true,role:'heading'})
  const detail=textBlock('detail',info.detail,body.w,13,
    {role:'secondary',maxLines:1})
  const preferred=Math.min(38,Math.max(24,body.w*.064))
  const linesNeeded=estimatedTextWidth(info.primary,preferred,serif)>body.w-4?2:1
  const reserved=heading.h+detail.h+(module==='surf'?16:0)+18
  const allowedByHeight=Math.floor(
    (body.h-reserved)/(linesNeeded*1.24))
  const lead=fitEditorialHeadline(info.primary,body.w,
    Math.max(16,Math.min(preferred,allowedByHeight)),{
      minSize:16,maxLines:2,serif,
    })
  const primary=textBlock('primary',info.primary,body.w,lead.fontSize,
    {serif,maxLines:lead.lines.length>1?2:1})
  const items=[heading,primary]
  if(module==='surf')
    items.push(graphicBlock('rating',Math.min(152,body.w-10),16,'score'))
  items.push(detail)
  const next=distinctSupportingLines(info)[0]
  if(next){
    const candidate=textBlock('extra-0',next,body.w,11,
      {role:'list',maxLines:1})
    const unique=distinctVisibleSupporting([candidate],items)
    const proposed=[...items,...unique]
    const occupied=proposed.reduce((sum,block)=>sum+block.h,0)+
      (proposed.length-1)*5
    if(occupied<=body.h-8)items.push(...unique)
  }
  return {body,blocks:stackCentered(items,body,{gap:5}),
    centered:true,mode:'editorial-ribbon'}
}

// Compact horizontal cells keep the value *and* its explanation together.
// This prevents a numeric value in a 2×1 grid from becoming meaningless.
// Tiny cells are a valid intentional user layout, not a geometry error.
// They use the same disciplined miniature editorial hierarchy for EVERY
// module: identity, unmistakable lead fact, then one line of context.
// Larger text or extra lines give way to meaning rather than clipping.
function miniatureComposition(module,p,info){
  const body=rect(p.inset,p.inset,p.safeWidth,p.safeHeight)
  const serif=module!=='soccer'
  // An editorial headline that occupies only two short lines often
  // becomes meaningless when truncated. Small news tiles may spend one more
  // line on the headline rather than repeating the same tiny summary.
  const headlineLines=module==='news'?3:2
  const lead=fitEditorialHeadline(info.primary,body.w,
    ['news','reminders','groceries','assistant'].includes(module)?18:31,
    {minSize:13,maxLines:headlineLines,serif})
  const title=textBlock('heading',info.heading,body.w,12,
    {serif:true,role:'heading',maxLines:1})
  const primary=textBlock('primary',info.primary,body.w,lead.fontSize,
    {serif,maxLines:lead.lines.length>1?headlineLines:1})
  const detail=textBlock('detail',info.detail,body.w,11,
    {role:'secondary',maxLines:1})
  let items=[title,primary,detail]
  // The rating conveys more than a second duplicate line on tiny Surf tiles.
  if(module==='surf')
    items=[title,primary,graphicBlock('rating',Math.min(128,body.w-8),
      16,'score'),detail]
  // A miniature Surf score is a 16px-high *graphic*, not a text line.
  // Preserve at least 6px between graphic, caption and primary title.
  const gap=module==='surf'?6:4
  const heightOf=parts=>parts.reduce((n,b)=>n+b.h,0)+(parts.length-1)*gap
  // Extremely long headlines should never push the identity or context off
  // the panel. Compress type until the entire group stays in the safe area.
  while(heightOf(items)>body.h&&primary.fontSize>13){
    primary.fontSize-=1
    const resized=textBlock('primary',info.primary,body.w,primary.fontSize,
      {serif,maxLines:headlineLines})
    items=items.map(b=>b.id==='primary'?resized:b)
  }
  if(heightOf(items)>body.h){
    // The score is optional ornament, the module name and context are not.
    items=items.filter(b=>b.id!=='rating')
  }
  return {body,blocks:stackCentered(items,body,{gap}),
    centered:true,mode:'miniature'}
}

function compactHorizontalComposition(module,p,info){
  const body=rect(p.inset,p.inset,p.safeWidth,p.safeHeight)
  const longHeadline=estimatedTextWidth(info.primary,18,module!=='soccer')>body.w-6
  const isMeasurement=!longHeadline&&
    estimatedTextWidth(info.primary,30,module!=='soccer')<body.w-10
  let fontSize=longHeadline?17:isMeasurement?32:21
  // Find the best complete two-line headline instead of blindly using
  // the same type size regardless of actual headline length.
  if(longHeadline){
    fontSize=fitEditorialHeadline(info.primary,body.w,17,{
      minSize:15,maxLines:2,serif:module!=='soccer',
    }).fontSize
  }else{
    while(fontSize>13&&
      estimatedTextWidth(info.primary,fontSize,module!=='soccer')>body.w-5)
      fontSize--
  }
  const items=[
    textBlock('heading',info.heading,body.w,12,{serif:true,role:'heading'}),
    textBlock('primary',info.primary,body.w,fontSize,{
      serif:module!=='soccer',maxLines:longHeadline?2:1,
    }),
    ...(module==='surf'?[graphicBlock('rating',Math.min(145,body.w-6),16,'score')]:[]),
    textBlock('detail',info.detail,body.w,12,
      {role:'secondary',maxLines:1}),
  ]
  return {body,blocks:stackCentered(items,body,{gap:5}),
    centered:true,mode:'compact-summary'}
}

function contentComposition(module,p,options={}){
  // Pure test-only content injection: the default renderer remains unchanged.
  // Allows the stress suite to exercise real composition logic with difficult
  // headlines, sparse updates and unusual text, without changing module art.
  const base=options.sample
    ? {...EDITORIAL_SAMPLES[module],...options.sample}
    : EDITORIAL_SAMPLES[module]
  // The Lab's manual weather scene changes sample condition text as well as art.
  const weatherSample=WEATHER_VIGNETTE_SCENES[options.weatherScene||'partly']
  const info=module==='weather'&&weatherSample&&!options.sample
    ? {...base,detail:weatherSample.detail,
       extras:base.extras.map(row=>row.startsWith('Wind ·')
         ? 'Wind · NW '+weatherSample.windMs+' m/s' : row)}
    :base
  if(p.width<260&&p.height<152)return miniatureComposition(module,p,info)
  if(p.shape==='ribbon'&&p.width>=540)return ribbonComposition(module,p,info)
  if(p.height<=152&&p.width>=300&&p.width<540)
    return compactHorizontalComposition(module,p,info)
  const budget=editorialContentBudget(p,editorialModuleKind(module))
  // Even the smallest cells need an identity: a standalone number without
  // its source is ambiguous from across a room.
  const compactIdentity=p.height>=110&&p.height<155&&p.width<=400
  const showHeader=Boolean(info.heading&&(budget.heading&&p.height>=190||compactIdentity))
  const body=paddedRegion(p,showHeader)
  // A module earns a second information column only when there is real list or
  // forecast data to show. Full-screen is not a reason to invent decoration.
  // Wider medium-height panels need to use their *width*, not just enlarge
  // a centered headline. Long editorial headlines keep full-line space until
  // the panel is tall enough to accommodate a second column.
  const richSpread=p.width>=680&&p.height>=235&&info.extras.length>=3&&
    (module!=='news'||p.height>=390)
  // Weather earns its coastal illustration as soon as the wide panel can
  // support art plus readable weather data; 2×2 Surf stays untouched.
  const withBotanical=module==='weather'&&body.w>=620&&body.h>=160&&
    (budget.illustration||p.width>=650)
  const artWidth=withBotanical?Math.floor(body.w*.34):0
  const rightX=withBotanical?body.x+artWidth+18:body.x
  const remainingBody=withBotanical?rect(rightX,body.y,body.w-artWidth-18,body.h):body
  const withSideList=richSpread&&!withBotanical
  const heroWidth=withSideList?Math.floor(remainingBody.w*.49):remainingBody.w
  const sideGap=withSideList?22:0
  const heroArea=withSideList
    ?rect(remainingBody.x,remainingBody.y,heroWidth,remainingBody.h)
    :remainingBody
  const listArea=withSideList
    ?rect(heroArea.x+heroArea.w+sideGap,body.y,
          remainingBody.w-heroArea.w-sideGap,body.h)
    :null
  const width=heroArea.w
  const compact=body.h<125
  const roomy=p.shape==='spread'
  // Shared hierarchy for text-led content: headlines grow as their
  // panel grows, with a height-aware limit to protect supporting details.
  const textLed=['news','reminders','assistant','groceries'].includes(module)
  // One large module should not display the same tiny typography as a
  // half-sized tile. Scale the principal fact with the available full-frame
  // area; leave secondary rows understated and never inflate empty-state copy.
  const flagship=p.width>=780&&p.height>=450
  const tallFeature=p.width>=380&&p.height>=450
  const valueCeiling=flagship?88:tallFeature?70:roomy?62:43
  let heroSize=textLed
    ?clamp(Math.min(width*.075,body.h*.12),17,roomy?30:24)
    :clamp(Math.min(width*(flagship?.20:.19),body.h*.38),22,valueCeiling)
  // Fit long text against available space, not only the module size. This
  // avoids losing the final word of a meaningful editorial headline.
  const needsWrap=module==='news'||module==='reminders'||
    (textLed&&estimatedTextWidth(info.primary,heroSize,true)>width-4)
  if(needsWrap){
    heroSize=fitEditorialHeadline(info.primary,width,heroSize,{
      minSize:module==='news'?16:17,maxLines:2,serif:true,
    }).fontSize
  }
  // A numerical or short verbal headline should retain its complete meaning.
  // Reduce its scale within a global lower bound before ever ellipsizing it.
  // News/reminder headlines already have separate multi-line wrapping rules.
  if(!['reminders','news'].includes(module)){
    const serif=module!=='soccer'
    const measured=estimatedTextWidth(info.primary,heroSize,serif)
    if(measured>width-6){
      const floor=['assistant','groceries'].includes(module)?14:19
      heroSize=Math.max(floor,Math.min(heroSize,Math.floor(heroSize*(width-6)/measured)))
    }
  }
  const hero=[]
  if(module==='reminders'){
    hero.push(textBlock('reminder-time','Friday · 12:30',width,clamp(width*.065,11,15),
      {role:'secondary'}))
    hero.push(textBlock('primary',info.primary,width,heroSize,
      {serif:true,maxLines:2}))
  }else{
    hero.push(textBlock('primary',info.primary,width,heroSize,
      {serif:module!=='soccer',maxLines:needsWrap?2:1}))
  }
  if(module==='surf')
    hero.push(graphicBlock('rating',Math.min(160,width-8),16,'score'))
  // Do not display the same timestamp twice when it already introduces the
  // reminder. Keep the most meaningful line, rather than repeating metadata.
  const repeatedDetail=hero.some(block=>block.lines?.join(' ')===info.detail)
  if(body.h>105&&!repeatedDetail)
    hero.push(textBlock('detail',info.detail,width,clamp(width*.04,11,16),
      {role:'secondary',maxLines:2}))
  const gap=compact?6:9
  const blocks=stackCentered(hero,heroArea,{gap})
  const extras=distinctSupportingLines(info)
  if(listArea){
    // An optional category heading anchors a true information list; no repeated
    // hero or ornamental image consumes the free half of the frame.
    const sectionTitle={
      reminders:'NEXT REMINDERS',news:'MORE HEADLINES',surf:'FORECAST DETAILS',
      ski:'THE NEXT DAYS',soccer:'MATCH DETAILS',stocks:'MARKET DETAILS',
      groceries:'STILL TO BUY',weather:'FORECAST',
    }[module]||'DETAILS'
    const side=[textBlock('section-heading',sectionTitle,listArea.w,13,
      {role:'heading'})]
    for(let i=0;i<extras.length&&i<6;i++){
      const candidate=textBlock('extra-'+i,extras[i],listArea.w,
        clamp(listArea.w*.037,12,15),
        {role:'list',maxLines:module==='news'?2:1})
      side.push(...distinctVisibleSupporting([candidate],blocks.concat(side)))
    }
    // Automatically drop least important trailing rows if the actual block
    // heights cannot fit. Keep the whole surviving section vertically centered.
    const enough=()=>side.reduce((sum,b)=>sum+b.h,0)+(side.length-1)*12<=listArea.h-24
    while(side.length>1&&!enough())side.pop()
    blocks.push(...stackCentered(side,listArea,{gap:12}))
  }else{
    const used=hero.reduce((sum,b)=>sum+b.h,0)+(hero.length-1)*gap
    let free=Math.max(0,heroArea.h-used-26)
    const maxExtra=roomy?6:2
    const rows=[]
    for(let i=0;i<extras.length&&i<maxExtra;i++){
      const row=textBlock('extra-'+i,extras[i],width,clamp(width*.034,11,15),
        {role:'list',maxLines:1})
      if(free<row.h+gap)break
      const distinct=distinctVisibleSupporting([row],hero.concat(rows))
      if(distinct.length){
        rows.push(row)
        free-=row.h+gap
      }
    }
    // All content in a single region is a *single centered group*.
    blocks.splice(0,blocks.length,...stackCentered([...hero,...rows],heroArea,{gap}))
  }
  if(withBotanical){
    const artwork=graphicBlock('weather-coast',
      Math.min(208,artWidth-18),Math.min(132,body.h*.37))
    blocks.push({...artwork,x:body.x+(artWidth-artwork.w)/2,
      y:body.y+(body.h-artwork.h)/2})
  }
  const header=showHeader?{...textBlock('heading',info.heading,p.safeWidth,
    compactIdentity?12:14,{role:'heading',serif:true}),x:p.inset,y:p.inset+4}:null
  if(header)blocks.unshift(header)
  return {body,blocks,centered:true,mode:withSideList?'information-spread':p.shape}
}

export function composeEditorialModule(module,width,height,options={}){
  if(!EDITORIAL_MODULES.includes(module))throw new RangeError('Unknown module '+module)
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<100||height<80)
    throw new RangeError('Invalid cell dimensions')
  const plan=editorialPlan(width,height)
  const layout=module==='date'?dateComposition(plan):
    module==='surf'&&width===400&&height===240?surfMediumComposition(plan):
    contentComposition(module,plan,options)
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
  // Surface duplicated supporting facts as structural failures. Visual-only
  // reviews caught this in Surf's 4x1 ribbon; the audit now protects ALL
  // modules and aspect ratios from repeating a detail in its extras.
  const supporting=blocks.filter(b=>b.type==='text'&&
    (b.id==='detail'||b.id.startsWith('extra-')))
  const seenSupporting=new Set()
  for(const block of supporting){
    const meaning=normalizeInformation(block.lines.join(' '))
    if(!meaning)continue
    if(seenSupporting.has(meaning))
      issues.push('duplicated supporting information: '+block.id)
    seenSupporting.add(meaning)
  }
  // Compact summaries deliberately center the entire three-line group,
  // including its title. Other arrangements center the content separately
  // from a top-aligned title.
  const main=blocks.filter(b=>b.id!=='calendar'&&
    (['compact-summary','editorial-ribbon','miniature'].includes(composition.mode)||
      b.id!=='heading'))
  if(main.length&&composition.centered&&!blocks.some(b=>b.id==='calendar')){
    const low=Math.min(...main.map(b=>b.y)),high=Math.max(...main.map(b=>b.y+b.h))
    const bodyCenter=body.y+body.h/2
    if(Math.abs((low+high)/2-bodyCenter)>2)
      issues.push('group is not vertically centered')
  }
  return issues
}
