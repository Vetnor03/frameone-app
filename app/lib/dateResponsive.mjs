export const DATE_STUDIO_PRESET_VALUES = ['normal','long','extreme','empty']

const freezeState = value => Object.freeze({...value,holidays:Object.freeze((value.holidays??[]).map(item=>Object.freeze({...item})))})

export const dateStudioPresets = Object.freeze({
  normal:freezeState({weekday:'Wednesday',day:19,monthName:'August',month0:7,year:2026,nextMonthName:'September',nextMonth0:8,nextMonthYear:2026,holidays:[{dateLabel:'24.12',title:'Christmas Eve'}]}),
  long:freezeState({weekday:'Thursday',day:31,monthName:'December',month0:11,year:2026,nextMonthName:'January',nextMonth0:0,nextMonthYear:2027,holidays:[{dateLabel:'31.12',title:'New Year’s Eve'}]}),
  extreme:freezeState({weekday:'Wednesday',day:30,monthName:'September',month0:8,year:2099,nextMonthName:'October',nextMonth0:9,nextMonthYear:2099,holidays:[{dateLabel:'24.12',title:'Christmas Eve'},{dateLabel:'31.12',title:'New Year’s Eve'}]}),
  empty:freezeState({weekday:null,day:null,monthName:null,month0:null,year:null,holidays:[]}),
})

export const DATE_CALENDAR_MIN = Object.freeze({gridWidth:154,gridHeight:92,dowWidth:168,dowHeight:112,weekWidth:190,weekHeight:126,titleHeight:146})

export function dateCalendarFeatures(width,height,{title=false}={}) {
  if(width<DATE_CALENDAR_MIN.gridWidth||height<DATE_CALENDAR_MIN.gridHeight)return null
  const showDowHeader=width>=DATE_CALENDAR_MIN.dowWidth&&height>=DATE_CALENDAR_MIN.dowHeight
  const showWeekNums=showDowHeader&&width>=DATE_CALENDAR_MIN.weekWidth&&height>=DATE_CALENDAR_MIN.weekHeight
  const showMonthTitle=Boolean(title)&&showDowHeader&&height>=DATE_CALENDAR_MIN.titleHeight
  return Object.freeze({showMonthTitle,showWeekNums,showDowHeader})
}

/** Decide factual disclosure from measured physical space, independently of drawing. */
export function dateComposition(profile,state) {
  const available=Number.isInteger(state.day)&&Number.isInteger(state.month0)&&Number.isInteger(state.year)&&Boolean(state.weekday)&&Boolean(state.monthName)
  if(!available)return Object.freeze({available:false,family:'unavailable',showYear:false,showMonth:false,showWeekday:false,currentCalendar:null,nextCalendar:null,holidayRows:0})
  const {width,height,orientation}=profile
  const micro=width<150||height<88||(width<230&&height<140)
  const shallow=orientation==='landscape'&&height<170
  const wideLargeSingleCalendar=width>=700&&height>=330&&height<400
  let family=micro?'micro':shallow?'horizontal':'stack'
  let currentCalendar=null,nextCalendar=null,holidayRows=0
  if(width>=430&&height>=210){
    family='calendar-split'
    const calendarWidth=wideLargeSingleCalendar?Math.floor(width*.62)-18:Math.floor(width*.48)-18
    currentCalendar=dateCalendarFeatures(calendarWidth,height-32,{title:height>=300})
  }
  if(!currentCalendar&&width>=330&&height>=400){
    family='calendar-split'
    currentCalendar=dateCalendarFeatures(width-36,Math.floor(height*.44)-18,{title:true})
  }
  if(!wideLargeSingleCalendar&&((width>=700&&height>=330)||(width>=520&&height>=400))){
    family='expanded'
    const calendarWidth=Math.floor(width*.48)-18,calendarHeight=Math.floor((height-42)/2)
    currentCalendar=dateCalendarFeatures(calendarWidth,calendarHeight,{title:true})
    nextCalendar=dateCalendarFeatures(calendarWidth,calendarHeight,{title:true})
    holidayRows=Math.min(state.holidays?.length??0,height>=420?2:1)
  } else if(family==='calendar-split'&&height>=300) holidayRows=Math.min(1,state.holidays?.length??0)
  if(!currentCalendar){nextCalendar=null;family=micro?'micro':shallow?'horizontal':'stack'}
  return Object.freeze({available:true,family,showYear:!micro&&(!shallow||width>=500),showMonth:!micro||height>=105,showWeekday:true,currentCalendar,nextCalendar,holidayRows})
}

const rect=(x,y,width,height)=>Object.freeze({x,y,width:Math.max(1,width),height:Math.max(1,height)})

