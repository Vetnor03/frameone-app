import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { parseReminder, validateParsedReminder } from '@/app/lib/reminders/parser'
import { isReservedAssistantInput, resolveDeterministicAssistantIntent, validateModelIntent } from '@/app/lib/assistant/resolver'
import type { AssistantResult, ResolvedAssistantIntent } from '@/app/lib/assistant/types'
import { reminderFollowupContext, surfFollowupTime, validatePendingReminderPayload, validatePendingSurfPayload } from '@/app/lib/assistant/pending'
import { POST as logSurfExperience } from '@/app/api/surf/experience/log/route'
import { findSpotByLabel } from '@/app/lib/surf/spots'
import { assistantCapabilityPrompt } from '@/app/lib/assistant/capabilities'
import { executeCapability, type ValidSurfLog } from '@/app/lib/assistant/handlers'
import { surfLoggedAt } from '@/app/lib/assistant/time'
import { GET as weatherDetails } from '@/app/api/weather/details/route'
import { GET as surfScore } from '@/app/api/surf/score/route'

export const runtime = 'nodejs'

function friendlyError(): AssistantResult { return { status: 'error', message: "I couldn't do that. Try again." } }
function outputText(payload: any) { for (const item of payload?.output ?? []) for (const content of item?.content ?? []) if (content?.type === 'output_text') return content.text; return '' }

