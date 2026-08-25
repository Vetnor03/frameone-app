const TYPOGRAPHY = new Map([
  ['\u2018', "'"], ['\u2019', "'"], ['\u201a', "'"], ['\u201b', "'"],
  ['\u201c', '"'], ['\u201d', '"'], ['\u201e', '"'], ['\u00ab', '"'], ['\u00bb', '"'],
  ['\u2013', '-'], ['\u2014', '-'], ['\u2212', '-'], ['\u2026', '...'],
  ['\u2022', '-'], ['\u00a0', ' '], ['\ufeff', ' '], ['\ufffd', ''],
  ['\u00d7', 'x'], ['\u00f7', '/'], ['\u2122', ''], ['\u00a9', ''], ['\u00ae', ''],
])
const EXTRA_LATIN = new Map([
  ['\u0141', 'L'], ['\u0142', 'l'], ['\u0110', 'D'], ['\u0111', 'd'],
  ['\u00d0', 'D'], ['\u00f0', 'd'], ['\u00de', 'Th'], ['\u00fe', 'th'],
  ['\u00df', 'ss'], ['\u0152', 'OE'], ['\u0153', 'oe'],
])
const SAFE_ASCII = /^[A-Za-z0-9 .,:;!?'"()\/+\-&%#]$/
const SUPPORTED = new Set(['æ', 'ø', 'å', 'Æ', 'Ø', 'Å', '°'])

/** Canonical, deterministic normalization for text sent to a physical frame. */
export function sanitizeFrameText(input) {
  let output = ''
  for (const original of String(input ?? '')) {
    const mapped = TYPOGRAPHY.get(original)
    if (mapped !== undefined) { output += mapped; continue }
    if (SUPPORTED.has(original) || SAFE_ASCII.test(original)) { output += original; continue }
    const extra = EXTRA_LATIN.get(original)
    if (extra !== undefined) { output += extra; continue }
    if (/\s/u.test(original) || /[\u0000-\u001f\u007f-\u009f]/u.test(original)) { output += ' '; continue }
    for (const character of original.normalize('NFKD')) {
      if (SAFE_ASCII.test(character)) output += character
    }
  }
  return output.replace(/\s+/g, ' ').trim()
}
