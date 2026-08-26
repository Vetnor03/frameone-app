import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { parseReminder, validateParsedReminder } from '@/app/lib/reminders/parser'
import { resolveDeterministicCapabilityRequest, validateCapabilityClassification } from '@/app/lib/assistant/resolver'
import type { AssistantResult, ResolvedAssistantIntent } from '@/app/lib/assistant/types'
import { reminderFollowupContext, surfFollowupTime, validatePendingReminderPayload, validatePendingSurfPayload } from '@/app/lib/assistant/pending'
import { POST as logSurfExperience } from '@/app/api/surf/experience/log/route'
import { findSpotByLabel } from '@/app/lib/surf/spots'
import { ASSISTANT_CAPABILITY_IDS, assistantCapabilityPrompt, type CapabilityArgument } from '@/app/lib/assistant/capabilities'
import { ASSISTANT_CAPABILITY_HANDLERS, executeCapability, executeCapabilityRequest, type CapabilityContext, type CapabilityRequest, type ValidSurfLog } from '@/app/lib/assistant/handlers'
import { normalizeCapabilityArgument } from '@/app/lib/assistant/normalization'
import { surfLoggedAt } from '@/app/lib/assistant/time'
import { GET as weatherDetails } from '@/app/api/weather/details/route'
import { GET as surfScore } from '@/app/api/surf/score/route'
import { ASSISTANT_HELP_TOPIC_IDS, assistantHelpPrompt, assistantHelpResult, resolveDeterministicAssistantHelp, validateAssistantHelpTopicId, type AssistantHelpTopicId } from '@/app/lib/assistant/help'

export const runtime = 'nodejs'

function friendlyError(): AssistantResult { return { status: 'error', message: "I couldn't do that. Try again." } }
function outputText(payload: any) { for (const item of payload?.output ?? []) for (const content of item?.content ?? []) if (content?.type === 'output_text') return content.text; return '' }

type ClassifiedIntent = CapabilityRequest | { helpTopicId: AssistantHelpTopicId }

async function aiIntent(text: string): Promise<ClassifiedIntent | null> {
  if (!process.env.OPENAI_API_KEY) return null
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.ASSISTANT_INTENT_MODEL || 'gpt-5-mini', store: false, reasoning: { effort: 'minimal' }, max_output_tokens: 180,
      input: [{ role: 'developer', content: [{ type: 'input_text', text: `Classify one English or Norwegian request as a registered RE:MIND capability or help topic. Choose a capability for a concrete request to perform a supported action. Choose a help topic for a question asking where or how to use the product. Return unsupported for general knowledge. Never write an answer; only classify. Preserve useful capability arguments and never invent app data.\nCapabilities:\n${assistantCapabilityPrompt()}\nHelp topics:\n${assistantHelpPrompt()}` }] }, { role: 'user', content: [{ type: 'input_text', text }] }],
      text: { format: { type: 'json_schema', name: 'assistant_intent', strict: true, schema: { type: 'object', additionalProperties: false, properties: { intentId: { type: 'string', enum: [...ASSISTANT_CAPABILITY_IDS, ...ASSISTANT_HELP_TOPIC_IDS.map((id) => `help:${id}`), 'unsupported'] }, arguments: { type: 'object', additionalProperties: false, properties: { team: { type: ['string', 'null'] }, spot: { type: ['string', 'null'] }, rating: { type: ['integer', 'null'] }, date: { type: ['string', 'null'] }, period: { type: ['string', 'null'] }, time: { type: ['string', 'null'] }, comment: { type: ['string', 'null'] }, title: { type: ['string', 'null'] }, targetDate: { type: ['string', 'null'] }, theme: { type: ['string', 'null'] }, language: { type: ['string', 'null'] }, layout: { type: ['string', 'null'] }, text: { type: ['string', 'null'] }, items: { type: ['array', 'null'], items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, quantity: { type: ['integer', 'null'] } }, required: ['name', 'quantity'] } } }, required: ['team', 'spot', 'rating', 'date', 'period', 'time', 'comment', 'title', 'targetDate', 'theme', 'language', 'layout', 'text', 'items'] } }, required: ['intentId', 'arguments'] } } },
    }),
  }).catch(() => null)
  if (!response?.ok) return null
  try {
    const parsed = JSON.parse(outputText(await response.json())) as { intentId?: unknown; arguments?: unknown }
    const helpId = typeof parsed.intentId === 'string' && parsed.intentId.startsWith('help:') ? validateAssistantHelpTopicId(parsed.intentId.slice(5)) : null
    if (helpId) return { helpTopicId: helpId }
    return validateCapabilityClassification({ capabilityId: parsed.intentId, arguments: parsed.arguments })
  } catch { return null }
}

async function saveReminder(db: SupabaseClient, user: User, deviceId: string, reminder: NonNullable<ReturnType<typeof validateParsedReminder>>, language: 'en' | 'no'): Promise<AssistantResult> {
  const { error } = await db.from('reminders').insert({ device_id: deviceId, created_by_user_id: user.id, updated_by_user_id: user.id, title: reminder.title, due_date: reminder.due_date, due_time: reminder.due_time, end_date: reminder.end_date, end_time: reminder.end_time, tag: reminder.tag, repeat_type: reminder.repeat_type, custom_repeat_days: reminder.custom_repeat_days, is_done: false })
  return error ? { status: 'error', action: 'create_reminder', message: "I couldn't create that reminder. Try again." } : { status: 'completed', action: 'create_reminder', message: language === 'no' ? 'Påminnelse opprettet ✓' : 'Reminder created ✓' }
}

