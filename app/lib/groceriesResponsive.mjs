const item=(name,quantity=1)=>({name,quantity})
const dinner=(date,dayLabel,title)=>({date,dayLabel,title})
const base={status:'ok',header:'Grocery List',emptyPhrase:'All set',todayDate:'2026-08-21',rotationOffset:0}

export const GROCERIES_MENU_MIN_WIDTH=250
export const GROCERIES_MENU_MIN_HEIGHT=180
export const groceriesStudioPresets={
  normal:{...base,items:[item('Milk',2),item('Bread'),item('Apples'),item('Coffee'),item('Rice'),item('Soap')],dinners:[dinner('2026-08-21','Fri','Tacos tonight'),dinner('2026-08-22','Sat','Pasta'),dinner('2026-08-23','Sun','Curry'),dinner('2026-08-24','Mon','Soup')],runningLow:[{name:'Coffee',label:'Low soon'},{name:'Rice',label:'1 day left'}],mealIdeas:[{name:'Tacos',missing:['salsa']},{name:'Curry',missing:['coconut milk']}]},
  long:{...base,items:[item('Extra virgin olive oil',2),item('Wholegrain sourdough bread'),item('Laundry detergent sensitive skin'),item('Organic oat milk'),item('Free-range eggs'),item('Fairtrade ground coffee')],dinners:[dinner('2026-08-21','Fri','Slow-cooked chicken tikka masala'),dinner('2026-08-22','Sat','Roasted Mediterranean vegetable lasagne'),dinner('2026-08-23','Sun','Homemade mushroom and thyme risotto')],runningLow:[{name:'Extra virgin olive oil',label:'Running low soon'},{name:'Laundry detergent',label:'About one wash left'}],mealIdeas:[{name:'Roasted cauliflower and chickpea tacos',missing:['fresh coriander','smoked paprika']},{name:'Creamy coconut vegetable curry',missing:['coconut milk','lime']}]},
  extreme:{...base,rotationOffset:2,items:[item('Extra-large family-size ultra-soft bathroom tissue multipack',12),item('Cold-pressed extra virgin olive oil from the southern grove',3),item('Hypoallergenic laundry detergent for sensitive skin',2),item('Stoneground wholegrain sourdough bread'),item('Organic barista oat drink'),item('Seasonal orchard apples',6),item('Fairtrade dark-roast coffee beans',4),item('Long-grain brown rice',2),item('Unscented dishwashing soap'),item('Free-range eggs',12),item('Fresh coriander'),item('Smoked paprika'),item('Coconut milk',4),item('Persian limes',8)],dinners:[dinner('2026-08-20','Thu','Yesterday stew'),dinner('2026-08-21','Fri','An exceptionally elaborate family celebration dinner'),dinner('2026-08-22','Sat','Slow-cooked aubergine and chickpea tagine'),dinner('2026-08-23','Sun','Handmade spinach and ricotta ravioli'),dinner('2026-08-24','Mon','Roasted cauliflower tacos with pickled onions'),dinner('2026-08-25','Tue','Wild mushroom barley risotto'),dinner('2026-08-26','Wed','Coconut lentil curry with flatbreads')],runningLow:[{name:'Fairtrade dark-roast coffee beans',label:'Likely to run out before the next weekly shop'},{name:'Long-grain brown rice',label:'Only enough for one family dinner remains'},{name:'Unscented dishwashing soap',label:'Bottle is almost completely empty'},{name:'Hidden fourth',label:'Must not render'}],mealIdeas:[{name:'Roasted cauliflower tacos with avocado crema',missing:['fresh coriander','smoked paprika','avocado']},{name:'Slow-cooked coconut and tamarind vegetable curry',missing:['coconut milk','tamarind paste','lime']},{name:'Hidden third recipe',missing:[]}]},
  empty:{...base,items:[],dinners:[],runningLow:[],mealIdeas:[]},
}

export function formatGroceryItem(value){return value.quantity>1?`${value.quantity}x ${value.name}`:value.name}
export function groceriesTodayDinner(state){return state.dinners.find(value=>value.date===state.todayDate)??null}
export function groceriesFutureDinners(state){return state.dinners.filter(value=>value.date>state.todayDate).slice().sort((a,b)=>a.date.localeCompare(b.date))}
export function selectGroceryItems(state,count){const length=state.items.length;if(!length||count<=0)return [];const start=((state.rotationOffset??0)%length+length)%length;return Array.from({length:Math.min(count,length)},(_,index)=>state.items[(start+index)%length])}

export function fitGroceryText(itemValue,width,measure,{fontSize=14,ellipsis='…'}={}){
  const quantity=itemValue.quantity>1?`${itemValue.quantity}x `:''
  if(measure(quantity,fontSize)>width)return null
  if(measure(quantity+itemValue.name,fontSize)<=width)return {quantity:quantity.trimEnd(),name:itemValue.name,text:quantity+itemValue.name,truncated:false}
  let lo=0,hi=itemValue.name.length
  while(lo<hi){const mid=Math.ceil((lo+hi)/2),candidate=itemValue.name.slice(0,mid).trimEnd()+ellipsis;if(measure(quantity+candidate,fontSize)<=width)lo=mid;else hi=mid-1}
  const name=lo?itemValue.name.slice(0,lo).trimEnd()+ellipsis:''
  return {quantity:quantity.trimEnd(),name,text:quantity+name,truncated:true}
}

