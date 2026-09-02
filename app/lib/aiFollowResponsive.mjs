const update=(id,watchId,topicTitle,summary,createdAt,isRead=false)=>({id,watchId,topicTitle,summary,createdAt,isRead})

export const aiFollowStudioPresets={
  normal:{followingCount:4,updates:[update('house-1','house','House search','New listing matches your saved filters','2026-08-21T10:00:00.000Z')]},
  long:{followingCount:6,updates:[
    update('house-2','house','House search','A new listing matches your saved filters and preferred area','2026-08-21T12:00:00.000Z'),
    update('paper-1','paper','E-paper displays','A new monochrome display option has become available','2026-08-21T11:00:00.000Z'),
    update('competitor-1','competitors','RE:MIND competitors','A new ambient home display product has been announced','2026-08-21T10:00:00.000Z'),
  ]},
  extreme:{followingCount:12,updates:[
    update('house-old','house','House search','An older listing matched your filters','2026-08-21T08:00:00.000Z'),
    update('house-new','house','House search','A newly available listing matches your saved filters and preferred area','2026-08-21T14:00:00.000Z'),
    update('paper-1','paper','International e-paper manufacturing developments','A newly available manufacturing process may support unusually efficient displays across a broad range of ambient products','2026-08-21T13:00:00.000Z'),
    update('competitor-1','competitors','RE:MIND competitors','A new ambient home display product has been announced','2026-08-21T12:00:00.000Z'),
    update('battery-1','battery','Battery technology','A new low-power controller option has become available','2026-08-21T11:00:00.000Z'),
    update('home-1','home','Ambient homes','A new installation approach has been documented','2026-08-21T10:00:00.000Z'),
    update('materials-1','materials','Display materials','A new material sample has been listed','2026-08-21T09:00:00.000Z'),
    update('read-only','read-only','Already read topic','This current update has been read','2026-08-21T15:00:00.000Z',true),
    update('suppressed-old','suppressed','Suppressed watch','This older unread update must not resurface','2026-08-21T07:00:00.000Z'),
    update('suppressed-new','suppressed','Suppressed watch','This newer current update is read','2026-08-21T16:00:00.000Z',true),
  ]},
  empty:{followingCount:4,updates:[]},
}

const time=value=>Date.parse(value.createdAt)

/** Select current-per-Watch first, then apply read state and deterministic freshness. */
export function selectCurrentAiFollowUpdates(state){
  const current=new Map()
  for(const candidate of state.updates){const previous=current.get(candidate.watchId);if(!previous||time(candidate)>time(previous)||(time(candidate)===time(previous)&&candidate.id.localeCompare(previous.id)>0))current.set(candidate.watchId,candidate)}
  return [...current.values()].filter(candidate=>!candidate.isRead).sort((a,b)=>time(b)-time(a)||a.watchId.localeCompare(b.watchId)||a.id.localeCompare(b.id))
}

export function fitAiFollowTitle(value,width,measure,{fontSize=14,ellipsis='…'}={}){
  const text=String(value??'')
  if(measure(text,fontSize)<=width)return {text,truncated:false}
  let lo=0,hi=text.length
  while(lo<hi){const mid=Math.ceil((lo+hi)/2),candidate=text.slice(0,mid).trimEnd()+ellipsis;if(measure(candidate,fontSize)<=width)lo=mid;else hi=mid-1}
  return {text:lo?text.slice(0,lo).trimEnd()+ellipsis:'',truncated:true}
}

