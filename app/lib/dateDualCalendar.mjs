// Experimental editorial two-calendar reservation. Not imported by runtime.
// Preserves second-month functionality without a grid-span visual template.
export function planDateDualCalendar(editorial,source){
  if(!editorial||!source||!editorial.calendar?.rect)return null
  const year=source.year,month0=source.month0
  if(!Number.isInteger(year)||year<1900||year>9999||
     !Number.isInteger(month0)||month0<0||month0>11)return null
  const nextYear=year+(month0===11?1:0),nextMonth0=(month0+1)%12
  if(nextYear>9999)return null
  const safe=editorial.safe,region=editorial.calendar.rect
  if(!safe||safe.h<320||region.w<254)return null
  const margin=Math.max(8,Math.floor(safe.h/45))
  const gap=Math.max(8,Math.min(14,Math.floor(safe.h/30)))
  const usable=safe.h-2*margin-gap
  const currentH=Math.floor(usable*56/100),nextH=usable-currentH
  if(currentH<185||nextH<150)return null
  const current={x:region.x,y:safe.y+margin,w:region.w,h:currentH}
  const next={x:region.x,y:current.y+current.h+gap,w:region.w,h:nextH}
  if(next.y+next.h>safe.y+safe.h)return null
  // Each calendar carries its own title/DOW labels. Next year rolls over
  // explicitly, so the native painter must include the year in its title.
  return {
    current:{rect:current,year,month0,
      features:{showMonthTitle:true,showDowHeader:true,
                showWeekNums:region.w>=190&&currentH>=126}},
    next:{rect:next,year:nextYear,month0:nextMonth0,
      features:{showMonthTitle:true,showDowHeader:true,
                showWeekNums:region.w>=190&&nextH>=126},
      showYear:nextYear!==year},
    gap,margin,visible:editorial.visible,safe
  }
}
