export const REMINDER_TEXT_ORDER=Object.freeze(['full','compact','short','tiny'])
export const REMINDER_STUDIO_PRESET_VALUES=Object.freeze(['normal','long','extreme','empty'])

/** Pixel-derived type and row metrics shared with the physical renderer. */
export function reminderDensity(availablePixels,requiredRows) {
  const pixelsPerRow=requiredRows>0?availablePixels/requiredRows:availablePixels
  if(pixelsPerRow>=44)return Object.freeze({name:'normal',font:'B12',fontSize:17,rowHeight:42,rowGap:5,timeWidth:62})
  return Object.freeze({name:'dense',font:'B9',fontSize:13,rowHeight:34,rowGap:4,timeWidth:48})
}

const DENSITIES=Object.freeze({
  B12:Object.freeze({name:'normal',font:'B12',fontSize:17,rowHeight:42,rowGap:5,timeWidth:62}),
  B9:Object.freeze({name:'dense',font:'B9',fontSize:13,rowHeight:34,rowGap:4,timeWidth:48}),
})

// This deliberately uses the same cheap, integer-friendly model as firmware.
// It is not used for drawing: it makes candidate selection independent of the
// browser's font rasterizer while still responding to the actual title text.
export function estimateReminderTextWidth(value,font='B12') {
  const units=[...String(value)].reduce((sum,ch)=>sum+(ch===' '?3:/[ilI1.,:;!'|]/.test(ch)?3:/[MW@%&]/.test(ch)?9:/[A-Z0-9]/.test(ch)?7:6),0)
  return Math.ceil(units*(font==='B12'?1.42:1.08))
}

function itemTitle(item){return item?.text?.full||item?.text?.compact||''}
function usefulTitleScore(item,width,font) {
  const full=estimateReminderTextWidth(itemTitle(item),font)
  if(width<54||full<=0)return 0
  const fraction=Math.min(100,Math.floor(width*100/full))
  // One-word ellipses are not useful merely because a row technically fits.
  return fraction<28?0:fraction<42?Math.floor(fraction*35/100):fraction
}

function selectLandscapeCandidate(usable,state,showHeading) {
  const headingH=showHeading?30:0,gap=18,footerH=24
  const candidates=[]
  for(const font of ['B12','B9'])for(const direction of ['split','vertical']) {
    const density=DENSITIES[font]
    const ratios=direction==='split'?[.35,.4,.45,.5,.55,.6,.65]:[1]
    for(const splitRatio of ratios)for(let todayItems=state.today.length;todayItems>=Math.min(1,state.today.length);todayItems--)
      for(let tomorrowItems=state.tomorrow.length;tomorrowItems>=Math.min(1,state.tomorrow.length);tomorrowItems--) {
        const sections=(todayItems?1:0)+(tomorrowItems?1:0),overflow=state.today.length+state.tomorrow.length-todayItems-tomorrowItems
        const footer=overflow?footerH:0
        let titleWidths,rowSpace
        if(direction==='split') {
          const contentW=usable.width-(sections===2?gap:0)
          const widths=sections===2?[Math.round(contentW*splitRatio),contentW-Math.round(contentW*splitRatio)]:[usable.width,usable.width]
          rowSpace=usable.height-headingH-footer
          titleWidths=[widths[0]-density.timeWidth-11,widths[1]-density.timeWidth-11]
          if(Math.max(todayItems,tomorrowItems)*(density.rowHeight+density.rowGap)-density.rowGap>rowSpace)continue
        } else {
          rowSpace=usable.height-sections*headingH-(sections>1?10:0)-footer
          titleWidths=[usable.width-density.timeWidth-11,usable.width-density.timeWidth-11]
          if((todayItems+tomorrowItems)*(density.rowHeight+density.rowGap)-sections*density.rowGap>rowSpace)continue
        }
        const scores=[...state.today.slice(0,todayItems).map(x=>usefulTitleScore(x,titleWidths[0],font)),...state.tomorrow.slice(0,tomorrowItems).map(x=>usefulTitleScore(x,titleWidths[1],font))]
        if(scores.some(x=>x===0))continue
        const readability=scores.reduce((a,b)=>a+b,0)
        const minimum=Math.min(...scores),average=Math.floor(readability/scores.length)
        // The score above is a quality gate. B12 gets a one-item calmness bonus:
        // B9 must reveal at least two additional useful reminders to beat it.
        const fontRank=font==='B12'?1:0,itemCount=todayItems+tomorrowItems
        candidates.push({direction,splitRatio,font,todayItems,tomorrowItems,readability,
          rank:[itemCount+fontRank,fontRank,itemCount,minimum,average,todayItems]})
      }
  }
  candidates.sort((a,b)=>{for(let i=0;i<a.rank.length;i++)if(a.rank[i]!==b.rank[i])return b.rank[i]-a.rank[i];return a.direction.localeCompare(b.direction)})
  if(candidates.length)return candidates[0]
  // Pathological titles must not make the module blank. Fall back to the
  // widest B9 composition with one earliest item (and Tomorrow too when the
  // vertical geometry can retain both complete sections).
  const density=DENSITIES.B9,sections=state.today.length&&state.tomorrow.length?2:1
  const rowsSpace=usable.height-sections*(showHeading?30:0)-(sections>1?10:0)-footerH
  const twoSections=sections===2&&2*density.rowHeight<=rowsSpace
  return {direction:'vertical',splitRatio:1,font:'B9',todayItems:state.today.length?1:0,
    tomorrowItems:state.tomorrow.length&&(!state.today.length||twoSections)?1:0,readability:0,rank:[]}
}

/** Selects verbosity only after composition has allocated a real pixel width. */
export function chooseReminderTextVariant(item,availableWidth,measure) {
  const {text,protectedFacts=[]}=item
  const requiredFacts=protectedFacts.filter(fact=>!fact.optionalInTitle).map(fact=>fact.value)
  const eligible=REMINDER_TEXT_ORDER.filter(variant=>text[variant]&&requiredFacts.every(fact=>text[variant].includes(fact)))
  for(const variant of eligible) if(measure(text[variant])<=availableWidth)return {variant,text:text[variant]}
  const source=[...eligible].reverse().map(variant=>text[variant]).find(Boolean)||''
  if(!source)return {variant:'fallback',text:''}
  const ellipsis='…'
  if(measure(ellipsis)>availableWidth)return {variant:'fallback',text:''}
  // Protected facts are atomic. The fallback may omit an optional fact, but it
  // must never display a prefix such as "IMR 26-0…" or a partial location.
  const atoms=atomicTextParts(source,protectedFacts.map(fact=>fact.value));let fitted=''
  for(const atom of atoms){const candidate=fitted?`${fitted} ${atom}`:atom;if(measure(candidate+ellipsis)>availableWidth)break;fitted=candidate}
  const fallback=fitted?fitted+ellipsis:''
  if(requiredFacts.every(fact=>fallback.includes(fact)))return {variant:'fallback',text:fallback}
  const factsOnly=requiredFacts.join(' ')
  return {variant:'fallback',text:factsOnly&&measure(factsOnly)<=availableWidth?factsOnly:''}
}

function atomicTextParts(source,protectedFacts) {
  const facts=protectedFacts.filter(fact=>source.includes(fact)).sort((a,b)=>b.length-a.length)
  if(!facts.length)return source.split(/\s+/).filter(Boolean)
  const pattern=new RegExp(`(${facts.map(escapeRegExp).join('|')})`,'g')
  return source.split(pattern).flatMap(part=>facts.includes(part)?[part]:part.split(/\s+/)).filter(Boolean)
}

function escapeRegExp(value){return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}

export function reminderComposition(profile,state) {
  const total=state.today.length+state.tomorrow.length
  if(!total)return Object.freeze({available:false,direction:'vertical',family:'vertical-list',showHeading:false,showTime:false,showTomorrow:false,todayItems:0,tomorrowItems:0,todayOverflow:0,tomorrowOverflow:0,maxItems:0,overflow:0,selectedFont:null,splitRatio:null,readabilityScore:0})
  // Composition follows the rendered rectangle. Grid spans are deliberately not
  // consulted: the same logical shape can be shallow, square, or tall at runtime.
  const pad=Math.max(9,Math.min(18,Math.round(Math.min(profile.width,profile.height)*.08)))
  const usable={width:Math.max(0,profile.width-pad*2),height:Math.max(0,profile.height-pad*2)}
  const landscape=profile.height>0&&profile.width/profile.height>1.12
  const shallow=landscape&&usable.height<126
  const split=!shallow&&landscape&&usable.width>=464&&usable.height>=164
  let family=shallow?'shallow-horizontal':split?'split-sections':'vertical-list'
  let direction=shallow?'horizontal':split?'split':'vertical'
  const showHeading=!shallow&&usable.height>=104
  const headingH=showHeading?30:0,footerH=24,rowH=38,rowGap=4,sectionGap=10
  const rowCapacity=(available,minimum=rowH,gap=rowGap)=>available<minimum?0:1+Math.floor((available-minimum)/(minimum+gap))
  let showTomorrow=state.tomorrow.length>0,todayItems=0,tomorrowItems=0
  let selectedFont=null,splitRatio=null,readabilityScore=0
  if(shallow) {
    const initial=rowCapacity(usable.width,142,12),canFitFooter=usable.width>=142+12+42
    const contentWidth=usable.width-(total>initial&&canFitFooter?66:0),capacity=rowCapacity(contentWidth,142,12)
    showTomorrow=state.today.length===0&&state.tomorrow.length>0
    todayItems=Math.min(state.today.length,capacity)
    tomorrowItems=showTomorrow?Math.min(state.tomorrow.length,capacity-todayItems):0
  } else if(split) {
    const selected=selectLandscapeCandidate(usable,state,showHeading)
    if(selected){
      direction=selected.direction;family=selected.direction==='split'?'split-sections':'vertical-list'
      todayItems=selected.todayItems;tomorrowItems=selected.tomorrowItems
      selectedFont=selected.font;splitRatio=selected.splitRatio;readabilityScore=selected.readability
    }
  } else {
    let sectionCount=(state.today.length?1:0)+(showTomorrow?1:0)
    let chrome=sectionCount*headingH+(sectionCount>1?sectionGap:0)
    let initial=rowCapacity(usable.height-chrome),footerReserve=total>initial?footerH+6:0
    let capacity=rowCapacity(usable.height-chrome-footerReserve)
    if(state.today.length&&showTomorrow&&capacity<2) {
      showTomorrow=false;sectionCount=1;chrome=headingH
      initial=rowCapacity(usable.height-chrome);footerReserve=total>initial?footerH+6:0
      capacity=rowCapacity(usable.height-chrome-footerReserve)
    }
    let remaining=capacity
    while(remaining>0) {
      let spent=false
      if(todayItems<state.today.length&&remaining){todayItems++;remaining--;spent=true}
      if(showTomorrow&&tomorrowItems<state.tomorrow.length&&remaining){tomorrowItems++;remaining--;spent=true}
      if(!spent)break
    }
  }
  const maxItems=todayItems+tomorrowItems
  const todayOverflow=Math.max(0,state.today.length-todayItems)
  const tomorrowOverflow=Math.max(0,state.tomorrow.length-tomorrowItems)
  return Object.freeze({available:true,direction,family,showHeading,showTime:true,showTomorrow,todayItems,tomorrowItems,todayOverflow,tomorrowOverflow,maxItems,overflow:todayOverflow+tomorrowOverflow,selectedFont:selectedFont||null,splitRatio:splitRatio||null,readabilityScore:readabilityScore||0})
}

/** Allocate every drawable Reminders region before Canvas rendering begins. */
export function reminderLayout(profile,composition) {
  const pad=Math.max(9,Math.min(18,Math.round(Math.min(profile.width,profile.height)*.08)))
  const inner={x:pad,y:pad,width:Math.max(1,profile.width-pad*2),height:Math.max(1,profile.height-pad*2)}
  if(!composition.available)return Object.freeze({pad,emptyRect:inner,todayRect:null,tomorrowRect:null,footerRect:null,todayFooterRect:null,tomorrowFooterRect:null,items:Object.freeze([])})
  if(composition.direction==='split') {
    const gap=composition.todayItems&&composition.tomorrowItems?18:0,hasToday=composition.todayItems>0,hasTomorrow=composition.tomorrowItems>0
    const todayShare=!hasTomorrow?1:!hasToday?0:(composition.splitRatio||.5)
    const todayWidth=hasToday?(hasTomorrow?Math.max(1,Math.round((inner.width-gap)*todayShare)):inner.width):0
    const tomorrowWidth=hasTomorrow?Math.max(1,inner.width-gap-todayWidth):0
    const todayRect=composition.todayItems?{x:inner.x,y:inner.y,width:todayWidth,height:inner.height}:null
    const tomorrowRect=hasTomorrow?{x:inner.x+todayWidth+gap,y:inner.y,width:tomorrowWidth,height:inner.height}:null
    const headingHeight=composition.showHeading?30:0,footerHeight=20
    const todayFooterRect=composition.todayOverflow&&todayRect?{x:todayRect.x,y:todayRect.y+todayRect.height-footerHeight,width:todayRect.width,height:footerHeight}:null
    const tomorrowFooterRect=composition.tomorrowOverflow&&tomorrowRect?{x:tomorrowRect.x,y:tomorrowRect.y+tomorrowRect.height-footerHeight,width:tomorrowRect.width,height:footerHeight}:null
    const items=[]
    const selectedDensity=composition.selectedFont?DENSITIES[composition.selectedFont]:null
    addSectionItems(items,todayRect,composition.todayItems,headingHeight,false,todayFooterRect?footerHeight+4:0,selectedDensity)
    addSectionItems(items,tomorrowRect,composition.tomorrowItems,headingHeight,false,tomorrowFooterRect?footerHeight+4:0,selectedDensity)
    return Object.freeze({pad,emptyRect:null,todayRect,tomorrowRect,footerRect:null,todayFooterRect,tomorrowFooterRect,items:Object.freeze(items)})
  }
  const horizontalFooterFits=inner.width>=142+12+42
  const footerWidth=composition.direction==='horizontal'&&composition.overflow&&horizontalFooterFits?Math.min(58,Math.max(42,inner.width*.13)):0
  const footerHeight=composition.direction==='vertical'&&composition.overflow?22:0
  const footerRect=composition.overflow&&(composition.direction!=='horizontal'||footerWidth)?(composition.direction==='horizontal'
    ?{x:inner.x+inner.width-footerWidth,y:inner.y,width:footerWidth,height:inner.height}
    :{x:inner.x,y:inner.y+inner.height-footerHeight,width:inner.width,height:footerHeight}):null
  const content={x:inner.x,y:inner.y,width:Math.max(1,inner.width-footerWidth-(footerWidth?8:0)),height:Math.max(1,inner.height-footerHeight-(footerHeight?6:0))}
  if(composition.direction==='horizontal') {
    const count=Math.max(1,composition.todayItems+composition.tomorrowItems),gap=count>1?12:0,itemWidth=Math.max(1,(content.width-gap*(count-1))/count)
    const items=Array.from({length:count},(_,index)=>itemRegions({x:content.x+index*(itemWidth+gap),y:content.y,width:itemWidth,height:content.height},true))
    return Object.freeze({pad,emptyRect:null,todayRect:content,tomorrowRect:null,footerRect,todayFooterRect:null,tomorrowFooterRect:null,items:Object.freeze(items)})
  }
  const headingHeight=composition.showHeading?30:0
  const sectionCount=(composition.todayItems?1:0)+(composition.tomorrowItems?1:0)
  const sectionGap=sectionCount>1?10:0,totalRows=composition.todayItems+composition.tomorrowItems
  const rowsAvailable=Math.max(1,content.height-sectionCount*headingHeight-sectionGap)
  const density=composition.selectedFont?DENSITIES[composition.selectedFont]:reminderDensity(rowsAvailable,totalRows)
  const sharedRowHeight=Math.min(density.rowHeight,Math.max(1,(rowsAvailable-Math.max(0,totalRows-sectionCount)*density.rowGap)/totalRows))
  const sectionHeight=(count)=>count?headingHeight+count*sharedRowHeight+Math.max(0,count-1)*density.rowGap:0
  const todayHeight=sectionHeight(composition.todayItems)
  const tomorrowHeight=sectionHeight(composition.tomorrowItems)
  const todayRect=composition.todayItems?{x:content.x,y:content.y,width:content.width,height:todayHeight}:null
  const tomorrowRect=composition.tomorrowItems?{x:content.x,y:content.y+todayHeight+sectionGap,width:content.width,height:tomorrowHeight}:null
  const items=[]
  addSectionItems(items,todayRect,composition.todayItems,headingHeight,profile.width<230,0,density)
  addSectionItems(items,tomorrowRect,composition.tomorrowItems,headingHeight,profile.width<230,0,density)
  return Object.freeze({pad,emptyRect:null,todayRect,tomorrowRect,footerRect,todayFooterRect:null,tomorrowFooterRect:null,items:Object.freeze(items)})
}

function addSectionItems(items,rect,count,headingHeight,stacked,footerHeight=0,selectedDensity=null) {
  if(!rect||!count)return
  const available=Math.max(1,rect.height-headingHeight-footerHeight),density=selectedDensity||reminderDensity(available,count)
  const rowHeight=Math.min(density.rowHeight,Math.max(1,(available-density.rowGap*Math.max(0,count-1))/count)),rowsTop=rect.y+headingHeight
  for(let index=0;index<count;index++)items.push(itemRegions({x:rect.x,y:rowsTop+index*(rowHeight+density.rowGap),width:rect.width,height:rowHeight},stacked,density))
}

function itemRegions(itemRect,stacked,density=reminderDensity(itemRect.height,1)) {
  const inset=2,box={x:itemRect.x+inset,y:itemRect.y+inset,width:Math.max(1,itemRect.width-inset*2),height:Math.max(1,itemRect.height-inset*2)}
  if(stacked) {
    const timeHeight=Math.min(18,Math.max(1,box.height*.38))
    return Object.freeze({itemRect,timeRect:{x:box.x,y:box.y,width:box.width,height:timeHeight},titleRect:{x:box.x,y:box.y+timeHeight,width:box.width,height:Math.max(1,box.height-timeHeight)},stacked:true,density})
  }
  // Sized for the selected font's HH:MM glyph advances; non-stacked cells have
  // already met the width floor, so the remainder stays available to the title.
  const timeWidth=density.timeWidth,gap=7
  return Object.freeze({itemRect,timeRect:{x:box.x,y:box.y,width:timeWidth,height:box.height},titleRect:{x:box.x+timeWidth+gap,y:box.y,width:Math.max(1,box.width-timeWidth-gap),height:box.height},stacked:false,density})
}

// Time remains structured. Title facts describe only atomic tokens that may be
// included verbatim or intentionally omitted as a whole at lower densities.
const dentist={time:'14:30',text:{full:'Dentist appointment at Madla Medical Centre',compact:'Dentist appointment at Madla',short:'Dentist at Madla',tiny:'Dentist'},protectedFacts:[{value:'Madla Medical Centre',kind:'location',optionalInTitle:true},{value:'Madla',kind:'location',optionalInTitle:true}]}
const project={time:'09:00',text:{full:'Project status meeting for Equinor IMR 26-050',compact:'Equinor IMR 26-050 meeting',short:'IMR 26-050 meeting',tiny:'IMR meeting'},protectedFacts:[{value:'Equinor',kind:'name',optionalInTitle:true},{value:'IMR 26-050',kind:'id',optionalInTitle:true}]}
const football={time:'18:00',text:{full:'Football training at Stavanger stadium',compact:'Football training in Stavanger',short:'Football training',tiny:'Football'},protectedFacts:[{value:'Stavanger',kind:'location',optionalInTitle:true}]}
const mum={time:'20:00',text:{full:'Call Mum about Sunday dinner plans',compact:'Call Mum about Sunday dinner',short:'Call Mum Sunday',tiny:'Call Mum'},protectedFacts:[{value:'Mum',kind:'name',optionalInTitle:false},{value:'Sunday',kind:'date-context',optionalInTitle:true}]}
const prescriptions={time:null,text:{full:'Pick up prescriptions from Madla pharmacy',compact:'Prescriptions from Madla pharmacy',short:'Pick up prescriptions',tiny:'Prescriptions'},protectedFacts:[{value:'Madla',kind:'location',optionalInTitle:true}]}

export const reminderStudioPresets=Object.freeze({
  empty:{today:[],tomorrow:[]},
  normal:{today:[dentist,football,mum],tomorrow:[project]},
  long:{today:[dentist,project,football,mum],tomorrow:[prescriptions,project]},
  extreme:{today:[project,dentist,football,mum,prescriptions],tomorrow:[project,dentist,football,mum]},
})
