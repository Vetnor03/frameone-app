import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { parseReminder, validateParsedReminder } from '@/app/lib/reminders/parser'
import { resolveDeterministicAssistantIntent, validateModelIntent } from '@/app/lib/assistant/resolver'
import type { AssistantResult, ResolvedAssistantIntent } from '@/app/lib/assistant/types'
import { addGroceryItemsCanonical } from '@/app/lib/groceries/actions'
import { reminderFollowupContext, surfFollowupTime, validatePendingReminderPayload } from '@/app/lib/assistant/pending'
import { POST as logSurfExperience } from '@/app/api/surf/experience/log/route'
import { GET as weatherDetails } from '@/app/api/weather/details/route'
import { GET as surfScore } from '@/app/api/surf/score/route'
import { findSpotByLabel } from '@/app/lib/surf/spots'
import { ALL_TEAMS } from '@/app/lib/soccer/teams'
import { ASSISTANT_ROUTING_IDS, assistantCapabilityPrompt, capabilityById, type AssistantCapabilityId } from '@/app/lib/assistant/capabilities'
import { ASSISTANT_CAPABILITY_HANDLERS, assertCapabilityRegistryIntegrity } from '@/app/lib/assistant/handlers'

export const runtime = 'nodejs'
assertCapabilityRegistryIntegrity()

function friendlyError(): AssistantResult { return { status: 'error', message: "I couldn't do that. Try again." } }
function outputText(payload: any) { for (const item of payload?.output ?? []) for (const content of item?.content ?? []) if (content?.type === 'output_text') return content.text; return '' }

async function aiIntent(text: string): Promise<ResolvedAssistantIntent | null> {
  if (!process.env.OPENAI_API_KEY) return null
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: process.env.ASSISTANT_INTENT_MODEL || 'gpt-5-mini', store: false, reasoning: { effort: 'minimal' }, max_output_tokens: 220,
      input: [{ role: 'developer', content: [{ type: 'input_text', text: `Classify one English or Norwegian request as exactly one registered RE:MIND capability. Use unsupported when it is not an app operation. Do not chat or invent capabilities. Return compact arguments only. Registry:\n${assistantCapabilityPrompt()}` }] }, { role: 'user', content: [{ type: 'input_text', text }] }],
      text: { format: { type: 'json_schema', name: 'assistant_capability', strict: true, schema: { type: 'object', additionalProperties: false, properties: {
        capabilityId: { type: 'string', enum: ASSISTANT_ROUTING_IDS },
        arguments: { type: 'object', additionalProperties: false, properties: { text: { type: ['string', 'null'] }, items: { type: ['array', 'null'], items: { type: 'object', additionalProperties: false, properties: { name: { type: 'string' }, quantity: { type: ['integer', 'null'] } }, required: ['name', 'quantity'] } }, spot: { type: ['string', 'null'] }, rating: { type: ['integer', 'null'] }, time: { type: ['string', 'null'] }, date: { type: ['string', 'null'] }, team: { type: ['string', 'null'] }, title: { type: ['string', 'null'] }, theme: { type: ['string', 'null'] }, language: { type: ['string', 'null'] }, layout: { type: ['string', 'null'] } }, required: ['text', 'items', 'spot', 'rating', 'time', 'date', 'team', 'title', 'theme', 'language', 'layout'] },
      }, required: ['capabilityId', 'arguments'] } } },
    }),
  }).catch(() => null)
  if (!response?.ok) return null
  try { return validateModelIntent(JSON.parse(outputText(await response.json()))) } catch { return null }
}

async function saveReminder(db: SupabaseClient, user: User, deviceId: string, reminder: NonNullable<ReturnType<typeof validateParsedReminder>>): Promise<AssistantResult> {
  const { error } = await db.from('reminders').insert({ device_id: deviceId, created_by_user_id: user.id, updated_by_user_id: user.id, title: reminder.title, due_date: reminder.due_date, due_time: reminder.due_time, end_date: reminder.end_date, end_time: reminder.end_time, tag: reminder.tag, repeat_type: reminder.repeat_type, custom_repeat_days: reminder.custom_repeat_days, is_done: false })
  return error ? friendlyError() : { status: 'completed', capabilityId: 'reminders.create', message: 'Reminder created ✓' }
}