export function fitGroceriesText(value,width,measure,{fontSize=14,ellipsis='…'}={}){
  const text=String(value??'')
  if(measure(text,fontSize)<=width)return {text,truncated:false}
  let lo=0,hi=text.length
  while(lo<hi){const mid=Math.ceil((lo+hi)/2),candidate=text.slice(0,mid).trimEnd()+ellipsis;if(measure(candidate,fontSize)<=width)lo=mid;else hi=mid-1}
  return {text:lo?text.slice(0,lo).trimEnd()+ellipsis:'',truncated:true}
}

export function fitRunningLowText(value,width,measure,{fontSize=13}={}){
  const full=value.label?`${value.name} — ${value.label}`:value.name
  if(measure(full,fontSize)<=width)return {text:full,labelShown:Boolean(value.label),nameTruncated:false}
  const name=fitGroceriesText(value.name,width,measure,{fontSize})
  return {text:name.text,labelShown:false,nameTruncated:name.truncated}
}

export function fitMealIdeaText(value,width,measure,{fontSize=13}={}){
  const missing=value.missing.slice(0,2)
  for(let count=missing.length;count>=1;count--){const text=`${value.name} · missing: ${missing.slice(0,count).join(', ')}`;if(measure(text,fontSize)<=width)return {text,missingShown:count,titleTruncated:false}}
  const title=fitGroceriesText(value.name,width,measure,{fontSize})
  return {text:title.text,missingShown:0,titleTruncated:title.truncated}
}

export function groceriesComposition(profile,state){
  const empty=state.status==='ok'&&!state.items.length&&!state.dinners.length&&!state.runningLow.length&&!state.mealIdeas.length
  if(state.status==='failed'||empty)return {family:'empty',failed:state.status==='failed',todayDinner:null,futureDinners:[],showMenu:false,showRunningLow:false,showMealIdeas:false,columns:1,horizontal:false}
  const {width:w,height:h,orientation}=profile
  let family
  if(w<230&&h<150)family='micro';else if(h<165)family='item-strip';else if(w<270)family='list-stack';else if((w>=620&&h>=300)||(w>=360&&h>=390))family='expanded';else if(w>=480&&h>=190)family='list-menu';else family='list-columns'
  const futureDinners=groceriesFutureDinners(state),todayDinner=groceriesTodayDinner(state)
  const showMenu=(family==='list-menu'||(family==='expanded'&&w>=700))&&w>=GROCERIES_MENU_MIN_WIDTH*2&&h>=GROCERIES_MENU_MIN_HEIGHT&&futureDinners.length>=2
  const showRunningLow=family==='expanded'&&h>=300&&state.runningLow.length>0
  const showMealIdeas=family==='expanded'&&w>=700&&h>=390&&state.mealIdeas.length>0
  return {family,failed:false,todayDinner,futureDinners,showMenu,showRunningLow,showMealIdeas,columns:family==='list-columns'&&w>=360?2:1,horizontal:family==='item-strip'}
}

