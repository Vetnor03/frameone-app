export const AI_ASSISTANT_FRAME_LIMITS = { small: 1, medium: 1, large: 2, full: 2 } as const

export type AiAssistantFrameUpdate = {
  id: string
  headline: string
  created_at: string
  summary?: string | null
  source_urls?: unknown
  is_read?: boolean | null
  dismissed_from_frame?: boolean | null
  monitoring_watches?: { owner_user_id?: string | null; frame_id?: string | null; show_on_frame?: boolean | null; title?: string | null } | null
}

export function selectAiAssistantFrameItems(rows: AiAssistantFrameUpdate[], options: { frameId?: string; memberUserIds?: string[]; now?: Date; limit: number }) {
  const cutoffMs = (options.now ?? new Date()).getTime() - 24 * 60 * 60 * 1000
  const hasMembershipFilter = Array.isArray(options.memberUserIds)
  const memberUserIds = new Set((options.memberUserIds ?? []).map((id) => String(id).trim()).filter(Boolean))
  const candidates = rows
    .filter((row) => !hasMembershipFilter || memberUserIds.has(String(row.monitoring_watches?.owner_user_id ?? '').trim()))
    .filter((row) => row.is_read !== true)
    .filter((row) => row.dismissed_from_frame !== true)
    .map((row) => ({ id: String(row.id), headline: String(row.headline ?? '').trim(), summary: typeof row.summary === 'string' ? row.summary : null, created_at: String(row.created_at ?? '') }))
    .filter((row) => row.id && row.headline && !Number.isNaN(new Date(row.created_at).getTime()) && new Date(row.created_at).getTime() > cutoffMs)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const safeLimit = Math.max(0, Math.floor(options.limit))
  return { items: candidates.slice(0, safeLimit), overflowCount: Math.max(0, candidates.length - safeLimit) }
}


export function sanitizeAiAssistantMirrorSummary(summary: unknown, headline: unknown, maxWords: number) {
  const headlineText = String(headline ?? '').trim()
  const safeMaxWords = Math.max(0, Math.floor(maxWords))
  if (safeMaxWords <= 0) return ''

  let text = String(summary ?? '')
  if (!text.trim()) return ''

  text = text
    .replace(/\r/g, '\n')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    .replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/www\.\S+/gi, ' ')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/gm, ' ¶ ')
    .replace(/\s[-*+]\s+/g, ' ¶ ')
    .replace(/^\s*(?:[-*_]{3,}\s*$)/gm, '')
    .replace(/[*_~`#|]+/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]*\n+[ \t]*/g, '\n')
    .replace(/\s+/g, ' ')
    .trim()

  if (!text || /^(?:https?:\/\/|www\.)/i.test(text)) return ''

  if (headlineText) {
    const escaped = headlineText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const duplicateHeadline = new RegExp(`^${escaped}(?:\\s*[-–—:|.]\\s*|\\s+|$)`, 'i')
    let previous = ''
    while (text && text !== previous && duplicateHeadline.test(text)) {
      previous = text
      text = text.replace(duplicateHeadline, '').trim()
    }
  }

  text = removeGenericAiAssistantIntro(text)
  text = preferAiAssistantConcreteFindings(text)
  text = text.replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim()
  if (!text) return ''

  const words = text.split(/\s+/)
  if (words.length > safeMaxWords) text = `${words.slice(0, safeMaxWords).join(' ').replace(/[,:;–—-]+$/g, '').trim()}…`
  return text.replace(/\.{3,}/g, '…').replace(/…+/g, '…').replace(/[\s,;:–—-]+(?=…$)/g, '').replace(/[\s,;:–—-]+$/g, '').trim()
}

function removeGenericAiAssistantIntro(value: string) {
  let text = value.trim()
  const genericIntro = /^(?:her er (?:noen|resultatene|et utvalg av|de viktigste)[^:.\n]{0,140}|jeg fant[^:.\n]{0,140}|here are (?:some|the results|a few|the key)[^:.\n]{0,140}|i found[^:.\n]{0,140})(?:[:.]\s*|\s+)/i
  let previous = ''
  while (text && text !== previous && genericIntro.test(text)) {
    previous = text
    text = text.replace(genericIntro, '').trim()
  }
  return text
}

function preferAiAssistantConcreteFindings(value: string) {
  const text = value.includes('¶') ? `¶${value.split('¶').slice(1).join('¶')}`.trim() : value.trim()
  const listMatches = text.includes('¶') ? text.split('¶').slice(1)
    .map((match) => cleanupAiAssistantFinding(match))
    .filter(isMeaningfulAiAssistantFinding)
    .slice(0, 3) : []
  if (listMatches.length > 0) return listMatches.join(' ')

  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(cleanupAiAssistantFinding)
    .filter(isMeaningfulAiAssistantFinding)
  return (sentences.length > 0 ? sentences.slice(0, 3).join(' ') : text).trim()
}

function cleanupAiAssistantFinding(value: string) {
  const text = value.replace(/^(?:lørdag|søndag|mandag|tirsdag|onsdag|torsdag|fredag|saturday|sunday|monday|tuesday|wednesday|thursday|friday)\s+\d{1,2}\.\s+[a-zæøå]+\s+\d{4}:\s*/i, '').trim()
  if (!text) return ''
  return /[.!?]$/.test(text) ? text : `${text}.`
}

function isMeaningfulAiAssistantFinding(value: string) {
  const text = value.trim()
  if (text.length < 8) return false
  return !/^(?:lørdag|søndag|mandag|tirsdag|onsdag|torsdag|fredag|saturday|sunday|monday|tuesday|wednesday|thursday|friday)\s+\d{1,2}\.\s+[a-zæøå]+\s+\d{4}\.?$/i.test(text)
}
