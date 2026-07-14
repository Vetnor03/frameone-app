export const AI_ASSISTANT_FRAME_LIMITS = { small: 3, medium: 4, large: 6, full: 8 } as const

export type AiAssistantFrameUpdate = {
  id: string
  headline: string
  created_at: string
  summary?: string | null
  source_urls?: unknown
  is_read?: boolean | null
  dismissed_from_frame?: boolean | null
  monitoring_watches?: { frame_id?: string | null; show_on_frame?: boolean | null } | null
}

export function selectAiAssistantFrameItems(rows: AiAssistantFrameUpdate[], options: { frameId: string; now?: Date; limit: number }) {
  const cutoffMs = (options.now ?? new Date()).getTime() - 24 * 60 * 60 * 1000
  const candidates = rows
    .filter((row) => String(row.monitoring_watches?.frame_id ?? '') === options.frameId)
    .filter((row) => row.monitoring_watches?.show_on_frame === true)
    .filter((row) => row.dismissed_from_frame !== true)
    .map((row) => ({ id: String(row.id), headline: String(row.headline ?? '').trim(), created_at: String(row.created_at ?? '') }))
    .filter((row) => row.id && row.headline && !Number.isNaN(new Date(row.created_at).getTime()) && new Date(row.created_at).getTime() > cutoffMs)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const safeLimit = Math.max(0, Math.floor(options.limit))
  return { items: candidates.slice(0, safeLimit), overflowCount: Math.max(0, candidates.length - safeLimit) }
}
