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
  normal:{spot:'Hoddevik',rating:{score:4,max:6,label:surfRatingWord(4)},waveHeight:'1.2–1.8 m',period:'12 s',swellDirection:'W',windDirection:'N',windSpeed:'5 m/s',bestWindow:{label:"TODAY'S BEST",time:'14:00–18:00'},airTemperature:'12° / 19°',waterTemperature:'14° / 16°',sunrise:'06:01',sunset:'20:32',forecast},
  long:{spot:'Unstad Beach, Lofoten',rating:{score:5,max:6,label:surfRatingWord(5)},waveHeight:'2.0–3.5 m',period:'15 s',swellDirection:'NW',windDirection:'E',windSpeed:'8 m/s',bestWindow:{label:"TODAY'S BEST",time:'15:30–19:00'},airTemperature:'8° / 14°',waterTemperature:'11° / 13°',sunrise:'05:42',sunset:'21:18',forecast:forecast.map((entry,index)=>{const ratingScore=[5,4,3,5][index];return {...entry,ratingScore,ratingLabel:surfRatingWord(ratingScore),waveHeight:['2.0–3.5 m','1.8–3.0 m','1.5–2.4 m','2.2–3.8 m'][index]}})},
  extreme:{spot:'An exceptionally long surf spot name',rating:{score:6,max:6,label:surfRatingWord(6)},waveHeight:'8.0–12.0 m',period:'22 s',swellDirection:'WNW',windDirection:'SSE',windSpeed:'18 m/s',bestWindow:{label:"TODAY'S BEST",time:'13:45–17:15'},airTemperature:'2° / 7°',waterTemperature:'7° / 9°',sunrise:'08:12',sunset:'16:04',forecast:forecast.map((entry,index)=>{const ratingScore=[6,5,4,3][index];return {...entry,ratingScore,ratingLabel:surfRatingWord(ratingScore),waveHeight:['8.0–12.0 m','6.5–9.0 m','4.0–6.5 m','3.0–4.5 m'][index],period:['22 s','20 s','18 s','16 s'][index]}})},
  empty:{spot:null,rating:{score:null,max:6,label:null},waveHeight:null,period:null,swellDirection:null,windDirection:null,windSpeed:null,bestWindow:null,airTemperature:null,waterTemperature:null,sunrise:null,sunset:null,forecast:[]},
}

export function fitSurfFact(value,width,height,measure,options={}) {
  if(value==null||value===''||!(width>0)||!(height>0))return null
  const text=String(value),maxFont=options.maxFont??18,minFont=options.minFont??9
  for(let fontSize=maxFont;fontSize>=minFont;fontSize--)if(measure(text,fontSize)<=width&&fontSize*1.2<=height)return {text,fontSize}
  return null
}

export function surfComposition(profile,state) {
  const available=state.rating.score!=null||Boolean(state.waveHeight||state.spot)
  if(!available)return {family:'empty',available:false,showSpot:false,showRating:false,showRatingLabel:false,showBlocks:false,showWave:false,showPeriod:false,showWind:false,showDirections:false,showBestWindow:false,showEnvironment:false,forecastDays:0}
  const {width,height,orientation}=profile
  let family
  if(width<250&&height<150)family='micro'
  else if(height<160)family='shallow'
  else if(width<270)family='hero'
  else if((height>=390&&width>=500)||(height>=315&&width>=700))family='expanded'
  else if((height>=360&&width>=350)||(height>=315&&width>=540))family='forecast'
  else family=orientation==='landscape'?'detail-split':'hero'
  const forecastRoom=(family==='forecast'||family==='expanded')?Math.floor((width-32)/SURF_FORECAST_MIN_COLUMN_WIDTH):0
  const forecastDays=forecastRoom>=2?Math.min(4,forecastRoom,state.forecast?.length??0):0
  return {family,available:true,showSpot:family!=='micro',showRating:state.rating.score!=null,showRatingLabel:Boolean(state.rating.label),showBlocks:family!=='micro'&&state.rating.score!=null,showWave:Boolean(state.waveHeight),showPeriod:!['micro'].includes(family)&&Boolean(state.period),showWind:['detail-split','forecast','expanded','hero'].includes(family)&&height>=220&&Boolean(state.windSpeed),showDirections:['detail-split','forecast','expanded'].includes(family)&&Boolean(state.swellDirection||state.windDirection),showBestWindow:family==='expanded'&&Boolean(state.bestWindow),showEnvironment:family==='expanded'&&width>=500&&height>=390&&Boolean(state.airTemperature||state.waterTemperature||state.sunrise||state.sunset),forecastDays}
}

const rect=(x,y,width,height)=>({x,y,width:Math.max(1,width),height:Math.max(1,height)})

