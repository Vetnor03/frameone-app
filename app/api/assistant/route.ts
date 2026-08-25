import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { parseReminder, validateParsedReminder } from '@/app/lib/reminders/parser'
import { resolveDeterministicAssistantIntent, validateModelIntent } from '@/app/lib/assistant/resolver'
import type { AssistantResult, ResolvedAssistantIntent } from '@/app/lib/assistant/types'
import { addGroceryItemsCanonical } from '@/app/lib/groceries/actions'
import { reminderFollowupContext, validatePendingReminderPayload } from '@/app/lib/assistant/pending'

export const runtime = 'nodejs'

function friendlyError(): AssistantResult { return { status: 'error', message: "I couldn't do that. Try again." } }
function outputText(payload: any) { for (const item of payload?.output ?? []) for (const content of item?.content ?? []) if (content?.type === 'output_text') return content.text; return '' }

async function aiIntent(text: string): Promise<ResolvedAssistantIntent | null> {
  if (!process.env.OPENAI_API_KEY) return null
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.ASSISTANT_INTENT_MODEL || 'gpt-5-mini', store: false, reasoning: { effort: 'minimal' }, max_output_tokens: 180,
      input: [{ role: 'developer', content: [{ type: 'input_text', text: 'Select one RE:MIND action. Never invent operations. Groceries use items; reminders preserve the complete request in text.' }] }, { role: 'user', content: [{ type: 'input_text', text }] }],
      text: { format: { type: 'json_schema', name: 'assistant_intent', strict: true, schema: { type: 'object', additionalProperties: false, properties: { action: { type: 'string', enum: ['add_grocery_items', 'create_reminder'] }, arguments: { type: 'object', additionalProperties: false, properties: { items: { type: 'array', items: { type: 'string', maxLength: 80 }, maxItems: 30 }, text: { type: 'string', maxLength: 1000 } }, required: ['items', 'text'] } }, required: ['action', 'arguments'] } } },
    }),
  }).catch(() => null)
  if (!response?.ok) return null
  try { return validateModelIntent(JSON.parse(outputText(await response.json()))) } catch { return null }
}

async function saveReminder(db: SupabaseClient, user: User, deviceId: string, reminder: NonNullable<ReturnType<typeof validateParsedReminder>>): Promise<AssistantResult> {
  const { error } = await db.from('reminders').insert({ device_id: deviceId, created_by_user_id: user.id, updated_by_user_id: user.id, title: reminder.title, due_date: reminder.due_date, due_time: reminder.due_time, end_date: reminder.end_date, end_time: reminder.end_time, tag: reminder.tag, repeat_type: reminder.repeat_type, custom_repeat_days: reminder.custom_repeat_days, is_done: false })
  return error ? { status: 'error', action: 'create_reminder', message: "I couldn't create that reminder. Try again." } : { status: 'completed', action: 'create_reminder', message: 'Reminder created ✓' }
}

export async function executeAssistantAction(db: SupabaseClient, admin: SupabaseClient, user: User, deviceId: string, intent: ResolvedAssistantIntent, context: { localNow: string; timezone: string | null; language: 'en' | 'no' }): Promise<AssistantResult> {
  if (intent.action === 'answer_help') return intent.response
  const { data: membership } = await db.from('device_members').select('device_id').eq('device_id', deviceId).eq('user_id', user.id).maybeSingle()
  if (!membership) return friendlyError()
  if (intent.action === 'add_grocery_items') {
    const added = await addGroceryItemsCanonical(db, deviceId, intent.arguments.items.map((name) => ({ name })), crypto.randomUUID())
    return { status: 'completed', action: 'add_grocery_items', message: `Added ${added.count} ${added.count === 1 ? 'item' : 'items'} to Groceries ✓` }
  }
  const { data: parseAllowed } = await db.rpc('consume_assistant_request', { p_kind: 'intent', p_limit: 4 })
  if (!parseAllowed) return { status: 'error', message: 'Please wait a moment and try again.' }
  const parsed = await parseReminder({ text: intent.arguments.text, ...context })
  if (!parsed) return { status: 'error', action: 'create_reminder', message: "I couldn't create that reminder. Try again." }
  if (parsed.status === 'needs_clarification') {
    const { data, error } = await admin.from('assistant_pending_actions').insert({ user_id: user.id, device_id: deviceId, action: 'create_reminder', payload: { originalText: intent.arguments.text, partial: parsed.partial, question: parsed.question } }).select('id').single()
    return error || !data ? friendlyError() : { status: 'needs_input', action: 'create_reminder', message: parsed.question, pendingId: data.id }
  }
  return saveReminder(db, user, deviceId, parsed.reminder)
}

