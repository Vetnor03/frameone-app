export type WasteDisplayLanguage = 'en' | 'no'

const LABELS = {
  en: { restavfall: 'Residual waste', matavfall: 'Food waste', papir: 'Paper', plast: 'Plastic', glass_metall: 'Glass and metal', hageavfall: 'Garden waste', christmas_tree: 'Christmas tree', hazardous: 'Hazardous waste', textile: 'Textiles', other: 'Other waste' },
  no: { restavfall: 'Restavfall', matavfall: 'Matavfall', papir: 'Papir', plast: 'Plast', glass_metall: 'Glass og metall', hageavfall: 'Hageavfall', christmas_tree: 'Juletre', hazardous: 'Farlig avfall', textile: 'Tekstil', other: 'Annet avfall' },
} as const

const RAW_LABELS: Record<WasteDisplayLanguage, Record<string, string>> = {
  en: { 'papir og plastemballasje': 'Paper and plastic packaging' },
  no: { 'papir og plastemballasje': 'Papir og plastemballasje' },
}

export function wasteCollectionDisplayTitle(types: unknown, language: WasteDisplayLanguage, originals: unknown = []) {
  const values = (Array.isArray(types) ? types : [types]).map(value => String(value || '').trim()).filter(Boolean)
  const originalLabels = (Array.isArray(originals) ? originals : [originals]).map(value => String(value || '').trim())
  return values.map((type, index) => {
    const original = originalLabels[index]
    const rawLabel = original && (RAW_LABELS[language][original.toLocaleLowerCase('nb-NO')] || original)
    const label = type === 'other' ? rawLabel || LABELS[language].other : LABELS[language][type as keyof typeof LABELS.en] || LABELS[language].other
    return index === 0 ? label : label.toLocaleLowerCase(language === 'no' ? 'nb-NO' : 'en-US')
  }).join(' + ')
}
