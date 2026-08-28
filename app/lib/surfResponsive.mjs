export const SURF_FORECAST_MIN_COLUMN_WIDTH = 112

export function surfRatingWord(score) {
  switch (Math.round(Number(score) || 0)) {
    case 1: return 'Flat'
    case 2: return 'Poor'
    case 3: return 'Poor to Fair'
    case 4: return 'Fair'
    case 5: return 'Good'
    case 6: return 'Epic'
    default: return null
  }
}

const forecast = [
  {day:'Thu',ratingScore:4,ratingLabel:surfRatingWord(4),waveHeight:'1.2–1.8 m',period:'12 s'},
  {day:'Fri',ratingScore:3,ratingLabel:surfRatingWord(3),waveHeight:'1.0–1.5 m',period:'11 s'},
  {day:'Sat',ratingScore:5,ratingLabel:surfRatingWord(5),waveHeight:'1.6–2.2 m',period:'14 s'},
  {day:'Sun',ratingScore:2,ratingLabel:surfRatingWord(2),waveHeight:'0.8–1.2 m',period:'9 s'},
]

export const surfStudioPresets = {
  normal:{spot:'Hoddevik',rating:{score:4,max:6,label:surfRatingWord(4)},waveHeight:'1.2–1.8 m',period:'12 s',swellDirection:'W',windDirection:'N',windSpeed:'5 m/s',todaysBest:false,bestWindow:{label:"TODAY'S BEST",time:'14:00–18:00'},airTemperature:'12° / 19°',waterTemperature:'14° / 16°',sunrise:'06:01',sunset:'20:32',forecast},
  long:{spot:'Unstad Beach, Lofoten',rating:{score:5,max:6,label:surfRatingWord(5)},waveHeight:'2.0–3.5 m',period:'15 s',swellDirection:'NW',windDirection:'E',windSpeed:'8 m/s',todaysBest:false,bestWindow:{label:"TODAY'S BEST",time:'15:30–19:00'},airTemperature:'8° / 14°',waterTemperature:'11° / 13°',sunrise:'05:42',sunset:'21:18',forecast:forecast.map((entry,index)=>{const ratingScore=[5,4,3,5][index];return {...entry,ratingScore,ratingLabel:surfRatingWord(ratingScore),waveHeight:['2.0–3.5 m','1.8–3.0 m','1.5–2.4 m','2.2–3.8 m'][index]}})},
  extreme:{spot:'An exceptionally long surf spot name',rating:{score:6,max:6,label:surfRatingWord(6)},waveHeight:'8.0–12.0 m',period:'22 s',swellDirection:'WNW',windDirection:'SSE',windSpeed:'18 m/s',todaysBest:false,bestWindow:{label:"TODAY'S BEST",time:'13:45–17:15'},airTemperature:'2° / 7°',waterTemperature:'7° / 9°',sunrise:'08:12',sunset:'16:04',forecast:forecast.map((entry,index)=>{const ratingScore=[6,5,4,3][index];return {...entry,ratingScore,ratingLabel:surfRatingWord(ratingScore),waveHeight:['8.0–12.0 m','6.5–9.0 m','4.0–6.5 m','3.0–4.5 m'][index],period:['22 s','20 s','18 s','16 s'][index]}})},
  empty:{spot:null,rating:{score:null,max:6,label:null},waveHeight:null,period:null,swellDirection:null,windDirection:null,windSpeed:null,todaysBest:false,bestWindow:null,airTemperature:null,waterTemperature:null,sunrise:null,sunset:null,forecast:[]},
}

export function fitSurfFact(value,width,height,measure,options={}) {
  if(value==null||value===''||!(width>0)||!(height>0))return null
  const text=String(value),maxFont=options.maxFont??18,minFont=options.minFont??9
  for(let fontSize=maxFont;fontSize>=minFont;fontSize--)if(measure(text,fontSize)<=width&&fontSize*1.2<=height)return {text,fontSize}
  return null
}