function surfLoggedAt(date: string, time: string, localNow: string) {
  const base = new Date(localNow); if (date === 'yesterday') base.setUTCDate(base.getUTCDate() - 1)
  const [hour, minute] = time.split(':').map(Number); base.setUTCHours(hour, minute, 0, 0); return base.toISOString()
}

async function executeSurfLog(intent: ResolvedAssistantIntent, context: { localNow: string; language: 'en' | 'no'; authorization: string }): Promise<AssistantResult> {
  const spotName = String(intent.arguments.spot || '')
  const spot = findSpotByLabel(spotName); const spotLabel = spot?.label || spotName
  const response = await logSurfExperience(new Request('http://frame.local/api/surf/experience/log', { method: 'POST', headers: { 'content-type': 'application/json', authorization: context.authorization }, body: JSON.stringify({ spotId: spot?.spotId || spotLabel, spot: spotLabel, loggedAt: surfLoggedAt(String(intent.arguments.date || 'today'), String(intent.arguments.time), context.localNow), rating_1_6: intent.arguments.rating, mode: 'detect', comment: String(intent.arguments.comment || '') }) }))
  const result = await response.json().catch(() => null)
  if (!response.ok || result?.duplicate) return friendlyError()
  return { status: 'completed', capabilityId: 'surf.log_experience', message: context.language === 'no' ? `Logget surfen på ${spotLabel}.` : `Logged your surf at ${spotLabel}.` }
}

async function loadSettings(db: SupabaseClient, deviceId: string) {
  const { data, error } = await db.from('device_settings').select('settings_json').eq('device_id', deviceId).maybeSingle()
  if (error) throw error
  return data?.settings_json && typeof data.settings_json === 'object' && !Array.isArray(data.settings_json) ? { ...(data.settings_json as Record<string, any>) } : {}
}
async function saveSettings(db: SupabaseClient, deviceId: string, settings: Record<string, any>) {
  const { data, error } = await db.rpc('upsert_device_settings', { p_device_id: deviceId, p_settings: settings })
  if (error || data !== true) throw error || new Error('settings_not_saved')
}

function missingArguments(intent: ResolvedAssistantIntent) {
  const capability = capabilityById(intent.capabilityId)!
  return capability.requiredArguments.filter((key) => intent.arguments[key] == null || intent.arguments[key] === '')
}

function normalizeFollowupArgument(key: string, answer: string, localNow: string) {
  if (key === 'time') return surfFollowupTime(answer)
  if (key !== 'date') return answer.trim()
  const match = answer.toLocaleLowerCase().match(/\b(\d{1,2})[.\s]+(januar|februar|mars|april|mai|juni|juli|august|september|oktober|november|desember|january|february|march|may|june|july|october|december)\b/i)
  if (!match) return null
  const months = ['januar january', 'februar february', 'mars march', 'april', 'mai may', 'juni june', 'juli july', 'august', 'september', 'oktober october', 'november', 'desember december']
  const month = months.findIndex((value) => value.includes(match[2])) + 1
  const now = new Date(localNow); let year = now.getUTCFullYear()
  const candidate = Date.UTC(year, month - 1, Number(match[1])); if (candidate < Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) year += 1
  return `${year}-${String(month).padStart(2, '0')}-${match[1].padStart(2, '0')}`
}

