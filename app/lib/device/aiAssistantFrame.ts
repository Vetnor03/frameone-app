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
    .map((row) => ({ id: String(row.id), headline: String(row.headline ?? '').trim(), title: String(row.monitoring_watches?.title ?? '').trim(), created_at: String(row.created_at ?? '') }))
    .filter((row) => row.id && row.headline && !Number.isNaN(new Date(row.created_at).getTime()) && new Date(row.created_at).getTime() > cutoffMs)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  const safeLimit = Math.max(0, Math.floor(options.limit))
  return { items: candidates.slice(0, safeLimit), overflowCount: Math.max(0, candidates.length - safeLimit) }
}
