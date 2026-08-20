export const STUDIO_MODULES = ['date','reminders','weather','countdown','surf','soccer','stocks','groceries']

const legacyVariants = new Map([
  ['4x1', 'SMALL'],
  ['2x2', 'MEDIUM'],
  ['4x2', 'LARGE'],
  ['4x4', 'XL'],
])

export function responsiveCellProfile(colSpan, rowSpan, width, height) {
  if (![colSpan,rowSpan].every(Number.isInteger) || colSpan < 1 || colSpan > 4 || rowSpan < 1 || rowSpan > 4) {
    throw new RangeError('Responsive cells must be rectangles between 1×1 and 4×4')
  }
  if (!(width > 0) || !(height > 0)) throw new RangeError('Responsive cells need positive pixel dimensions')
  const aspectRatio = width / height
  const area = colSpan * rowSpan
  // Grid orientation is intentionally logical: equal spans remain "square" even
  // though the physical e-paper pixels are wider than they are tall.
  const orientation = colSpan > rowSpan ? 'landscape' : colSpan < rowSpan ? 'portrait' : 'square'
  const density = area <= 2 ? 'micro' : area <= 4 ? 'compact' : area <= 8 ? 'normal' : 'expanded'
  return { colSpan, rowSpan, width, height, area, aspectRatio, orientation, density }
}

export function legacyStudioVariant(colSpan, rowSpan) {
  return legacyVariants.get(`${colSpan}x${rowSpan}`) ?? null
}

export function studioRenderStrategy(module, colSpan, rowSpan, width, height) {
  if (!STUDIO_MODULES.includes(module)) throw new RangeError(`Unknown Studio module: ${module}`)
  const profile = responsiveCellProfile(colSpan, rowSpan, width, height)
  const legacyVariant = legacyStudioVariant(colSpan, rowSpan)
  return { path: legacyVariant ? 'legacy' : 'responsive', legacyVariant, profile }
}