export function surfComposition(profile,state) {
  const available=state.rating.score!=null||Boolean(state.waveHeight||state.spot)
  const empty={family:'empty',available:false,showSpot:false,showRatingWord:false,showRatingVisual:false,showWaveRange:false,showDetails:false,showDirections:false,showTrend:false,showTodaysBestLabel:false,todaysBestLabelMode:'none',daypartCount:0,dailyCount:0,splitPercent:0,requestedDataNeeds:{dayparts:false,daily:false},showRating:false,showRatingLabel:false,showBlocks:false,showWave:false,showPeriod:false,showWind:false,showBestWindow:false,showEnvironment:false,forecastDays:0}
  if(!available)return empty
  const {width,height}=profile,pad=Math.max(8,Math.min(18,Math.min(width,height)*.06)),innerW=Math.max(1,width-pad*2),innerH=Math.max(1,height-pad*2)
  const requestedDataNeeds={dayparts:(width>=330&&height>=210)||(width>=250&&height>=300),daily:width>=500&&height>=390&&width*height>=210000};if(requestedDataNeeds.daily)requestedDataNeeds.dayparts=true
  const availableDayparts=Math.min(4,state.dayparts?.length??0),availableDaily=Math.min(5,state.daily?.length??state.forecast?.length??0)
  let family
  if(innerH<145&&innerW>=300)family='shallow-wide'
  else if(requestedDataNeeds.daily)family='expanded-daily'
  else if(requestedDataNeeds.dayparts&&availableDayparts&&innerW>=420&&innerH>=250)family='daypart-enhanced'
  else if(innerW>=360&&innerH>=195)family='split'
  else family='stacked'
  const estimate=(value,font)=>{let units=0;for(const ch of String(value??'')){if('ilI1.,:; '.includes(ch))units+=3;else if('MW@'.includes(ch))units+=9;else units+=ch.codePointAt(0)>127?7:7}return Math.ceil(units*(font===18?2.05:font===12?1.42:1.08))}
  const heroW=['split','daypart-enhanced','expanded-daily'].includes(family)?Math.floor(innerW*.54):innerW,visualW=state.ratingFromExperience||state.rating?.experienceBased?104:122
  const primaryInline=estimate(state.rating.label,12)+estimate(state.waveHeight,12)+visualW+32
  const showRatingWord=Boolean(state.rating.label)&&(family!=='shallow-wide'||primaryInline<=innerW),showWaveRange=Boolean(state.waveHeight),showRatingVisual=heroW>=105&&innerH>=56
  const showSpot=Boolean(state.spot)&&innerH>=105&&estimate(state.spot,innerH>=190?12:9)<=innerW
  const anyDetail=Boolean(state.period||state.windSpeed),showDetails=family==='shallow-wide'?anyDetail&&innerW-primaryInline>=62:family==='stacked'?anyDetail&&innerH>=205:anyDetail&&innerW-heroW>=120
  const showDirections=showDetails&&Boolean(state.swellDirection||state.windDirection)&&((family==='stacked'&&innerH>=270)||['split','daypart-enhanced','expanded-daily'].includes(family))
  const showTrend=Boolean(state.trend)&&innerW>=300&&innerH>=175
  let showTodaysBestLabel=Boolean(state.todaysBest)&&innerH>=90,todaysBestLabelMode=showTodaysBestLabel&&(innerW>=430&&innerH>=220)?'spacious':showTodaysBestLabel?'compact':'none'
  if(family==='shallow-wide'&&innerW<primaryInline+90){showTodaysBestLabel=false;todaysBestLabelMode='none'}
  let daypartCount=0;if(['daypart-enhanced','expanded-daily'].includes(family)){const panelW=Math.floor(innerW*.46)-10,byWidth=panelW>=360?4:panelW>=190?2:panelW>=92?1:0,byHeight=innerH>=250?4:innerH>=150?2:innerH>=82?1:0;daypartCount=Math.min(availableDayparts,byWidth,byHeight)}
  let dailyCount=0;if(family==='expanded-daily'){const capacity=Math.floor(innerW/SURF_FORECAST_MIN_COLUMN_WIDTH);dailyCount=capacity>=2?Math.min(availableDaily,5,capacity):0}
  return {family,available:true,showSpot,showRatingWord,showRatingVisual,showWaveRange,showDetails,showDirections,showTrend,showTodaysBestLabel,todaysBestLabelMode,daypartCount,dailyCount,splitPercent:['split','daypart-enhanced','expanded-daily'].includes(family)?54:0,requestedDataNeeds,
    showRating:state.rating.score!=null,showRatingLabel:showRatingWord,showBlocks:showRatingVisual,showWave:showWaveRange,showPeriod:showDetails&&Boolean(state.period),showWind:showDetails&&Boolean(state.windSpeed),showBestWindow:showTodaysBestLabel,showEnvironment:false,forecastDays:dailyCount}
}

const rect=(x,y,width,height)=>({x,y,width:Math.max(1,width),height:Math.max(1,height)})

