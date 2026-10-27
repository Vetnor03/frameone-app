// Opt-in candidate Date GFX ink measurement, using F1 ORIGINAL glyph metrics.
// No estimated characters, no point/pixel substitution, no browser font metrics.
// This file is not imported by production Studio, and does not draw pixels.
// Firmware should use EditorialText::measureLine on the same original GFX fonts.
import {DateGfxGlyphs} from './dateGfxMetrics.generated.mjs'
import {planMeasuredDate} from './dateRolePlanner.mjs'

export function measureDateGfxInk(text, font) {
  if(typeof text!=='string' || !Object.prototype.hasOwnProperty.call(DateGfxGlyphs,font))return null
  const source=text.normalize('NFC')
  const glyphs=DateGfxGlyphs[font]
  let x=0,minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity
  let count=0
  for(const ch of source){
    const code=ch.codePointAt(0)
    if(code<0x20||code>0xFF)return null
    const [width,height,advance,offsetX,offsetY]=glyphs[code-0x20]
    if(width>0&&height>0){
      minX=Math.min(minX,x+offsetX)
      minY=Math.min(minY,offsetY)
      maxX=Math.max(maxX,x+offsetX+width)
      maxY=Math.max(maxY,offsetY+height)
      count++
    }
    x+=advance
  }
  if(count===0)return null
  return {w:maxX-minX,h:maxY-minY,minX,minY,advanceX:x}
}

// All-or-nothing: prefer the original large Fraunces first, then readable DM
// context; if NO complete fit exists, return null for untouched legacy fallback.
// No test by 1x2/2x1 or any explicit cell ID, and no drawing side effects.
export function planDateWithRealGfx(cell, facts) {
  if(!facts||!Number.isInteger(facts.day)||facts.day<1||facts.day>31||
     typeof facts.month!=='string'||!facts.month||
     typeof facts.weekday!=='string'||!facts.weekday)return null
  const text={day:String(facts.day),month:facts.month,weekday:facts.weekday}
  for(const dayFont of ['Fraunces72','Fraunces48']){
    const day=measureDateGfxInk(text.day,dayFont)
    if(!day)continue
    for(const monthFont of ['DM24','DM18']){
      const month=measureDateGfxInk(text.month,monthFont)
      if(!month)continue
      for(const weekdayFont of ['DM24','DM18']){
        const weekday=measureDateGfxInk(text.weekday,weekdayFont)
        if(!weekday)continue
        const plan=planMeasuredDate(cell,{day,month,weekday})
        if(plan)return { ...plan,
          fonts:{day:dayFont,month:monthFont,weekday:weekdayFont},
          inkMetrics:{day,month,weekday},text}
      }
    }
  }
  return null
}
