export type AiAssistantTopicLanguage = 'en' | 'no'

const URL_RE = /(?:https?:\/\/|www\.)\S+/i
const BAD_PUNCT_RE = /[?!.:;()[\]{}]$/
const GENERIC_WORDS = new Set([
  'hva','hvor','når','hvordan','skjer','finn','følg','følge','oppdatering','oppdateringer','nyheter','assistent','assistant',
  'what','where','when','how','find','follow','update','updates','news','watch','monitoring','monitor','track','alert',
])
const QUESTION_OR_COMMAND_START_RE = /^(?:hva|hvor|når|hvordan|skjer|gi|følg|følge|finn|varsle|beskjed|si|what|where|when|how|find|follow|update|tell|notify|watch|monitor|track|alert|is|are|can|will)\b/i

export function aiAssistantDefaultTopicTitle(language: AiAssistantTopicLanguage) {
  return language === 'no' ? 'OPPDATERING' : 'UPDATE'
}

export function aiAssistantNoUpdatesHeader(language: AiAssistantTopicLanguage) {
  return language === 'no' ? 'INGENTING NYTT' : 'NOTHING NEW'
}


export function aiAssistantSelectedUpdateFallbackTitle(language: AiAssistantTopicLanguage) {
  return language === 'no' ? 'NY OPPDATERING' : 'NEW UPDATE'
}

function cleanTitleCandidate(value: unknown) {
  return String(value ?? '').replace(/[“”"']/g, '').replace(/\s+/g, ' ').trim().replace(/[\s,;:!?–—-]+$/g, '').trim()
}

export function isValidAiAssistantTopicTitle(value: unknown) {
  const text = cleanTitleCandidate(value)
  if (!text || URL_RE.test(text) || BAD_PUNCT_RE.test(text) || QUESTION_OR_COMMAND_START_RE.test(text)) return false
  if (!/[\p{L}\p{N}]/u.test(text)) return false
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length <= 0 || words.length > 3) return false
  return !words.some((word) => GENERIC_WORDS.has(word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')))
}

export function simplifyAiAssistantTopicTitle(title: unknown, language: AiAssistantTopicLanguage = 'en') {
  const cleaned = cleanTitleCandidate(title)
  if (isValidAiAssistantTopicTitle(cleaned)) return cleaned.toUpperCase()
  return aiAssistantDefaultTopicTitle(language)
}
