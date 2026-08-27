export const REMINDER_TEXT_ORDER=Object.freeze(['full','compact','short','tiny'])
export const REMINDER_STUDIO_PRESET_VALUES=Object.freeze(['normal','long','extreme','empty'])

/** Pixel-derived type and row metrics shared with the physical renderer. */
export function reminderDensity(availablePixels,requiredRows) {
  const pixelsPerRow=requiredRows>0?availablePixels/requiredRows:availablePixels
  if(pixelsPerRow>=62)return Object.freeze({name:'spacious',font:'B18',fontSize:24,rowHeight:56,rowGap:6})
  if(pixelsPerRow>=44)return Object.freeze({name:'normal',font:'B12',fontSize:17,rowHeight:42,rowGap:5})
  return Object.freeze({name:'dense',font:'B9',fontSize:13,rowHeight:34,rowGap:4})
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
  if(!total)return Object.freeze({available:false,direction:'vertical',family:'vertical-list',showHeading:false,showTime:false,showTomorrow:false,todayItems:0,tomorrowItems:0,todayOverflow:0,tomorrowOverflow:0,maxItems:0,overflow:0})
  // Composition follows the rendered rectangle. Grid spans are deliberately not
  // consulted: the same logical shape can be shallow, square, or tall at runtime.
  const pad=Math.max(9,Math.min(18,Math.round(Math.min(profile.width,profile.height)*.08)))
  const usable={width:Math.max(0,profile.width-pad*2),height:Math.max(0,profile.height-pad*2)}
  const landscape=profile.height>0&&profile.width/profile.height>1.12
  const shallow=landscape&&usable.height<126
  const split=!shallow&&landscape&&usable.width>=464&&usable.height>=164
  const family=shallow?'shallow-horizontal':split?'split-sections':'vertical-list'
  const direction=shallow?'horizontal':split?'split':'vertical'
  const showHeading=!shallow&&usable.height>=104
  const headingH=showHeading?30:0,footerH=24,rowH=38,rowGap=4,sectionGap=10
  const rowCapacity=(available,minimum=rowH,gap=rowGap)=>available<minimum?0:1+Math.floor((available-minimum)/(minimum+gap))
  let showTomorrow=state.tomorrow.length>0,todayItems=0,tomorrowItems=0
  if(shallow) {
    const initial=rowCapacity(usable.width,142,12),canFitFooter=usable.width>=142+12+42
    const contentWidth=usable.width-(total>initial&&canFitFooter?66:0),capacity=rowCapacity(contentWidth,142,12)
    showTomorrow=state.today.length===0&&state.tomorrow.length>0
    todayItems=Math.min(state.today.length,capacity)
    tomorrowItems=showTomorrow?Math.min(state.tomorrow.length,capacity-todayItems):0
  } else if(split) {
    const rowsArea=usable.height-headingH,initial=rowCapacity(rowsArea)
    const capacity=rowCapacity(rowsArea-((state.today.length>initial||state.tomorrow.length>initial)?footerH:0))
    todayItems=Math.min(state.today.length,capacity);tomorrowItems=Math.min(state.tomorrow.length,capacity)
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
  return Object.freeze({available:true,direction,family,showHeading,showTime:true,showTomorrow,todayItems,tomorrowItems,todayOverflow,tomorrowOverflow,maxItems,overflow:todayOverflow+tomorrowOverflow})
}

/** Allocate every drawable Reminders region before Canvas rendering begins. */
export function reminderLayout(profile,composition) {
  const pad=Math.max(9,Math.min(18,Math.round(Math.min(profile.width,profile.height)*.08)))
  const inner={x:pad,y:pad,width:Math.max(1,profile.width-pad*2),height:Math.max(1,profile.height-pad*2)}
  if(!composition.available)return Object.freeze({pad,emptyRect:inner,todayRect:null,tomorrowRect:null,footerRect:null,todayFooterRect:null,tomorrowFooterRect:null,items:Object.freeze([])})
  if(composition.direction==='split') {
    const gap=composition.todayItems&&composition.tomorrowItems?18:0,hasToday=composition.todayItems>0,hasTomorrow=composition.tomorrowItems>0
    const todayShare=!hasTomorrow?1:!hasToday?0:.7
    const todayWidth=hasToday?(hasTomorrow?Math.max(1,Math.round((inner.width-gap)*todayShare)):inner.width):0
    const tomorrowWidth=hasTomorrow?Math.max(1,inner.width-gap-todayWidth):0
    const todayRect=composition.todayItems?{x:inner.x,y:inner.y,width:todayWidth,height:inner.height}:null
    const tomorrowRect=hasTomorrow?{x:inner.x+todayWidth+gap,y:inner.y,width:tomorrowWidth,height:inner.height}:null
    const headingHeight=composition.showHeading?30:0,footerHeight=20
    const todayFooterRect=composition.todayOverflow&&todayRect?{x:todayRect.x,y:todayRect.y+todayRect.height-footerHeight,width:todayRect.width,height:footerHeight}:null
    const tomorrowFooterRect=composition.tomorrowOverflow&&tomorrowRect?{x:tomorrowRect.x,y:tomorrowRect.y+tomorrowRect.height-footerHeight,width:tomorrowRect.width,height:footerHeight}:null
    const items=[]
    addSectionItems(items,todayRect,composition.todayItems,headingHeight,false,todayFooterRect?footerHeight+4:0)
    addSectionItems(items,tomorrowRect,composition.tomorrowItems,headingHeight,false,tomorrowFooterRect?footerHeight+4:0)
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
  const minimumRowHeight=38,rowGap=4
  const tomorrowHeight=composition.tomorrowItems?headingHeight+composition.tomorrowItems*minimumRowHeight+Math.max(0,composition.tomorrowItems-1)*rowGap:0
  const sectionGap=tomorrowHeight?10:0
  const todayHeight=composition.todayItems?Math.max(1,content.height-tomorrowHeight-sectionGap):0
  const todayRect=composition.todayItems?{x:content.x,y:content.y,width:content.width,height:todayHeight}:null
  const tomorrowRect=composition.tomorrowItems?{x:content.x,y:content.y+todayHeight+sectionGap,width:content.width,height:tomorrowHeight}:null
  const items=[]
  addSectionItems(items,todayRect,composition.todayItems,headingHeight,profile.width<230)
  addSectionItems(items,tomorrowRect,composition.tomorrowItems,headingHeight,profile.width<230)
  return Object.freeze({pad,emptyRect:null,todayRect,tomorrowRect,footerRect,todayFooterRect:null,tomorrowFooterRect:null,items:Object.freeze(items)})
}

function addSectionItems(items,rect,count,headingHeight,stacked,footerHeight=0) {
  if(!rect||!count)return
  const available=Math.max(1,rect.height-headingHeight-footerHeight),density=reminderDensity(available,count)
  const rowHeight=Math.min(density.rowHeight,Math.max(1,(available-density.rowGap*Math.max(0,count-1))/count)),rowsTop=rect.y+headingHeight
  for(let index=0;index<count;index++)items.push(itemRegions({x:rect.x,y:rowsTop+index*(rowHeight+density.rowGap),width:rect.width,height:rowHeight},stacked,density))
}

function itemRegions(itemRect,stacked,density=reminderDensity(itemRect.height,1)) {
  const inset=2,box={x:itemRect.x+inset,y:itemRect.y+inset,width:Math.max(1,itemRect.width-inset*2),height:Math.max(1,itemRect.height-inset*2)}
  if(stacked) {
    const timeHeight=Math.min(18,Math.max(1,box.height*.38))
    return Object.freeze({itemRect,timeRect:{x:box.x,y:box.y,width:box.width,height:timeHeight},titleRect:{x:box.x,y:box.y+timeHeight,width:box.width,height:Math.max(1,box.height-timeHeight)},stacked:true,density})
  }
  const timeWidth=Math.min(48,Math.max(38,box.width*.22)),gap=7
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