async function aiIntent(text: string): Promise<ResolvedAssistantIntent | null> {
  if (!process.env.OPENAI_API_KEY) return null
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.ASSISTANT_INTENT_MODEL || 'gpt-5-mini', store: false, reasoning: { effort: 'minimal' }, max_output_tokens: 180,
      input: [{ role: 'developer', content: [{ type: 'input_text', text: `Route one English or Norwegian request to a RE:MIND capability. Executable actions: add_grocery_items for clear foods/lists only; create_reminder for task plus date/time phrases; log_surf_experience for a surf spot plus rating; set_football_team when changing the selected football team; needs_input when an executable operation or required argument cannot be resolved. App capability registry:\n${assistantCapabilityPrompt()}\nSurf ratings are Flat=1, Poor=2, Poor to Fair=3, Fair=4, Good=5, Epic=6. Preserve original reminder text and surf comment. Never turn module/navigation concepts into groceries. Do not chat or invent actions.` }] }, { role: 'user', content: [{ type: 'input_text', text }] }],
      text: { format: { type: 'json_schema', name: 'assistant_intent', strict: true, schema: { type: 'object', additionalProperties: false, properties: { action: { type: 'string', enum: ['add_grocery_items', 'create_reminder', 'log_surf_experience', 'set_football_team', 'needs_input'] }, arguments: { type: 'object', additionalProperties: false, properties: { items: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string', maxLength: 80 }, quantity: { type: ['integer', 'null'], minimum: 1, maximum: 99 } }, required: ['name', 'quantity'] }, maxItems: 30 }, text: { type: 'string', maxLength: 1000 }, spot: { type: 'string', maxLength: 80 }, rating: { type: ['integer', 'null'], minimum: 1, maximum: 6 }, date: { type: 'string', maxLength: 40 }, time: { type: ['string', 'null'], maxLength: 20 }, comment: { type: 'string', maxLength: 1000 }, team: { type: 'string', maxLength: 80 } }, required: ['items', 'text', 'spot', 'rating', 'date', 'time', 'comment', 'team'] } }, required: ['action', 'arguments'] } } },
    }),
  }).catch(() => null)
  if (!response?.ok) return null
  try { return validateModelIntent(JSON.parse(outputText(await response.json()))) } catch { return null }
}

async function saveReminder(db: SupabaseClient, user: User, deviceId: string, reminder: NonNullable<ReturnType<typeof validateParsedReminder>>): Promise<AssistantResult> {
  const { error } = await db.from('reminders').insert({ device_id: deviceId, created_by_user_id: user.id, updated_by_user_id: user.id, title: reminder.title, due_date: reminder.due_date, due_time: reminder.due_time, end_date: reminder.end_date, end_time: reminder.end_time, tag: reminder.tag, repeat_type: reminder.repeat_type, custom_repeat_days: reminder.custom_repeat_days, is_done: false })
  return error ? { status: 'error', action: 'create_reminder', message: "I couldn't create that reminder. Try again." } : { status: 'completed', action: 'create_reminder', message: 'Reminder created ✓' }
}

async function executeSurfLog(intent: Extract<ResolvedAssistantIntent, { action: 'log_surf_experience' }>, context: { localNow: string; timezone: string | null; language: 'en' | 'no'; authorization: string }): Promise<AssistantResult> {
  const spot = findSpotByLabel(intent.arguments.spot)
  const spotLabel = spot?.label || intent.arguments.spot
  const response = await logSurfExperience(new Request('http://frame.local/api/surf/experience/log', { method: 'POST', headers: { 'content-type': 'application/json', authorization: context.authorization }, body: JSON.stringify({ spotId: spot?.spotId || spotLabel, spot: spotLabel, loggedAt: surfLoggedAt(intent.arguments.date, intent.arguments.time!, context.localNow, context.timezone), rating_1_6: intent.arguments.rating, mode: 'detect', comment: intent.arguments.comment }) }))
  const result = await response.json().catch(() => null)
  if (!response.ok && result?.error === 'Unknown surf spot') return { status: 'needs_input', action: 'log_surf_experience', message: context.language === 'no' ? 'Hvilken surfespot mener du?' : 'Which surf spot do you mean?' }
  if (!response.ok || result?.duplicate) return friendlyError()
  return { status: 'completed', action: 'log_surf_experience', message: context.language === 'no' ? `Logget surfen på ${spotLabel}.` : `Logged your surf at ${spotLabel}.` }
}

export async function executeAssistantAction(db: SupabaseClient, admin: SupabaseClient, user: User, deviceId: string, intent: ResolvedAssistantIntent, context: { localNow: string; timezone: string | null; language: 'en' | 'no'; authorization: string }): Promise<AssistantResult> {
  if (intent.action === 'answer_help') return intent.response
  if (intent.action === 'needs_input') return { status: 'needs_input', action: 'needs_input', message: context.language === 'no' ? 'Kan du si litt mer?' : 'Could you say a little more?' }
  const capability = intent.action === 'add_grocery_items'
    ? { id: 'groceries.add', arguments: { items: intent.arguments.items } }
    : intent.action === 'set_football_team'
      ? { id: 'football.set_team', arguments: { team: intent.arguments.teamId } }
      : null
  if (capability) return executeCapability(capability.id, capability.arguments, { db, admin, user, deviceId, ...context, executeSurfLog: (args: ValidSurfLog) => executeSurfLog({ action: 'log_surf_experience', arguments: args }, context) })
  if (intent.action === 'log_surf_experience') {
    if (!intent.arguments.time) {
      const question = context.language === 'no' ? `Når var du på ${intent.arguments.spot}?` : `What time were you at ${intent.arguments.spot}?`
      const { data, error } = await admin.from('assistant_pending_actions').insert({ user_id: user.id, device_id: deviceId, action: 'log_surf_experience', payload: { spot: intent.arguments.spot, rating: intent.arguments.rating, date: intent.arguments.date, comment: intent.arguments.comment } }).select('id').single()
      return error || !data ? friendlyError() : { status: 'needs_input', action: 'log_surf_experience', message: question, pendingId: data.id }
    }
    return executeCapability('surf.log_experience', intent.arguments, { db, admin, user, deviceId, ...context, executeSurfLog: (args) => executeSurfLog({ action: 'log_surf_experience', arguments: args }, context) })
  }
  if (intent.action !== 'create_reminder') return friendlyError()
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
  const requestLanguage: 'en' | 'no' = body.language
  const requestDeviceId: string = body.deviceId
  const requestLocalNow: string = body.localNow
  const requestTimezone: string | null = typeof body.timezone === 'string' ? body.timezone : null
  const { data: allowed } = await db.rpc('consume_assistant_request', { p_kind: 'action', p_limit: 12 })
  if (!allowed) return NextResponse.json({ status: 'error', message: 'Please wait a moment and try again.' }, { status: 429 })
  if (body.pendingId !== undefined) {
    if (typeof body.pendingId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.pendingId)) return NextResponse.json({ status: 'error', message: "I can't do that yet." }, { status: 400 })
    const { data: pending } = await admin.from('assistant_pending_actions').select('id,device_id,action,payload,expires_at').eq('id', body.pendingId).eq('user_id', user.id).eq('device_id', body.deviceId).maybeSingle()
    if (!pending || !(pending.action === 'create_reminder' || pending.action === 'log_surf_experience' || pending.action.startsWith('capability:')) || new Date(pending.expires_at).getTime() <= Date.now()) return NextResponse.json({ status: 'error', message: 'That follow-up expired. Try again.' })
    if (pending.action.startsWith('capability:')) {
      const payload = pending.payload && typeof pending.payload === 'object' && !Array.isArray(pending.payload) ? pending.payload as Record<string, unknown> : null
      const capabilityId = typeof payload?.capabilityId === 'string' ? payload.capabilityId : ''
      const missing = typeof payload?.missing === 'string' ? payload.missing : ''
      const previous = payload?.arguments && typeof payload.arguments === 'object' && !Array.isArray(payload.arguments) ? payload.arguments as Record<string, unknown> : {}
      if (!capabilityId || !missing) return NextResponse.json(friendlyError())
      const clean = body.text.trim()
      const value: unknown = missing === 'rating' ? Number(clean) : clean
      await admin.from('assistant_pending_actions').delete().eq('id', pending.id).eq('user_id', user.id)
      return NextResponse.json(await executeCapability(capabilityId, { ...previous, [missing]: value }, { db, admin, user, deviceId: requestDeviceId, language: requestLanguage, localNow: requestLocalNow, timezone: requestTimezone, authorization: auth, executeSurfLog: (args) => executeSurfLog({ action: 'log_surf_experience', arguments: args }, { localNow: requestLocalNow, timezone: requestTimezone, language: requestLanguage, authorization: auth }) }))
    }
    if (pending.action === 'log_surf_experience') {
      const payload = validatePendingSurfPayload(pending.payload)
      const time = surfFollowupTime(body.text)
      if (!payload || !time) return NextResponse.json({ status: 'needs_input', action: 'log_surf_experience', message: body.language === 'no' ? 'Hvilket klokkeslett var det?' : 'What time was it?' })
      const intent: ResolvedAssistantIntent = { action: 'log_surf_experience', arguments: { ...payload, time } }
      const result = await executeSurfLog(intent, { localNow: body.localNow, timezone: body.timezone || null, language: body.language, authorization: auth })
      if (result.status === 'completed') await admin.from('assistant_pending_actions').delete().eq('id', pending.id).eq('user_id', user.id)
      return NextResponse.json(result)
    }
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
    if (!isReservedAssistantInput(body.text)) {
      const { data: aiAllowed } = await db.rpc('consume_assistant_request', { p_kind: 'intent', p_limit: 4 })
      if (!aiAllowed) return NextResponse.json({ status: 'error', message: 'Please wait a moment and try again.' }, { status: 429 })
      intent = await aiIntent(body.text)
    }
  }
  if (!intent) return NextResponse.json({ status: 'needs_input', message: body.language === 'no' ? 'Hva vil du at jeg skal gjøre?' : 'What would you like me to do?' })
  try { return NextResponse.json(await executeAssistantAction(db, admin, user, body.deviceId, intent, { localNow: body.localNow, timezone: body.timezone || null, language: body.language, authorization: auth })) }
  catch { return NextResponse.json(friendlyError()) }
}