const rect=(x,y,width,height)=>({x,y,width:Math.max(1,width),height:Math.max(1,height)})
export function groceriesLayout(profile,composition,state){
  const {width:w,height:h}=profile,pad=Math.max(9,Math.min(14,w*.035)),gap=12,blank={emptyRect:null,headerRect:null,todayLabelRect:null,titleRect:null,groceryHeading:state.header,groceryRect:null,groceryRows:[],overflowRect:null,menuRect:null,menuHeaderRect:null,menuHeading:null,menuRows:[],runningLowRect:null,runningLowRows:[],mealIdeasRect:null,mealIdeaGroups:[],dividers:[]}
  if(composition.family==='empty')return {...blank,emptyRect:rect(pad,pad,w-pad*2,h-pad*2),headerRect:rect(pad,pad,w-pad*2,28)}
  const showTodayDinnerInGroceryHeader=Boolean(composition.todayDinner)&&!composition.showMenu
  const groceryHeading=showTodayDinnerInGroceryHeader?composition.todayDinner.title:state.header
  const menuHeading=composition.showMenu?(composition.todayDinner?.title??'WEEKLY MENU'):null
  const headerH=showTodayDinnerInGroceryHeader&&composition.family!=='item-strip'&&composition.family!=='micro'?48:32
  const alignedThreeByFour=profile.colSpan===3&&profile.rowSpan===4&&composition.showRunningLow&&!composition.showMealIdeas
  let topH=h-pad*2,bottomY=null,bottomH=0
  if((composition.showRunningLow||composition.showMealIdeas)&&!alignedThreeByFour){bottomH=Math.min(116,h*.31);topH-=bottomH+gap;bottomY=pad+topH+gap}
  let groceryRect,menuRect=null
  if(composition.showMenu){const leftW=Math.max(w*.54,GROCERIES_MENU_MIN_WIDTH);groceryRect=rect(pad,pad,leftW-pad,topH);menuRect=rect(leftW+gap,pad,w-leftW-gap-pad,topH)}else if(alignedThreeByFour)groceryRect=rect(pad,pad,(w-pad*2-gap)*.68,topH);else groceryRect=rect(pad,pad,w-pad*2,topH)
  const headerRect=rect(groceryRect.x,groceryRect.y,groceryRect.width,headerH)
  const todayLabelRect=showTodayDinnerInGroceryHeader&&headerH>32?rect(headerRect.x,headerRect.y,headerRect.width,16):null
  const titleRect=rect(headerRect.x,headerRect.y+(todayLabelRect?16:0),headerRect.width,headerRect.height-(todayLabelRect?16:0))
  const overflowH=18,rowGap=5,listY=headerRect.y+headerRect.height+8,listH=Math.max(1,groceryRect.y+groceryRect.height-listY),rowH=composition.horizontal?Math.max(1,listH-(state.items.length>3?overflowH:0)):22
  const columns=composition.horizontal?Math.min(3,Math.max(1,state.items.length)):composition.columns
  const unreservedCapacity=composition.horizontal?Math.min(3,columns):Math.max(1,Math.floor(listH/(rowH+rowGap))*columns)
  let capacity=state.items.length<=unreservedCapacity?unreservedCapacity:composition.horizontal?Math.min(3,columns):Math.max(1,Math.floor((listH-overflowH)/(rowH+rowGap))*columns)
  capacity=Math.min(12,capacity,state.items.length)
  const visible=selectGroceryItems(state,capacity),overflow=Math.max(0,state.items.length-visible.length),reserve=overflow?overflowH:0
  const groceryRows=[]
  if(composition.horizontal){const cw=groceryRect.width/Math.max(1,visible.length);visible.forEach((value,index)=>groceryRows.push({item:value,itemRect:rect(groceryRect.x+index*cw,listY,cw,rowH),quantityRect:null,nameRect:null}))}
  else {const perCol=Math.ceil(visible.length/columns),cw=groceryRect.width/columns;visible.forEach((value,index)=>{const col=Math.floor(index/perCol),row=index%perCol,itemRect=rect(groceryRect.x+col*cw,listY+row*(rowH+rowGap),cw,rowH),quantityW=value.quantity>1?34:0;groceryRows.push({item:value,itemRect,quantityRect:quantityW?rect(itemRect.x+14,itemRect.y,quantityW,itemRect.height):null,nameRect:rect(itemRect.x+14+quantityW,itemRect.y,itemRect.width-20-quantityW,itemRect.height)})})}
  const overflowRect=overflow?rect(groceryRect.x,groceryRect.y+groceryRect.height-reserve,groceryRect.width,reserve):null
  let menuHeaderRect=null,menuRows=[]
  if(menuRect){menuHeaderRect=rect(menuRect.x,menuRect.y,menuRect.width,32);const menuRowH=24,max=Math.min(composition.futureDinners.length,Math.floor((menuRect.height-38)/menuRowH));menuRows=composition.futureDinners.slice(0,max).map((value,index)=>({dinner:value,rect:rect(menuRect.x,menuRect.y+38+index*menuRowH,menuRect.width,menuRowH)}))}
  let runningLowRect=null,runningLowRows=[],mealIdeasRect=null,mealIdeaGroups=[]
  if(alignedThreeByFour){runningLowRect=rect(groceryRect.x+groceryRect.width+gap,pad,w-pad-(groceryRect.x+groceryRect.width+gap),topH);runningLowRows=state.runningLow.slice(0,3).map((value,index)=>({item:value,rect:rect(runningLowRect.x,runningLowRect.y+30+index*24,runningLowRect.width,22)}))}
  else if(bottomY!==null){const both=composition.showRunningLow&&composition.showMealIdeas,half=both?(w-gap)/2:w;if(composition.showRunningLow){runningLowRect=rect(pad,bottomY,half-pad,bottomH);runningLowRows=state.runningLow.slice(0,3).map((value,index)=>({item:value,rect:rect(runningLowRect.x,runningLowRect.y+30+index*24,runningLowRect.width,22)}))}if(composition.showMealIdeas){mealIdeasRect=both?rect(half+gap,bottomY,w-half-gap-pad,bottomH):rect(pad,bottomY,w-pad*2,bottomH);mealIdeaGroups=state.mealIdeas.slice(0,2).map((value,index)=>({idea:value,rect:rect(mealIdeasRect.x,mealIdeasRect.y+30+index*38,mealIdeasRect.width,36)}))}}
  return {...blank,headerRect,todayLabelRect,titleRect,groceryHeading,groceryRect,groceryRows,overflowRect,menuRect,menuHeaderRect,menuHeading,menuRows,runningLowRect,runningLowRows,mealIdeasRect,mealIdeaGroups,dividers:menuRect?[{x1:menuRect.x-gap/2,y1:pad,x2:menuRect.x-gap/2,y2:pad+topH}]:[]}
}
