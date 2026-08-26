export const ASSISTANT_GAP_MAX_LENGTH = 280

export function sanitizeAssistantGapText(input) {
  if (typeof input !== 'string') return ''
  return input
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .replace(/(?<!\w)(?:\+?\d[\d ().-]{6,}\d)(?!\w)/g, '[phone]')
    .replace(/\b(?:bearer|authorization|api[_ -]?key|access[_ -]?token|refresh[_ -]?token)\s*[:=]?\s*[^\s,;]+/gi, '[secret]')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, ASSISTANT_GAP_MAX_LENGTH)
}