export function surfLayout(profile,composition) {
  const {width:w,height:h}=profile,pad=Math.max(10,Math.min(18,w*.04))
  const empty={emptyRect:rect(pad,pad,w-pad*2,h-pad*2),headerRect:null,heroRect:null,ratingRect:null,ratingBlocksRect:null,waveRect:null,detailsRect:null,bestWindowRect:null,environmentRect:null,daypartRect:null,dailyRect:null,forecastRect:null,daypartColumns:[],dailyColumns:[],forecastColumns:[]}
  if(!composition.available)return empty
  const bestH=composition.showTodaysBestLabel?22:0
  const bestWindowRect=bestH?rect(pad,pad,w-pad*2,bestH):null
  const headerH=composition.showSpot?Math.min(42,Math.max(30,h*.11)):0
  const headerY=pad+bestH+(bestH?4:0)
  const headerRect=composition.showSpot?rect(pad,headerY,w-pad*2,headerH):null
  const top=headerY+headerH+(headerH?6:0),bottom=h-pad
  const dailyH=composition.dailyCount?Math.min(145,Math.max(104,h*.32)):0
  const dailyRect=dailyH?rect(pad,bottom-dailyH,w-pad*2,dailyH):null
  const contentBottom=dailyRect?dailyRect.y-10:bottom
  let heroRect,detailsRect=null,daypartRect=null,environmentRect=null
  if(['split','daypart-enhanced','expanded-daily'].includes(composition.family)&&w>=330){
    const gap=12,heroW=(w-pad*2-gap)*composition.splitPercent/100
    heroRect=rect(pad,top,heroW,contentBottom-top)
    const detailX=heroRect.x+heroRect.width+gap
    const sideW=w-pad-detailX
    if(composition.daypartCount)daypartRect=rect(detailX,top,sideW,contentBottom-top)
    else if(composition.showDetails)detailsRect=rect(detailX,top,sideW,contentBottom-top)
    if(composition.daypartCount&&composition.showDetails){const detailH=Math.min(78,Math.max(50,(contentBottom-top)*.3));detailsRect=rect(detailX,top,sideW,detailH);daypartRect=rect(detailX,top+detailH+6,sideW,contentBottom-top-detailH-6)}
  }else heroRect=rect(pad,top,w-pad*2,contentBottom-top)
  if(composition.family==='stacked'&&composition.showDetails){const detailH=Math.min(72,heroRect.height*.27);detailsRect=rect(heroRect.x,heroRect.y+heroRect.height-detailH,heroRect.width,detailH);heroRect=rect(heroRect.x,heroRect.y,heroRect.width,heroRect.height-detailH-6)}
  if(composition.showEnvironment&&detailsRect){const eh=Math.min(56,detailsRect.height*.35);environmentRect=rect(detailsRect.x,detailsRect.y+detailsRect.height-eh,detailsRect.width,eh);detailsRect=rect(detailsRect.x,detailsRect.y,detailsRect.width,detailsRect.height-eh-6)}
  if(composition.family==='shallow-wide'){
    const y=heroRect.y,height=heroRect.height,fullWidth=heroRect.width,detailW=composition.showDetails?fullWidth*.15:0,primaryW=fullWidth-detailW,ratingW=primaryW*.21,blocksW=primaryW*.45,waveW=primaryW-ratingW-blocksW
    heroRect=rect(heroRect.x,y,primaryW,height)
    const ratingRect=composition.showRating?rect(heroRect.x,y,ratingW,height):null,ratingBlocksRect=composition.showBlocks?rect(heroRect.x+ratingW,y,blocksW,height):null,waveRect=composition.showWave?rect(heroRect.x+ratingW+blocksW,y,waveW,height):null
    detailsRect=composition.showDetails?rect(heroRect.x+primaryW,y,detailW,height):null
    return {emptyRect:null,headerRect,heroRect,ratingRect,ratingBlocksRect,waveRect,detailsRect,bestWindowRect,environmentRect:null,daypartRect:null,dailyRect:null,forecastRect:null,daypartColumns:[],dailyColumns:[],forecastColumns:[]}
  }
  const groupH=Math.min(heroRect.height,Math.max(104,Math.min(180,heroRect.height*.78))),groupY=heroRect.y+(heroRect.height-groupH)/2
  const ratingH=Math.max(24,groupH*.32),blocksH=composition.showBlocks?Math.min(22,groupH*.16):0,waveH=Math.max(22,groupH*.25),gaps=composition.showBlocks?8:4,total=ratingH+blocksH+waveH+gaps*2,start=groupY+Math.max(0,(groupH-total)/2)
  const ratingRect=composition.showRating?rect(heroRect.x,start,heroRect.width,ratingH):null
  const ratingBlocksRect=composition.showBlocks?rect(heroRect.x,start+ratingH+4,heroRect.width,blocksH):null
  const waveRect=composition.showWave?rect(heroRect.x,start+ratingH+blocksH+gaps,heroRect.width,waveH):null
  const columns=(region,count)=>{if(!region||!count)return[];const colW=region.width/count;return Array.from({length:count},(_,i)=>{const x=region.x+i*colW;return {columnRect:rect(x,region.y,colW,region.height),dayRect:rect(x,region.y,colW,22),ratingRect:rect(x,region.y+24,colW,23),blocksRect:rect(x,region.y+49,colW,18),waveRect:rect(x,region.y+69,colW,23),periodRect:region.height>=118?rect(x,region.y+94,colW,18):null}})}
  const daypartColumns=columns(daypartRect,composition.daypartCount),dailyColumns=columns(dailyRect,composition.dailyCount)
  return {emptyRect:null,headerRect,heroRect,ratingRect,ratingBlocksRect,waveRect,detailsRect,bestWindowRect,environmentRect,daypartRect,dailyRect,forecastRect:dailyRect,daypartColumns,dailyColumns,forecastColumns:dailyColumns}
}