async function executeReminderRequest(db: SupabaseClient, admin: SupabaseClient, user: User, deviceId: string, text: string, context: { localNow: string; timezone: string | null; language: 'en' | 'no' }): Promise<AssistantResult> {
  const { data: parseAllowed } = await db.rpc('consume_assistant_request', { p_kind: 'intent', p_limit: 4 })
  if (!parseAllowed) return { status: 'error', message: 'Please wait a moment and try again.' }
  const parsed = await parseReminder({ text, ...context })
  if (!parsed) return { status: 'error', message: "I couldn't create that reminder. Try again." }
  if (parsed.status === 'needs_clarification') {
    const { data, error } = await admin.from('assistant_pending_actions').insert({ user_id: user.id, device_id: deviceId, action: 'create_reminder', payload: { originalText: text, partial: parsed.partial, question: parsed.question } }).select('id').single()
    return error || !data ? friendlyError() : { status: 'needs_input', message: parsed.question, pendingId: data.id }
  }
  return saveReminder(db, user, deviceId, parsed.reminder, context.language)
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

function capabilityContext(db: SupabaseClient, admin: SupabaseClient, user: User, deviceId: string, context: { localNow: string; timezone: string | null; language: 'en' | 'no'; authorization: string }): CapabilityContext {
  return { db, admin, user, deviceId, ...context, weatherDetails, surfScore,
    executeSurfLog: (args) => executeSurfLog({ action: 'log_surf_experience', arguments: args }, context),
    executeReminder: (text) => executeReminderRequest(db, admin, user, deviceId, text, context),
  }
}

export async function executeAssistantAction(db: SupabaseClient, admin: SupabaseClient, user: User, deviceId: string, intent: ResolvedAssistantIntent, context: { localNow: string; timezone: string | null; language: 'en' | 'no'; authorization: string }): Promise<AssistantResult> {
  if (intent.action === 'answer_help') return intent.response
  if (intent.action === 'needs_input') return { status: 'needs_input', action: 'needs_input', message: context.language === 'no' ? 'Kan du si litt mer?' : 'Could you say a little more?' }
  if (intent.action === 'capability') return executeCapabilityRequest({ capabilityId: intent.arguments.id, arguments: intent.arguments.values }, capabilityContext(db, admin, user, deviceId, context))
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
  return saveReminder(db, user, deviceId, parsed.reminder, context.language)
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
      const missing = typeof payload?.missing === 'string' && ['team', 'spot', 'rating', 'date', 'period', 'time', 'comment', 'title', 'targetDate', 'theme', 'language', 'layout', 'items', 'text'].includes(payload.missing) ? payload.missing as CapabilityArgument : null
      const previous = payload?.arguments && typeof payload.arguments === 'object' && !Array.isArray(payload.arguments) ? payload.arguments as Record<string, unknown> : {}
      if (!capabilityId || !missing) return NextResponse.json(friendlyError())
      const clean = body.text.trim()
      const value = normalizeCapabilityArgument(missing, clean, { localNow: requestLocalNow, timezone: requestTimezone })
      const handler = ASSISTANT_CAPABILITY_HANDLERS[capabilityId]
      if (value == null || !handler) return NextResponse.json({ status: 'needs_input', message: handler?.missingQuestion[missing]?.[requestLanguage] ?? 'Please provide the missing information.', pendingId: pending.id })
      const result = await executeCapabilityRequest({ capabilityId, arguments: { ...previous, [missing]: value } }, capabilityContext(db, admin, user, requestDeviceId, { localNow: requestLocalNow, timezone: requestTimezone, language: requestLanguage, authorization: auth }))
      if (result.status === 'completed' || (result.pendingId && result.pendingId !== pending.id)) await admin.from('assistant_pending_actions').delete().eq('id', pending.id).eq('user_id', user.id)
      return NextResponse.json(result.status === 'needs_input' && !result.pendingId ? { ...result, pendingId: pending.id } : result)
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
    return NextResponse.json(await saveReminder(db, user, body.deviceId, parsed.reminder, requestLanguage))
  }
  let capability = resolveDeterministicCapabilityRequest(body.text)
  if (!capability) {
    const deterministicHelp = resolveDeterministicAssistantHelp(body.text, requestLanguage)
    if (deterministicHelp) return NextResponse.json(deterministicHelp)
  }
  let classifiedHelpTopic: AssistantHelpTopicId | null = null
  if (!capability) {
    const { data: aiAllowed } = await db.rpc('consume_assistant_request', { p_kind: 'intent', p_limit: 4 })
    if (!aiAllowed) return NextResponse.json({ status: 'error', message: 'Please wait a moment and try again.' }, { status: 429 })
    const classified = await aiIntent(body.text)
    if (classified && 'helpTopicId' in classified) classifiedHelpTopic = classified.helpTopicId
    else capability = classified
  }
  if (classifiedHelpTopic) return NextResponse.json(assistantHelpResult(classifiedHelpTopic, requestLanguage))
  if (!capability) return NextResponse.json({ status: 'needs_input', message: body.language === 'no' ? 'Hva vil du at jeg skal gjøre?' : 'What would you like me to do?' })
  try { return NextResponse.json(await executeCapabilityRequest(capability, capabilityContext(db, admin, user, requestDeviceId, { localNow: requestLocalNow, timezone: requestTimezone, language: requestLanguage, authorization: auth }))) }
  catch { return NextResponse.json(friendlyError()) }
}
