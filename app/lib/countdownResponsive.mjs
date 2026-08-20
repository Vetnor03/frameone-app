export const COUNTDOWN_STUDIO_PRESET_VALUES = ['normal','long','extreme','empty']

const freezeState = value => Object.freeze({...value,upcoming:Object.freeze((value.upcoming??[]).map(item=>Object.freeze({...item})))})

export const countdownStudioPresets = Object.freeze({
  normal:freezeState({title:'Summer holiday',count:'42',unit:'days',targetDate:'30 June',upcoming:[{title:'Christmas',count:'126',unit:'days'},{title:'Anniversary',count:'365',unit:'days'}]}),
  long:freezeState({title:'Family summer holiday in southern France',count:'365',unit:'days',targetDate:'19 August 2027',upcoming:[{title:'School winter break',count:'487',unit:'days'},{title:'Grandparents’ golden anniversary',count:'730',unit:'days'}]}),
  extreme:freezeState({title:'The exceptionally long multi-generational family celebration and summer holiday across southern France',count:'99999',unit:'working days remaining',targetDate:'31 December 2299',upcoming:[{title:'A very long upcoming birthday celebration title',count:'100000',unit:'days'},{title:'Extended family reunion in the mountains',count:'100365',unit:'calendar days'},{title:'New century celebration',count:'250000',unit:'hours'}]}),
  empty:freezeState({title:null,count:null,unit:null,targetDate:null,upcoming:[]}),
})

/** Semantic disclosure is decided from the physical region before drawing. */
export function countdownComposition(profile,state) {
  const available=state.count!=null&&state.count!==''&&state.unit!=null&&state.unit!==''
  if(!available)return Object.freeze({available:false,family:'unavailable',showTitle:false,showCount:false,showUnit:false,showTargetDate:false,upcomingRows:0})
  const shallow=profile.orientation==='landscape'&&profile.height<170
  const micro=profile.area<=1||profile.width<150||profile.height<100
  const expanded=profile.area>=8&&profile.height>=300&&profile.width>=330
  const family=micro?'micro':shallow?'horizontal':expanded&&profile.orientation==='landscape'?'split-horizontal':expanded?'expanded-vertical':'stack'
  return Object.freeze({
    available:true,family,showCount:true,showUnit:true,
    showTitle:!micro&&Boolean(state.title),
    showTargetDate:profile.area>=3&&profile.width>=180&&profile.height>=105&&Boolean(state.targetDate),
    upcomingRows:expanded?Math.min(state.upcoming?.length??0,profile.height>=420?3:2):0,
  })
}