/** Allocate disjoint cell-local regions before any text or calendar is painted. */
export function dateLayout(profile,composition) {
  const pad=Math.max(8,Math.min(18,Math.round(Math.min(profile.width,profile.height)*.07)))
  const inner=rect(pad,pad,profile.width-pad*2,profile.height-pad*2)
  if(!composition.available)return Object.freeze({pad,emptyRect:inner,heroRect:null,heroGroupRect:null,yearRect:null,monthRect:null,dayRect:null,weekdayRect:null,calendarRect:null,nextCalendarRect:null,holidayRect:null})
  let heroRect=inner,calendarRect=null,nextCalendarRect=null,holidayRect=null
  if(composition.currentCalendar){
    const gap=18,vertical=profile.width<430&&!composition.nextCalendar
    const wideLargeSingleCalendar=profile.width>=700&&profile.height>=330&&profile.height<400&&!composition.nextCalendar
    const heroWidth=Math.floor(inner.width*(wideLargeSingleCalendar ? .38 : .48))
    heroRect=vertical?rect(inner.x,inner.y,inner.width,Math.floor(inner.height*.52)-gap/2):rect(inner.x,inner.y,heroWidth,inner.height)
    const right=vertical?rect(inner.x,heroRect.y+heroRect.height+gap,inner.width,inner.height-heroRect.height-gap):rect(inner.x+heroWidth+gap,inner.y,inner.width-heroWidth-gap,inner.height)
    if(composition.nextCalendar){
      const rowGap=14,rowH=Math.floor((right.height-rowGap)/2)
      calendarRect=rect(right.x,right.y,right.width,rowH)
      nextCalendarRect=rect(right.x,right.y+rowH+rowGap,right.width,right.height-rowH-rowGap)
    }else calendarRect=right
    if(composition.holidayRows){
      const holidayH=Math.min(82,42+composition.holidayRows*22)
      holidayRect=rect(heroRect.x,heroRect.y+heroRect.height-holidayH,heroRect.width,holidayH)
      heroRect=rect(heroRect.x,heroRect.y,heroRect.width,heroRect.height-holidayH-12)
    }
  }
  let heroGroupRect=heroRect,yearRect=null,monthRect=null,dayRect,weekdayRect
  if(composition.family==='horizontal'){
    const yearW=composition.showYear?Math.min(70,heroRect.width*.17):0
    const weekdayW=Math.min(heroRect.width*.35,180),dayW=Math.min(88,heroRect.width*.2)
    weekdayRect=rect(heroRect.x,heroRect.y,weekdayW,heroRect.height)
    dayRect=rect(weekdayRect.x+weekdayRect.width,heroRect.y,dayW,heroRect.height)
    monthRect=composition.showMonth?rect(dayRect.x+dayRect.width,heroRect.y,heroRect.width-weekdayW-dayW-yearW,heroRect.height):null
    yearRect=composition.showYear?rect(heroRect.x+heroRect.width-yearW,heroRect.y,yearW,heroRect.height):null
  }else{
    const yearH=composition.showYear?24:0,monthH=composition.showMonth?30:0,weekdayH=30
    const desired=Math.min(heroRect.height,yearH+monthH+Math.min(104,Math.max(58,heroRect.width*.38))+weekdayH)
    heroGroupRect=rect(heroRect.x,heroRect.y+(heroRect.height-desired)/2,heroRect.width,desired)
    let y=heroGroupRect.y
    if(yearH){yearRect=rect(heroRect.x,y,heroRect.width,yearH);y+=yearH}
    if(monthH){monthRect=rect(heroRect.x,y,heroRect.width,monthH);y+=monthH}
    dayRect=rect(heroRect.x,y,heroRect.width,heroGroupRect.y+heroGroupRect.height-y-weekdayH);y+=dayRect.height
    weekdayRect=rect(heroRect.x,y,heroRect.width,weekdayH)
  }
  return Object.freeze({pad,emptyRect:null,heroRect,heroGroupRect,yearRect,monthRect,dayRect,weekdayRect,calendarRect,nextCalendarRect,holidayRect})
}

/** Fit an atomic date fact. Failure means omit; factual strings are never truncated. */
export function fitDateFact(value,width,height,measure,{maxFont=18,minFont=9}={}) {
  if(value==null||value===''||width<=0||height<=0)return null
  const text=String(value)
  for(let fontSize=Math.floor(maxFont);fontSize>=Math.ceil(minFont);fontSize--)if(fontSize<=height&&measure(text,fontSize)<=width)return Object.freeze({text,fontSize})
  return null
}