export function surfLayout(profile,composition) {
  const {width:w,height:h}=profile,pad=Math.max(10,Math.min(18,w*.04))
  if(!composition.available)return {emptyRect:rect(pad,pad,w-pad*2,h-pad*2),headerRect:null,heroRect:null,ratingRect:null,ratingBlocksRect:null,waveRect:null,detailsRect:null,bestWindowRect:null,environmentRect:null,forecastRect:null,forecastColumns:[]}
  const headerH=composition.showSpot?Math.min(48,Math.max(34,h*.13)):0
  const headerRect=composition.showSpot?rect(pad,pad,w-pad*2,headerH):null
  const top=pad+headerH+(headerH?6:0),bottom=h-pad
  const forecastH=composition.forecastDays?Math.min(150,Math.max(118,h*.34)):0
  const forecastRect=forecastH?rect(pad,bottom-forecastH,w-pad*2,forecastH):null
  const contentBottom=forecastRect?forecastRect.y-10:bottom
  let heroRect,detailsRect=null,bestWindowRect=null,environmentRect=null
  if(['detail-split','forecast','expanded'].includes(composition.family)&&w>=330){
    const detailW=Math.min(w*.42,260),gap=12
    heroRect=rect(pad,top,w-pad*2-detailW-gap,contentBottom-top)
    detailsRect=rect(heroRect.x+heroRect.width+gap,top,detailW,contentBottom-top)
  }else heroRect=rect(pad,top,w-pad*2,contentBottom-top)
  if(composition.family==='hero'&&h>=220){const detailH=Math.min(72,heroRect.height*.27);detailsRect=rect(heroRect.x,heroRect.y+heroRect.height-detailH,heroRect.width,detailH);heroRect=rect(heroRect.x,heroRect.y,heroRect.width,heroRect.height-detailH-6)}
  if(composition.showBestWindow&&detailsRect){const bh=Math.min(48,detailsRect.height*.25);bestWindowRect=rect(detailsRect.x,detailsRect.y,detailsRect.width,bh);detailsRect=rect(detailsRect.x,detailsRect.y+bh+6,detailsRect.width,detailsRect.height-bh-6)}
  if(composition.showEnvironment&&detailsRect){const eh=Math.min(56,detailsRect.height*.35);environmentRect=rect(detailsRect.x,detailsRect.y+detailsRect.height-eh,detailsRect.width,eh);detailsRect=rect(detailsRect.x,detailsRect.y,detailsRect.width,detailsRect.height-eh-6)}
  if(composition.family==='shallow'){
    const y=heroRect.y,height=heroRect.height,fullWidth=heroRect.width,detailW=composition.showPeriod?fullWidth*.15:0,primaryW=fullWidth-detailW,ratingW=primaryW*.21,blocksW=primaryW*.45,waveW=primaryW-ratingW-blocksW
    heroRect=rect(heroRect.x,y,primaryW,height)
    const ratingRect=composition.showRating?rect(heroRect.x,y,ratingW,height):null,ratingBlocksRect=composition.showBlocks?rect(heroRect.x+ratingW,y,blocksW,height):null,waveRect=composition.showWave?rect(heroRect.x+ratingW+blocksW,y,waveW,height):null
    detailsRect=composition.showPeriod?rect(heroRect.x+primaryW,y,detailW,height):null
    return {emptyRect:null,headerRect,heroRect,ratingRect,ratingBlocksRect,waveRect,detailsRect,bestWindowRect:null,environmentRect:null,forecastRect:null,forecastColumns:[]}
  }
  const groupH=Math.min(heroRect.height,composition.family==='micro'?heroRect.height:Math.max(104,Math.min(180,heroRect.height*.78))),groupY=heroRect.y+(heroRect.height-groupH)/2
  const ratingH=Math.max(24,groupH*.32),blocksH=composition.showBlocks?Math.min(22,groupH*.16):0,waveH=Math.max(22,groupH*.25),gaps=composition.showBlocks?8:4,total=ratingH+blocksH+waveH+gaps*2,start=groupY+Math.max(0,(groupH-total)/2)
  const ratingRect=composition.showRating?rect(heroRect.x,start,heroRect.width,ratingH):null
  const ratingBlocksRect=composition.showBlocks?rect(heroRect.x,start+ratingH+4,heroRect.width,blocksH):null
  const waveRect=composition.showWave?rect(heroRect.x,start+ratingH+blocksH+gaps,heroRect.width,waveH):null
  const forecastColumns=[]
  if(forecastRect){const colW=forecastRect.width/composition.forecastDays;for(let i=0;i<composition.forecastDays;i++){const x=forecastRect.x+i*colW;forecastColumns.push({columnRect:rect(x,forecastRect.y,colW,forecastRect.height),dayRect:rect(x,forecastRect.y,colW,24),ratingRect:rect(x,forecastRect.y+27,colW,25),blocksRect:rect(x,forecastRect.y+56,colW,20),waveRect:rect(x,forecastRect.y+80,colW,25),periodRect:forecastRect.height>=135?rect(x,forecastRect.y+108,colW,20):null})}}
  return {emptyRect:null,headerRect,heroRect,ratingRect,ratingBlocksRect,waveRect,detailsRect,bestWindowRect,environmentRect,forecastRect,forecastColumns}
}