export function wrapAiFollowSummary(value,width,maxLines,measure,{fontSize=13,ellipsis='…'}={}){
  const words=String(value??'').trim().split(/\s+/).filter(Boolean)
  if(maxLines<=0||!words.length)return {lines:[],truncated:words.length>0}
  const lines=[];let index=0
  while(index<words.length&&lines.length<maxLines){let line=words[index++]
    if(measure(line,fontSize)>width){const fit=fitAiFollowTitle(line,width,measure,{fontSize,ellipsis});lines.push(fit.text);continue}
    while(index<words.length&&measure(`${line} ${words[index]}`,fontSize)<=width)line+=` ${words[index++]}`
    lines.push(line)
  }
  const truncated=index<words.length
  if(truncated){let base=lines.at(-1)??'';while(base&&measure(base+ellipsis,fontSize)>width)base=base.replace(/(?:\s+\S+|.$)/,'').trimEnd();lines[lines.length-1]=base?base+ellipsis:fitAiFollowTitle(words[index-1],width,measure,{fontSize,ellipsis}).text}
  return {lines,truncated}
}

export function aiFollowComposition(profile,state){
  const updates=selectCurrentAiFollowUpdates(state),{width,height}=profile
  if(!updates.length)return {family:'quiet',mode:state.followingCount===0?'zero-follow':'no-change',updates,summaryLines:0}
  let family='list';if(height<135&&width<240)family='micro';else if(height<165)family='shallow';else if(height<245)family='single';else if(height>=390&&width>=360)family='expanded'
  const summaryLines=family==='micro'||family==='shallow'?1:family==='single'?Math.min(3,height>=190?2:1):2
  return {family,mode:'updates',updates,summaryLines}
}

const rect=(x,y,width,height)=>({x,y,width:Math.max(1,width),height:Math.max(1,height)})
export function aiFollowLayout(profile,composition){
  const {width,height}=profile,pad=Math.max(8,Math.min(14,width*.035)),headerH=30,headerRect=rect(pad,pad,width-pad*2,headerH)
  const blank={headerRect,quietPrimaryRect:null,quietSecondaryRect:null,updatesRect:null,updateGroups:[],overflowRect:null}
  if(composition.mode!=='updates'){
    const primaryH=24,secondaryH=20,showSecondary=height>=155||width>=360
    if(showSecondary&&height<155){
      const top=headerRect.y+headerRect.height+12,gap=14,columnW=(width-pad*2-gap)/2
      return {...blank,quietPrimaryRect:rect(pad,top,columnW,primaryH),quietSecondaryRect:rect(pad+columnW+gap,top,columnW,secondaryH)}
    }
    const blockH=primaryH+(showSecondary?12+secondaryH:0),start=Math.max(headerRect.y+headerRect.height+6,(height-blockH)/2)
    return {...blank,quietPrimaryRect:rect(pad,start,width-pad*2,primaryH),quietSecondaryRect:showSecondary?rect(pad,start+primaryH+12,width-pad*2,secondaryH):null}
  }
  const top=headerRect.y+headerRect.height+8,bottom=height-pad,available=Math.max(1,bottom-top),rowGap=8,topicH=18,lineH=16,rowH=topicH+composition.summaryLines*lineH+3,overflowH=18
  const count=composition.updates.length
  let capacity=Math.min(6,count,Math.max(1,Math.floor((available+rowGap)/(rowH+rowGap))))
  if(composition.family==='micro'||composition.family==='shallow'||composition.family==='single')capacity=1
  while(capacity>0&&capacity<count&&capacity*rowH+(capacity-1)*rowGap+overflowH+5>available)capacity--
  capacity=Math.max(1,capacity)
  const overflow=count-capacity,rowsHeight=capacity*rowH+(capacity-1)*rowGap,updatesRect=rect(pad,top,width-pad*2,rowsHeight)
  const updateGroups=composition.updates.slice(0,capacity).map((item,index)=>{const y=top+index*(rowH+rowGap),groupRect=rect(pad,y,width-pad*2,rowH);return {update:item,groupRect,topicRect:rect(pad,y,width-pad*2,topicH),summaryRect:rect(pad,y+topicH+3,width-pad*2,rowH-topicH-3)}})
  const overflowRect=overflow?rect(pad,top+rowsHeight+5,width-pad*2,overflowH):null
  return {...blank,updatesRect,updateGroups,overflowRect,overflow}
}
