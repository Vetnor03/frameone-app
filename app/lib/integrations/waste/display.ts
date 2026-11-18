export type WasteDisplayLanguage = 'en' | 'no'

// Norwegian municipal fraction names are used on both English and Norwegian
// interfaces. The surrounding interface and date labels remain localized.
const LABELS = {
  restavfall: 'Restavfall', matavfall: 'Matavfall', papir: 'Papir', plast: 'Plast', glass_metall: 'Glass og metall', hageavfall: 'Hageavfall', christmas_tree: 'Juletre', hazardous: 'Farlig avfall', textile: 'Tekstil', other: 'Annet avfall',
} as const

const RAW_LABELS: Record<string, string> = {
  'papir og plastemballasje': 'Papir og plastemballasje',
  'paper and plastic packaging': 'Papir og plastemballasje',
  'residual waste': LABELS.restavfall,
  'food waste': LABELS.matavfall,
  'paper': LABELS.papir,
  'plastic': LABELS.plast,
  'plastic packaging': LABELS.plast,
  'glass and metal': LABELS.glass_metall,
  'garden waste': LABELS.hageavfall,
  'christmas tree': LABELS.christmas_tree,
  'hazardous waste': LABELS.hazardous,
  'textiles': LABELS.textile,
  'other waste': LABELS.other,
}

export function wasteCollectionDisplayTitle(types: unknown, _language: WasteDisplayLanguage, originals: unknown = []) {
  const values = (Array.isArray(types) ? types : [types]).map(value => String(value || '').trim()).filter(Boolean)
  const originalLabels = (Array.isArray(originals) ? originals : [originals]).map(value => String(value || '').trim())
  return values.map((type, index) => {
    const original = originalLabels[index]
    const rawLabel = original && (RAW_LABELS[original.toLocaleLowerCase('nb-NO')] || original)
    const label = type === 'other' ? rawLabel || LABELS.other : LABELS[type as keyof typeof LABELS] || LABELS.other
    return index === 0 ? label : label.toLocaleLowerCase('nb-NO')
  }).join(' + ')
}
