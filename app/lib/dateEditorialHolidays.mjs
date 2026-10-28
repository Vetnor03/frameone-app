// Experimental measured holiday allocation, separate from default Date.
// Can only replace an OPTIONAL botanical slot after all Date and month facts fit.
export function planEditorialHolidays(editorial,headingInk,rowInk){
  if(!editorial||!Array.isArray(rowInk)||rowInk.length>2)return null
  const count=rowInk.length
  if(!count)return {count:0,heading:null,rows:[]}
  const p=editorial,botanical=p.ornaments?.botanical
  if(!botanical || !headingInk || headingInk.w<=0||headingInk.h<=0)return null
  const hero=p.regions.hero,weekday=p.boxes.weekday
  const area={x:hero.x+8,y:botanical.y-3,w:hero.w-16,
    h:(hero.y+hero.h-8)-(botanical.y-3)}
  const inside=(a,b)=>a && a.w>0&&a.h>0&&a.x>=b.x&&a.y>=b.y&&
    a.x+a.w<=b.x+b.w&&a.y+a.h<=b.y+b.h
  if(!inside(area,hero)||area.y<weekday.y+weekday.h+9)return null
  let total=headingInk.h+6
  for(let i=0;i<count;i++){
    const ink=rowInk[i]
    if(!ink||ink.w<=0||ink.h<=0)return null
    total+=ink.h+(i?4:0)
  }
  if(total>area.h || headingInk.w>area.w||rowInk.some(v=>v.w>area.w))
    return null
  const centered=(ink,y)=>({
    x:area.x+Math.floor((area.w-ink.w)/2),y,w:ink.w,h:ink.h
  })
  let y=area.y+Math.floor((area.h-total)/2)
  const heading=centered(headingInk,y);y+=headingInk.h+6
  const rows=[]
  for(let i=0;i<count;i++){
    if(i)y+=4
    rows.push(centered(rowInk[i],y));y+=rowInk[i].h
  }
  if(!inside(heading,area)||rows.some(v=>!inside(v,area)))return null
  return {count,heading,rows}
}
