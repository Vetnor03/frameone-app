export type AiAssistantTopicLanguage = 'en' | 'no'

const GENERIC_TITLE_RE = /^(?:new for you|nytt for deg|updates?|oppdateringer|update|oppdatering|watch|monitoring|assistant|ai assistant)$/i
const URL_RE = /(?:https?:\/\/|www\.)\S+/gi
const BAD_PUNCT_RE = /[?!.:;()[\]{}]/
const QUESTION_START_RE = /^(?:skjer|gi|følg|følge|finn|varsle|beskjed|si|let|tell|notify|follow|find|watch|monitor|track|alert|is|are|when|what|where|how|can|will)\b/i
const LEADING_COMMAND_RE = /^(?:gi\s+beskjed\s+(?:om|når)|følg\s+med\s+(?:på|om)|finn|varsle\s+(?:om|når)|si\s+fra\s+(?:om|når)|let\s+me\s+know\s+(?:about|when)|tell\s+me\s+(?:about|when)|notify\s+me\s+(?:about|when)|follow|watch|monitor|track|find)\s+/i
const STOPWORDS = new Set(['det','noe','kjekt','til','i','på','om','når','og','eller','for','med','nye','ny','billige','the','a','an','in','on','about','when','and','or','for','with','new','cheap'])

export function aiAssistantDefaultTopicTitle(language: AiAssistantTopicLanguage) {
  return language === 'no' ? 'OPPDATERING' : 'UPDATE'
}

export function aiAssistantMultipleWatchesHeader(language: AiAssistantTopicLanguage) {
  return language === 'no' ? 'FØLGER MED' : 'FOLLOWING'
}

function cleanTitleCandidate(value: unknown) {
  return String(value ?? '').replace(URL_RE, ' ').replace(/[“”"']/g, '').replace(/\s+/g, ' ').trim()
}

function isSuitableShortTopic(value: string) {
  const text = cleanTitleCandidate(value)
  if (!text || GENERIC_TITLE_RE.test(text) || URL_RE.test(text) || BAD_PUNCT_RE.test(text) || QUESTION_START_RE.test(text)) return false
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length <= 0 || words.length > 3) return false
  return !words.some((word) => STOPWORDS.has(word.toLowerCase()))
}

function extractCapitalizedPhrase(text: string) {
  const matches = [...text.matchAll(/\b(?:[A-ZÆØÅ][\p{L}\p{N}&-]*|[A-ZÆØÅ]{2,})(?:\s+(?:[A-ZÆØÅ][\p{L}\p{N}&-]*|[A-ZÆØÅ]{2,})){0,2}\b/gu)]
    .map((match) => match[0].trim())
    .filter((value) => isSuitableShortTopic(value))
  return matches[0] || ''
}

function extractAfterPrep(text: string) {
  const match = text.match(/\b(?:i|på|om|for|når|about|in|on|for|when)\s+([^?!.:;]{2,80})/i)
  if (!match) return ''
  const words = match[1].split(/\s+/).map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}&-]+$/gu, '')).filter((word) => word && !STOPWORDS.has(word.toLowerCase())).slice(0, 3)
  return words.join(' ')
}

function extractNounPhrase(text: string) {
  const stripped = text.replace(LEADING_COMMAND_RE, '').trim()
  const phrase = stripped.split(/\b(?:når|when|til|for|i|in|på|on)\b/i)[0].trim()
  const words = phrase.split(/\s+/).map((word) => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}&-]+$/gu, '')).filter((word) => word && !STOPWORDS.has(word.toLowerCase())).slice(0, 3)
  return words.join(' ')
}

export function simplifyAiAssistantTopicTitle(title: unknown, language: AiAssistantTopicLanguage = 'en') {
  const cleaned = cleanTitleCandidate(title)
  if (isSuitableShortTopic(cleaned)) return cleaned.toUpperCase()

  for (const candidate of [extractCapitalizedPhrase(cleaned), extractAfterPrep(cleaned), extractNounPhrase(cleaned)]) {
    const normalized = cleanTitleCandidate(candidate)
    if (isSuitableShortTopic(normalized)) return normalized.toUpperCase()
  }
  return aiAssistantDefaultTopicTitle(language)
}
