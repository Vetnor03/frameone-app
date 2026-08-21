export const STOCK_RANGES=['day','week','month','year']
export const STOCK_RANGE_LABELS={day:'Day',week:'Week',month:'Month',year:'Year'}
export const STOCK_CHART_MIN_WIDTH=180
export const STOCK_CHART_MIN_HEIGHT=82

const normalSeries=[121.6,122.1,121.8,123.4,122.9,124.2,123.7,125.1,124.6,126.2,125.4,124.5]
const normal={symbol:'FRAME',name:'FRAME',currency:'NOK',price:124.50,change:2.90,changePercent:2.40,previousClose:121.60,open:123.10,high:126.20,low:121.80,selectedRange:'month',selectedRangePercent:8.40,baselinePrice:123.10,baselineSource:'open',series:normalSeries,purchasePrice:null,personalChangePercent:null}
export const stocksStudioPresets={
  normal,
  long:{...normal,symbol:'BRK.B',name:'Berkshire Hathaway Class B',currency:'USD',price:512.18,change:-2.16,changePercent:-.42,previousClose:514.34,open:514.10,high:516.22,low:510.84,selectedRange:'year',selectedRangePercent:14.72,baselinePrice:514.10,series:[448,455,449,467,462,481,476,493,487,505,518,512.18]},
  extreme:{...normal,symbol:'EXTREME',name:'An Exceptionally Long International Holdings Corporation',currency:'USD',price:999999,change:99999.99,changePercent:999.99,previousClose:900001,open:875000,high:1200000,low:410000,selectedRange:'year',selectedRangePercent:-888.88,baselinePrice:875000,series:[410000,990000,530000,1200000,640000,1110000,470000,1050000,720000,999999]},
  empty:{symbol:null,name:null,currency:null,price:null,change:null,changePercent:null,previousClose:null,open:null,high:null,low:null,selectedRange:'day',selectedRangePercent:null,baselinePrice:null,baselineSource:null,series:[],purchasePrice:null,personalChangePercent:null},
}

export function formatStockPrice(value){if(!Number.isFinite(value))return null;return Math.abs(value)>=1000?value.toFixed(0):value.toFixed(2)}
export function formatStockSigned(value,{percent=false,decimals=2}={}){if(!Number.isFinite(value))return null;const sign=value>0?'+':'';return `${sign}${value.toFixed(decimals)}${percent?'%':''}`}
export function fitStockFact(value,width,height,measure,options={}){if(value==null||value===''||!(width>0)||!(height>0))return null;const text=String(value);for(let fontSize=options.maxFont??20;fontSize>= (options.minFont??9);fontSize--)if(measure(text,fontSize)<=width&&fontSize*1.2<=height)return {text,fontSize};return null}

const finiteSeries=state=>Array.isArray(state.series)&&state.series.length>=2&&state.series.every(Number.isFinite)
export function stocksComposition(profile,state){
  const available=Number.isFinite(state.price);if(!available)return {family:'empty',available:false,showChart:false,showSelector:false,showDetails:false,detailKeys:[]}
  const {width:w,height:h,orientation}=profile
  let family;if(w<230&&h<150)family='micro';else if(h<160)family='summary-strip';else if(w<260)family='summary-stack';else if(w>=650&&h>=300)family='detail-chart';else if(h>=390&&w>=360)family='expanded';else family='chart-summary'
  const candidate=family==='detail-chart'?{width:w*.54-24,height:h-68}:family==='expanded'?{width:w-28,height:h*.40-40}:family==='chart-summary'?(orientation==='landscape'?{width:w*.55-22,height:h-54}:{width:w-28,height:h*.42-28}):{width:0,height:0}
  const showChart=finiteSeries(state)&&candidate.width>=STOCK_CHART_MIN_WIDTH&&candidate.height>=STOCK_CHART_MIN_HEIGHT
  const showDetails=['detail-chart','expanded'].includes(family)&&h>=300
  const detailKeys=['open','high','low','previousClose','change'].filter(key=>Number.isFinite(state[key]))
  return {family,available,showChart,showSelector:showChart&&candidate.width>=250&&candidate.height>=105,showDetails,detailKeys}
}

