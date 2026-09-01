import type { SupabaseClient } from '@supabase/supabase-js'
import { sanitizeAiAssistantMirrorSummary, selectAiAssistantFrameItems, type AiAssistantFrameUpdate } from './aiAssistantFrame'

export const AI_ASSISTANT_DEVICE_CANDIDATE_LIMIT = 8
export const AI_ASSISTANT_DEVICE_TOPIC_MAX = 63
export const AI_ASSISTANT_DEVICE_SUMMARY_MAX = 191

const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''

export async function loadAiAssistantDeviceData(supabase: SupabaseClient, deviceId: string, { liveMirrorView = false, now = new Date() } = {}) {
  const { data: memberRows, error: memberError } = await supabase.from('device_members').select('user_id').eq('device_id', deviceId)
  if (memberError) throw memberError
  const memberUserIds = [...new Set((Array.isArray(memberRows) ? memberRows : []).map((row: { user_id?: unknown }) => text(row.user_id)).filter(Boolean))]
  if (!memberUserIds.length) return { memberUserIds, activeWatches: [], items: [], overflowCount: 0 }
  const { data: watchRows, error: watchError } = await supabase.from('monitoring_watches').select('id, last_checked_at, status, title, preferred_language, created_at').in('owner_user_id', memberUserIds).eq('status', 'active').order('created_at', { ascending: true })
  if (watchError) throw watchError
  const { data: updateRows, error: updateError } = await supabase.from('monitoring_updates').select('id, watch_id, headline, summary, created_at, dismissed_from_frame, is_read, monitoring_watches!inner(owner_user_id, title, preferred_language)').in('monitoring_watches.owner_user_id', memberUserIds).order('created_at', { ascending: false })
  if (updateError) throw updateError
  const selected = selectAiAssistantFrameItems((Array.isArray(updateRows) ? updateRows : []) as AiAssistantFrameUpdate[], { memberUserIds, limit: AI_ASSISTANT_DEVICE_CANDIDATE_LIMIT, liveMirrorView, now })
  return { memberUserIds, activeWatches: Array.isArray(watchRows) ? watchRows : [], ...selected }
}

export function compactAiAssistantDeviceItem(item: { topicTitle?: string; headline?: string; summary?: string | null }) {
  const topic = text(item.topicTitle).slice(0, AI_ASSISTANT_DEVICE_TOPIC_MAX)
  const sanitized = sanitizeAiAssistantMirrorSummary(item.summary, item.headline, 30) || text(item.headline)
  return { topic, summary: sanitized.slice(0, AI_ASSISTANT_DEVICE_SUMMARY_MAX) }
}