export async function POST(request: Request) {
  const auth = request.headers.get('authorization') || ''
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: auth } } })
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ message: 'Please sign in again.' }, { status: 401 })
  const body = await request.json().catch(() => null) as null | { text?: unknown; deviceId?: unknown; localNow?: unknown; timezone?: unknown; language?: unknown; pendingId?: unknown }
  if (!body || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 1_000 || typeof body.deviceId !== 'string' || typeof body.localNow !== 'string' || !Date.parse(body.localNow) || (body.language !== 'en' && body.language !== 'no') || (body.timezone != null && typeof body.timezone !== 'string')) return NextResponse.json({ status: 'error', message: "I can't do that yet." }, { status: 400 })
  const { data: allowed } = await db.rpc('consume_assistant_request', { p_kind: 'action', p_limit: 12 })
  if (!allowed) return NextResponse.json({ status: 'error', message: 'Please wait a moment and try again.' }, { status: 429 })
  if (body.pendingId !== undefined) {
    if (typeof body.pendingId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.pendingId)) return NextResponse.json({ status: 'error', message: "I can't do that yet." }, { status: 400 })
    const { data: pending } = await admin.from('assistant_pending_actions').select('id,device_id,action,payload,expires_at').eq('id', body.pendingId).eq('user_id', user.id).eq('device_id', body.deviceId).maybeSingle()
    if (!pending || pending.action !== 'create_reminder' || new Date(pending.expires_at).getTime() <= Date.now()) return NextResponse.json({ status: 'error', message: 'That follow-up expired. Try again.' })
    const payload = validatePendingReminderPayload(pending.payload)
    const followup = payload && reminderFollowupContext(payload, body.text, { localNow: body.localNow, timezone: body.timezone || null, language: body.language })
    if (!followup) return NextResponse.json(friendlyError())
    const { data: followupAllowed } = await db.rpc('consume_assistant_request', { p_kind: 'intent', p_limit: 4 })
    if (!followupAllowed) return NextResponse.json({ status: 'error', message: 'Please wait a moment and try again.' }, { status: 429 })
    const parsed = await parseReminder(followup)
    if (!parsed) return NextResponse.json({ status: 'error', message: "I couldn't create that reminder. Try again." })
    await admin.from('assistant_pending_actions').delete().eq('id', pending.id).eq('user_id', user.id)
    if (parsed.status === 'needs_clarification') {
      const { data: nextPending } = await admin.from('assistant_pending_actions').insert({ user_id: user.id, device_id: body.deviceId, action: 'create_reminder', payload: { originalText: payload.originalText, partial: parsed.partial, question: parsed.question } }).select('id').single()
      return NextResponse.json(nextPending ? { status: 'needs_input', action: 'create_reminder', message: parsed.question, pendingId: nextPending.id } : friendlyError())
    }
    return NextResponse.json(await saveReminder(db, user, body.deviceId, parsed.reminder))
  }
  let intent = resolveDeterministicAssistantIntent(body.text)
  if (!intent) {
    const { data: aiAllowed } = await db.rpc('consume_assistant_request', { p_kind: 'intent', p_limit: 4 })
    if (!aiAllowed) return NextResponse.json({ status: 'error', message: 'Please wait a moment and try again.' }, { status: 429 })
    intent = await aiIntent(body.text)
  }
  if (!intent) return NextResponse.json({ status: 'error', message: "I can't do that yet." })
  try { return NextResponse.json(await executeAssistantAction(db, admin, user, body.deviceId, intent, { localNow: body.localNow, timezone: body.timezone || null, language: body.language })) }
  catch { return NextResponse.json(friendlyError()) }
}