/** Allocate bounded, cell-local rectangles. Every field owns its space. */
export function countdownLayout(profile,composition) {
  const pad=Math.max(8,Math.min(18,Math.round(Math.min(profile.width,profile.height)*.07)))
  const inner={x:pad,y:pad,width:Math.max(1,profile.width-pad*2),height:Math.max(1,profile.height-pad*2)}
  if(!composition.available)return Object.freeze({pad,emptyRect:inner,primaryRect:null,heroGroupRect:null,titleRect:null,countRect:null,unitRect:null,targetDateRect:null,upcomingRect:null,upcomingRows:[]})
  let primaryRect=inner,upcomingRect=null
  if(composition.upcomingRows){
    if(composition.family==='split-horizontal'){
      const gap=24,primaryWidth=Math.round(inner.width*.58)
      primaryRect={x:inner.x,y:inner.y,width:primaryWidth,height:inner.height}
      upcomingRect={x:inner.x+primaryWidth+gap,y:inner.y,width:Math.max(1,inner.width-primaryWidth-gap),height:inner.height}
    }else{
      const gap=16,upcomingHeight=Math.min(128,Math.max(92,inner.height*.29))
      primaryRect={x:inner.x,y:inner.y,width:inner.width,height:Math.max(1,inner.height-upcomingHeight-gap)}
      upcomingRect={x:inner.x,y:primaryRect.y+primaryRect.height+gap,width:inner.width,height:upcomingHeight}
    }
  }
  let heroGroupRect=primaryRect,titleRect=null,countRect,unitRect,targetDateRect=null
  if(composition.family==='horizontal'){
    const titleWidth=composition.showTitle?Math.round(primaryRect.width*.46):0
    const dateWidth=composition.showTargetDate?Math.min(110,Math.round(primaryRect.width*.2)):0
    const gap=titleWidth?12:0,metricX=primaryRect.x+titleWidth+gap,metricWidth=Math.max(1,primaryRect.width-titleWidth-gap-dateWidth)
    titleRect=titleWidth?{x:primaryRect.x,y:primaryRect.y,width:titleWidth,height:primaryRect.height}:null
    countRect={x:metricX,y:primaryRect.y,width:Math.max(1,metricWidth*.66),height:primaryRect.height}
    unitRect={x:countRect.x+countRect.width,y:primaryRect.y,width:Math.max(1,metricWidth-countRect.width),height:primaryRect.height}
    if(dateWidth)targetDateRect={x:primaryRect.x+primaryRect.width-dateWidth,y:primaryRect.y,width:dateWidth,height:primaryRect.height}
  }else{
    const grouped=composition.family==='split-horizontal'||composition.family==='expanded-vertical'
    const titleHeight=composition.showTitle?(grouped?38:Math.min(54,Math.max(28,primaryRect.height*.19))):0
    const dateHeight=composition.showTargetDate?(grouped?29:Math.min(34,Math.max(24,primaryRect.height*.12))):0
    const unitHeight=grouped?26:Math.min(34,Math.max(20,primaryRect.height*.14))
    const countHeight=grouped?Math.min(88,Math.max(64,primaryRect.width*.24)):Math.max(1,primaryRect.height-titleHeight-unitHeight-dateHeight)
    const groupHeight=Math.min(primaryRect.height,titleHeight+countHeight+unitHeight+dateHeight)
    heroGroupRect=grouped?{x:primaryRect.x,y:primaryRect.y+(primaryRect.height-groupHeight)/2,width:primaryRect.width,height:groupHeight}:primaryRect
    titleRect=titleHeight?{x:heroGroupRect.x,y:heroGroupRect.y,width:heroGroupRect.width,height:titleHeight}:null
    countRect={x:heroGroupRect.x,y:heroGroupRect.y+titleHeight,width:heroGroupRect.width,height:Math.max(1,groupHeight-titleHeight-unitHeight-dateHeight)}
    unitRect={x:primaryRect.x,y:countRect.y+countRect.height,width:primaryRect.width,height:unitHeight}
    if(dateHeight)targetDateRect={x:primaryRect.x,y:unitRect.y+unitRect.height,width:primaryRect.width,height:dateHeight}
  }
  const upcomingRows=upcomingRect?Array.from({length:composition.upcomingRows},(_,index)=>{
    const headerHeight=27,headerGap=5,rowGap=4
    const availableRowHeight=Math.floor((upcomingRect.height-headerHeight-headerGap-rowGap*(composition.upcomingRows-1))/composition.upcomingRows)
    const rowHeight=Math.min(34,Math.max(1,availableRowHeight),Math.max(28,upcomingRect.width*.085))
    const rowRect={x:upcomingRect.x,y:upcomingRect.y+headerHeight+headerGap+index*(rowHeight+rowGap),width:upcomingRect.width,height:rowHeight}
    const metricWidth=Math.min(rowRect.width*.42,110),columnGap=8
    return Object.freeze({rowRect,titleRect:{x:rowRect.x,y:rowRect.y,width:Math.max(1,rowRect.width-metricWidth-columnGap),height:rowRect.height},metricRect:{x:rowRect.x+rowRect.width-metricWidth,y:rowRect.y,width:metricWidth,height:rowRect.height}})
  }):[]
  return Object.freeze({pad,emptyRect:null,primaryRect,heroGroupRect,titleRect,countRect,unitRect,targetDateRect,upcomingRect,upcomingRows:Object.freeze(upcomingRows)})
}

/** Fit an atomic structured fact without ever shortening its value. */
export function fitCountdownStructuredText(value,width,height,measure,{maxFont=16,minFont=9}={}) {
  if(!value||width<=0||height<=0)return null
  for(let fontSize=Math.floor(maxFont);fontSize>=Math.ceil(minFont);fontSize--){
    if(fontSize<=height&&measure(value,fontSize)<=width)return Object.freeze({text:value,fontSize})
  }
  return null
}