const rect=(x,y,width,height)=>({x,y,width:Math.max(1,width),height:Math.max(1,height)})
export function stocksLayout(profile,composition){
  const {width:w,height:h}=profile,pad=Math.max(9,Math.min(14,w*.035)),gap=10,blank={emptyRect:null,titleRect:null,summaryGroupRect:null,priceRect:null,dayChangeRect:null,rangeChangeRect:null,detailsRect:null,detailRowRects:[],rangeSelectorRect:null,chartRect:null}
  if(!composition.available)return {...blank,emptyRect:rect(pad,pad,w-pad*2,h-pad*2)}
  let summaryGroupRect,chartRect=null,detailsRect=null,rangeSelectorRect=null
  if(composition.family==='detail-chart'){const leftW=w*.42;summaryGroupRect=rect(pad,pad,leftW-pad,h-pad*2);chartRect=rect(leftW+gap,pad+38,w-leftW-gap-pad,h-pad*2-38);if(composition.showSelector)rangeSelectorRect=rect(chartRect.x,pad,chartRect.width,28);detailsRect=rect(summaryGroupRect.x,summaryGroupRect.y+105,summaryGroupRect.width,summaryGroupRect.height-105)}
  else if(composition.family==='expanded'){const chartH=Math.min(h*.40,h-245);summaryGroupRect=rect(pad,pad,w-pad*2,100);detailsRect=rect(pad,summaryGroupRect.y+summaryGroupRect.height+8,w-pad*2,78);if(composition.showSelector)rangeSelectorRect=rect(pad,detailsRect.y+detailsRect.height+5,w-pad*2,28);const cy=(rangeSelectorRect?rangeSelectorRect.y+rangeSelectorRect.height:detailsRect.y+detailsRect.height)+7;chartRect=rect(pad,cy,w-pad*2,h-pad-cy)}
  else if(composition.family==='chart-summary'&&profile.orientation==='landscape'){const sw=w*.40;summaryGroupRect=rect(pad,pad,sw-pad,h-pad*2);chartRect=rect(sw+gap,pad+(composition.showSelector?32:0),w-sw-gap-pad,h-pad*2-(composition.showSelector?32:0));if(composition.showSelector)rangeSelectorRect=rect(chartRect.x,pad,chartRect.width,26)}
  else if(composition.family==='chart-summary'){summaryGroupRect=rect(pad,pad,w-pad*2,108);chartRect=rect(pad,summaryGroupRect.y+summaryGroupRect.height+8,w-pad*2,h-pad-(summaryGroupRect.y+summaryGroupRect.height+8));if(composition.showSelector){rangeSelectorRect=rect(pad,chartRect.y,w-pad*2,26);chartRect=rect(pad,chartRect.y+31,w-pad*2,chartRect.height-31)}}
  else summaryGroupRect=rect(pad,pad,w-pad*2,h-pad*2)
  if(!composition.showChart){chartRect=null;rangeSelectorRect=null}
  const titleH=composition.family==='micro'?0:28,titleRect=titleH?rect(summaryGroupRect.x,summaryGroupRect.y,summaryGroupRect.width,titleH):null,contentY=summaryGroupRect.y+titleH+(titleH?5:0),contentH=Math.max(1,summaryGroupRect.y+summaryGroupRect.height-contentY)
  let priceRect,dayChangeRect,rangeChangeRect
  if(composition.family==='summary-strip'){priceRect=rect(summaryGroupRect.x,contentY,summaryGroupRect.width*.45,contentH);dayChangeRect=rect(summaryGroupRect.x+summaryGroupRect.width*.47,contentY,summaryGroupRect.width*.22,contentH);rangeChangeRect=rect(summaryGroupRect.x+summaryGroupRect.width*.71,contentY,summaryGroupRect.width*.29,contentH)}
  else {priceRect=rect(summaryGroupRect.x,contentY,summaryGroupRect.width,Math.min(54,contentH*.58));const y=priceRect.y+priceRect.height;dayChangeRect=rect(summaryGroupRect.x,y,summaryGroupRect.width*.48,Math.max(1,contentY+contentH-y));rangeChangeRect=rect(summaryGroupRect.x+summaryGroupRect.width*.5,y,summaryGroupRect.width*.5,Math.max(1,contentY+contentH-y))}
  if(composition.family==='micro')rangeChangeRect=null
  const detailRowRects=[];if(detailsRect&&composition.showDetails){const columns=composition.family==='expanded'?3:1,rowCount=Math.ceil(composition.detailKeys.length/columns),rowH=detailsRect.height/Math.max(1,rowCount);for(let i=0;i<composition.detailKeys.length;i++){const col=i%columns,row=Math.floor(i/columns),cw=detailsRect.width/columns;detailRowRects.push(rect(detailsRect.x+col*cw,detailsRect.y+row*rowH,cw,rowH))}}
  return {...blank,titleRect,summaryGroupRect,priceRect,dayChangeRect,rangeChangeRect,detailsRect,detailRowRects,rangeSelectorRect,chartRect}
}

export function stockReferenceLine(state){if(!Number.isFinite(state.baselinePrice)||!finiteSeries(state))return null;const min=Math.min(...state.series),max=Math.max(...state.series);return state.baselinePrice>=min&&state.baselinePrice<=max?state.baselinePrice:null}