async function executeCapability(db: SupabaseClient, admin: SupabaseClient, user: User, deviceId: string, intent: ResolvedAssistantIntent, context: { localNow: string; timezone: string | null; language: 'en' | 'no'; authorization: string }): Promise<AssistantResult> {
  const id = intent.capabilityId
  if (id === 'groceries.add') {
    const items = intent.arguments.items as Array<{ name: string; quantity?: number }>; await addGroceryItemsCanonical(db, deviceId, items, crypto.randomUUID())
    return { status: 'completed', capabilityId: id, message: context.language === 'no' ? 'La til varene.' : 'Added the items.' }
  }
  if (id === 'football.set_team') {
    const requested = String(intent.arguments.team || '').toLocaleLowerCase()
    const team = ALL_TEAMS.find((candidate) => [candidate.teamName, candidate.teamId.replaceAll('_', ' '), candidate.teamName.split(/\s+/).at(-1)!].some((name) => name.toLocaleLowerCase() === requested))
    if (!team) return { status: 'needs_input', capabilityId: id, message: context.language === 'no' ? 'Hvilket fotballag vil du bruke?' : 'Which football team would you like to use?' }
    const settings = await loadSettings(db, deviceId); const modules = { ...(settings.modules || {}) }; const soccer = Array.isArray(modules.soccer) ? [...modules.soccer] : []
    const index = soccer.findIndex((row) => Number(row?.id) === 1); const value = { ...(index >= 0 ? soccer[index] : {}), id: 1, ...team }; if (index >= 0) soccer[index] = value; else soccer.push(value)
    modules.soccer = soccer; settings.modules = modules; await saveSettings(db, deviceId, settings)
    return { status: 'completed', capabilityId: id, message: context.language === 'no' ? `Fotballaget er byttet til ${team.teamName}.` : `Football team changed to ${team.teamName}.` }
  }
  if (id === 'football.read') {
    const settings = await loadSettings(db, deviceId); const team = Array.isArray(settings.modules?.soccer) ? settings.modules.soccer.find((row: any) => Number(row?.id) === 1)?.teamName : null
    return { status: 'completed', capabilityId: id, message: team ? (context.language === 'no' ? `Du følger ${team}.` : `You follow ${team}.`) : (context.language === 'no' ? 'Du har ikke valgt et fotballag.' : 'You have not selected a football team.') }
  }
  if (id === 'groceries.read') {
    const { data, error } = await db.from('grocery_items').select('name,quantity').eq('device_id', deviceId).eq('is_checked', false).order('updated_at', { ascending: false }).limit(20); if (error) throw error
    const items = (data || []).map((row: any) => `${row.quantity > 1 ? `${row.quantity} × ` : ''}${row.name}`)
    return { status: 'completed', capabilityId: id, message: items.length ? (context.language === 'no' ? `På handlelisten: ${items.join(', ')}.` : `On your shopping list: ${items.join(', ')}.`) : (context.language === 'no' ? 'Handlelisten er tom.' : 'Your shopping list is empty.') }
  }
  if (id === 'reminders.read') {
    const { data, error } = await db.from('reminders').select('title,due_date,due_time').eq('device_id', deviceId).eq('is_done', false).order('due_date').limit(10); if (error) throw error
    const reminders = (data || []).map((row: any) => row.title)
    return { status: 'completed', capabilityId: id, message: reminders.length ? (context.language === 'no' ? `Påminnelser: ${reminders.join(', ')}.` : `Reminders: ${reminders.join(', ')}.`) : (context.language === 'no' ? 'Du har ingen åpne påminnelser.' : 'You have no open reminders.') }
  }
  if (id === 'countdown.create') {
    const { error } = await db.from('countdown_events').insert({ device_id: deviceId, title: intent.arguments.title, target_date: intent.arguments.date, pinned: false, created_by_user_id: user.id, updated_by_user_id: user.id }); if (error) throw error
    return { status: 'completed', capabilityId: id, message: context.language === 'no' ? `Nedtelling til ${intent.arguments.title} er opprettet.` : `Countdown to ${intent.arguments.title} created.` }
  }
  if (id === 'settings.set_app_theme') {
    const theme = intent.arguments.theme === 'dark' ? 'dark' : intent.arguments.theme === 'light' ? 'light' : null; if (!theme) return friendlyError()
    const { error } = await db.from('user_app_preferences').upsert({ user_id: user.id, app_theme: theme }, { onConflict: 'user_id' }); if (error) throw error
    return { status: 'completed', capabilityId: id, message: context.language === 'no' ? `App-tema er satt til ${theme}.` : `App theme set to ${theme}.` }
  }
  if (id === 'frame.set_language' || id === 'frame.set_layout') {
    const settings = await loadSettings(db, deviceId)
    if (id === 'frame.set_language') settings.language = intent.arguments.language
    else {
      const layout = String(intent.arguments.layout)
      const slotCounts: Record<string, number> = { default: 3, pyramid: 4, square: 4, full: 1 }
      if (!slotCounts[layout]) return friendlyError()
      const currentCells = Array.isArray(settings.cells) ? settings.cells : []
      const memory = Array.isArray(settings.layout_module_memory) ? [...settings.layout_module_memory] : []
      for (const cell of currentCells) if (Number.isInteger(Number(cell?.slot)) && cell?.module) memory[Number(cell.slot)] = String(cell.module).split(':')[0]
      settings.layout = layout
      settings.cells = Array.from({ length: slotCounts[layout] }, (_, slot) => ({ slot, module: memory[slot] || '' }))
      settings.layout_module_memory = memory
      delete settings.custom_layout_id
    }
    await saveSettings(db, deviceId, settings)
    return { status: 'completed', capabilityId: id, message: id === 'frame.set_language' ? (context.language === 'no' ? 'Språket er oppdatert.' : 'Language updated.') : (context.language === 'no' ? 'Layouten er oppdatert.' : 'Layout updated.') }
  }
  if (id === 'weather.read') {
    const settings = await loadSettings(db, deviceId); const cfg = Array.isArray(settings.modules?.weather) ? settings.modules.weather[0] : null
    if (!cfg || !Number.isFinite(Number(cfg.lat)) || !Number.isFinite(Number(cfg.lon))) return { status: 'completed', capabilityId: id, message: context.language === 'no' ? 'Velg et værsted først.' : 'Choose a weather location first.', cta: { label: context.language === 'no' ? 'Åpne vær' : 'Open Weather', destination: 'weather' } }
    const response = await weatherDetails(new Request(`http://frame.local/api/weather/details?lat=${cfg.lat}&lon=${cfg.lon}&days=2`)); const payload: any = await response.json(); if (!response.ok) throw new Error('weather_unavailable')
    const index = intent.arguments.date === 'tomorrow' ? 1 : 0; const high = payload.weather?.daily?.temperature_2m_max?.[index]; const low = payload.weather?.daily?.temperature_2m_min?.[index]; const rain = payload.weather?.daily?.precipitation_sum?.[index]
    return { status: 'completed', capabilityId: id, message: `${cfg.label || 'Weather'}: ${low}–${high} °C${rain != null ? `, ${rain} mm` : ''}.` }
  }
  if (id === 'surf.read') {
    const spot = findSpotByLabel(String(intent.arguments.spot)); if (!spot) return friendlyError()
    const response = await surfScore(new Request(`http://frame.local/api/surf/score?spotId=${encodeURIComponent(spot.spotId)}&appForecast=1&daily=1&days=2`, { headers: { authorization: context.authorization } })); const payload: any = await response.json(); if (!response.ok) throw new Error('surf_unavailable')
    const day = payload.appForecast?.[intent.arguments.date === 'tomorrow' ? 1 : 0] || payload.daily?.[intent.arguments.date === 'tomorrow' ? 1 : 0]
    const best = Array.isArray(day?.buckets) ? [...day.buckets].sort((a, b) => Number(b.ratingScore || 0) - Number(a.ratingScore || 0))[0] : day
    return { status: 'completed', capabilityId: id, message: day ? `${spot.label}: ${best?.ratingLabel || best?.rating_label || ''} ${best?.waveHeight || best?.wave_height || ''}`.trim() : (context.language === 'no' ? `Ingen prognose for ${spot.label}.` : `No forecast for ${spot.label}.`) }
  }
  if (id === 'surf.log_experience') return executeSurfLog(intent, context)
  if (id === 'recipes.manage') return { status: 'completed', capabilityId: id, message: context.language === 'no' ? 'Åpner oppskrifter.' : 'Opening Recipes.', cta: { label: context.language === 'no' ? 'Åpne oppskrifter' : 'Open Recipes', destination: 'recipes' } }
  if (id === 'reminders.create') {
    const parsed = await parseReminder({ text: String(intent.arguments.text), ...context }); if (!parsed) return friendlyError()
    if (parsed.status === 'needs_clarification') {
      const { data, error } = await admin.from('assistant_pending_actions').insert({ user_id: user.id, device_id: deviceId, action: 'create_reminder', payload: { originalText: intent.arguments.text, partial: parsed.partial, question: parsed.question } }).select('id').single()
      return error ? friendlyError() : { status: 'needs_input', capabilityId: id, message: parsed.question, pendingId: data.id }
    }
    return saveReminder(db, user, deviceId, parsed.reminder)
  }
  return friendlyError()
}

