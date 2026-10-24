// RE:MIND's curated font shortlist. Visual choices are completely separate
// from frame geometry and the existing approved Surf 2x2 reference.
// All families ship as self-hosted OFL web fonts in the Layout Lab; firmware
// needs real GFX glyph generation and on-panel readability validation first.
export const EDITORIAL_TYPEFACES=Object.freeze({
  gallery:{
    label:'Gallery',
    display:'Instrument Serif',
    body:'DM Sans',
    description:'Sculptural dates, quiet editorial character and crisp daily information',
  },
  warm:{
    label:'Warm',
    display:'Fraunces',
    body:'DM Sans',
    description:'Softer, more human book typography with restrained old-style serifs',
  },
  original:{
    label:'Original',
    display:'Georgia',
    body:'Arial',
    description:'Original comparison baseline; no new production type decisions',
  },
})

export const EDITORIAL_NORWEGIAN_SPECIMEN=
  'Ærlig vær på Jæren · Blåbær, brød og åpent kjøp'

const BODY_LED=new Set(['news','reminders','groceries','assistant'])
const NUMERIC_LED=new Set(['date','weather','countdown','stocks','soccer','ski'])
export function editorialFaceForBlock(module,block,typography='gallery',mode=''){
  if(!EDITORIAL_TYPEFACES[typography])
    throw new RangeError('Unknown RE:MIND typography: '+typography)
  // Approved Surf Medium layout must remain pixel-identical.
  if(mode==='surf-medium-reference'||typography==='original'){
    const serif=Boolean(block.serif)
    return {fontFamily:serif
      ? 'Georgia, "Times New Roman", serif'
      : 'Arial, Helvetica, sans-serif',fontWeight:400,letterSpacing:0}
  }
  const family=EDITORIAL_TYPEFACES[typography]
  const id=block.id||''
  const role=block.role||''
  const lead=id==='primary'||role==='hero'
  const display=(role==='hero'&&!BODY_LED.has(module)) ||
    (lead&&!BODY_LED.has(module) && (NUMERIC_LED.has(module)||module==='surf')) ||
    (module==='date'&&(id==='month'||id==='weekday'))
  // Use readable sans for all long headlines, labels, informational lists
  // and small print. A lovely serif should never make Reminders illegible.
  return {
    fontFamily:display
      ? '"'+family.display+'", Georgia, serif'
      : '"'+family.body+'", Arial, sans-serif',
    fontWeight:!display&&(role==='heading'||id==='heading')?600:400,
    letterSpacing:display?-0.15:0,
  }
}
