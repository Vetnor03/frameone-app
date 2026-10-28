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
  // Week counts, not a fixed 56/44 split, determine the vertical rhythm.
  // Keep all 1-bit calendar ink and the main month's outlined today ring
  // separated. A row needs 26px for the outlined marker; the secondary
  // calendar needs 21px for the original FreeSans9 bitmap ink.
  const rows=(y,m)=>{
    const sunday=new Date(Date.UTC(y,m,1)).getUTCDay()
    const monday=(sunday+6)%7
    const days=new Date(Date.UTC(y,m+1,0)).getUTCDate()
    return Math.max(4,Math.min(6,Math.ceil((monday+days)/7)))
  }
  const firstRows=rows(year,month0),secondRows=rows(nextYear,nextMonth0)
  const chrome=16+22+10+18 // padding, title, title gap, DOW header
  const margin=4,gap=8 // the calendars each have their own 8px padding
  const usable=safe.h-2*margin-gap
  const firstMin=chrome+26*firstRows,secondMin=chrome+21*secondRows
  const spare=usable-firstMin-secondMin
  if(spare<0)return null // never compress calendar rows to fit
  const currentH=firstMin+Math.floor(spare*firstRows/(firstRows+secondRows))
  const nextH=usable-currentH
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