export async function POST(request: Request) {
  const auth = request.headers.get('authorization') || ''
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: auth } } })
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: { user } } = await db.auth.getUser(); if (!user) return NextResponse.json({ message: 'Please sign in again.' }, { status: 401 })
  const body = await request.json().catch(() => null) as any
  if (!body || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 1000 || typeof body.deviceId !== 'string' || !['en', 'no'].includes(body.language)) return NextResponse.json({ status: 'error', message: "I can't do that yet." }, { status: 400 })
  const { data: allowed } = await db.rpc('consume_assistant_request', { p_kind: 'action', p_limit: 12 }); if (!allowed) return NextResponse.json({ status: 'error', message: 'Please wait a moment and try again.' }, { status: 429 })
  const { data: membership } = await db.from('device_members').select('device_id').eq('device_id', body.deviceId).eq('user_id', user.id).maybeSingle(); if (!membership) return NextResponse.json(friendlyError())

  let intent: ResolvedAssistantIntent | null = null
  if (body.pendingId) {
    const { data: pending } = await admin.from('assistant_pending_actions').select('id,action,payload,expires_at').eq('id', body.pendingId).eq('user_id', user.id).eq('device_id', body.deviceId).maybeSingle()
    if (!pending || new Date(pending.expires_at).getTime() <= Date.now()) return NextResponse.json({ status: 'error', message: 'That follow-up expired. Try again.' })
    if (pending.action === 'create_reminder') {
      const payload = validatePendingReminderPayload(pending.payload); const followup = payload && reminderFollowupContext(payload, body.text, { localNow: body.localNow, timezone: body.timezone || null, language: body.language }); if (!followup) return NextResponse.json(friendlyError())
      const parsed = await parseReminder(followup); if (!parsed || parsed.status === 'needs_clarification') return NextResponse.json(friendlyError()); await admin.from('assistant_pending_actions').delete().eq('id', pending.id); return NextResponse.json(await saveReminder(db, user, body.deviceId, parsed.reminder))
    }
    const payload = pending.payload as any; const capabilityId = payload?.capabilityId as AssistantCapabilityId
    if (!capabilityById(capabilityId)) return NextResponse.json(friendlyError())
    const missing = Array.isArray(payload.missingArguments) ? payload.missingArguments : []; const key = missing[0]
    const answer: unknown = normalizeFollowupArgument(key, body.text, body.localNow)
    intent = { capabilityId, arguments: { ...(payload.arguments || {}), ...(answer ? { [key]: answer } : {}) } }
  } else {
    intent = resolveDeterministicAssistantIntent(body.text)
    if (!intent) { const { data: aiAllowed } = await db.rpc('consume_assistant_request', { p_kind: 'intent', p_limit: 4 }); if (aiAllowed) intent = await aiIntent(body.text) }
  }
  if (!intent) return NextResponse.json({ status: 'needs_input', message: body.language === 'no' ? 'Hva vil du gjøre i RE:MIND?' : 'What would you like to do in RE:MIND?' })
  const handler = ASSISTANT_CAPABILITY_HANDLERS[intent.capabilityId]; const validated = handler.validate(intent.arguments); if (!validated) return NextResponse.json(friendlyError()); intent = { ...intent, arguments: validated }
  const missing = missingArguments(intent)
  if (missing.length) {
    const question = intent.capabilityId === 'surf.log_experience' && missing[0] === 'time' && intent.arguments.spot
      ? (body.language === 'no' ? `Når var du på ${intent.arguments.spot}?` : `What time were you at ${intent.arguments.spot}?`)
      : handler.missingQuestion[missing[0]]?.[body.language] || (body.language === 'no' ? `Hva skal ${missing[0]} være?` : `What should ${missing[0]} be?`)
    if (body.pendingId) await admin.from('assistant_pending_actions').delete().eq('id', body.pendingId).eq('user_id', user.id)
    const { data, error } = await admin.from('assistant_pending_actions').insert({ user_id: user.id, device_id: body.deviceId, action: 'capability', payload: { capabilityId: intent.capabilityId, arguments: intent.arguments, missingArguments: missing, originalText: body.text } }).select('id').single()
    return NextResponse.json(error ? friendlyError() : { status: 'needs_input', capabilityId: intent.capabilityId, message: question, pendingId: data.id })
  }
  try { const result = await handler.run(() => executeCapability(db, admin, user, body.deviceId, intent!, { localNow: body.localNow, timezone: body.timezone || null, language: body.language, authorization: auth })); if (body.pendingId && result.status === 'completed') await admin.from('assistant_pending_actions').delete().eq('id', body.pendingId); return NextResponse.json(result) }
  catch { return NextResponse.json(friendlyError()) }
}
