import { NextResponse } from 'next/server'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { parseReminder } from '@/app/lib/reminders/parser'
import { resolveDeterministicAssistantIntent, validateModelIntent } from '@/app/lib/assistant/resolver'
import type { AssistantResult, ResolvedAssistantIntent } from '@/app/lib/assistant/types'

export const runtime = 'nodejs'
const attempts = new Map<string, number[]>()

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

export async function executeAssistantAction(db: SupabaseClient, user: User, deviceId: string, intent: ResolvedAssistantIntent, context: { localNow: string; timezone: string | null; language: 'en' | 'no' }): Promise<AssistantResult> {
  if (intent.action === 'answer_help') return intent.response
  const { data: membership } = await db.from('device_members').select('device_id').eq('device_id', deviceId).eq('user_id', user.id).maybeSingle()
  if (!membership) return friendlyError()
  if (intent.action === 'add_grocery_items') {
    const clean = [...new Map(intent.arguments.items.map((name) => [name.trim().toLocaleLowerCase(), name.trim().replace(/\s+/g, ' ')])).values()].filter((name) => name.length <= 80)
    if (!clean.length) return { status: 'needs_input', action: 'add_grocery_items', message: 'Which groceries should I add?' }
    const { data: rows, error } = await db.from('grocery_items').select('id,name,quantity,is_checked').eq('device_id', deviceId)
    if (error) return friendlyError()
    for (const name of clean) {
      const existing = rows?.find((row) => String(row.name).trim().toLocaleLowerCase() === name.toLocaleLowerCase())
      const result = existing
        ? await db.from('grocery_items').update({ quantity: Math.max(1, Number(existing.quantity) || 1) + 1, is_checked: false, checked_at: null }).eq('id', existing.id).eq('device_id', deviceId)
        : await db.from('grocery_items').insert({ device_id: deviceId, created_by: user.id, name, quantity: 1, category: 'other', is_checked: false })
      if (result.error) return friendlyError()
    }
    return { status: 'completed', action: 'add_grocery_items', message: `Added ${clean.length} ${clean.length === 1 ? 'item' : 'items'} to Groceries ✓` }
  }
  const parsed = await parseReminder({ text: intent.arguments.text, ...context })
  if (!parsed) return { status: 'error', action: 'create_reminder', message: "I couldn't create that reminder. Try again." }
  if (parsed.status === 'needs_clarification') return { status: 'needs_input', action: 'create_reminder', message: parsed.question }
  const reminder = parsed.reminder
  const { error } = await db.from('reminders').insert({ device_id: deviceId, created_by_user_id: user.id, updated_by_user_id: user.id, title: reminder.title, due_date: reminder.due_date, due_time: reminder.due_time, end_date: reminder.end_date, end_time: reminder.end_time, tag: reminder.tag, repeat_type: reminder.repeat_type, custom_repeat_days: reminder.custom_repeat_days, is_done: false })
  return error ? { status: 'error', action: 'create_reminder', message: "I couldn't create that reminder. Try again." } : { status: 'completed', action: 'create_reminder', message: 'Reminder created ✓' }
}

export async function POST(request: Request) {
  const auth = request.headers.get('authorization') || ''
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { global: { headers: { Authorization: auth } } })
  const { data: { user } } = await db.auth.getUser()
  if (!user) return NextResponse.json({ message: 'Please sign in again.' }, { status: 401 })
  const now = Date.now(), recent = (attempts.get(user.id) || []).filter((time) => now - time < 60_000)
  if (recent.length >= 12) return NextResponse.json({ status: 'error', message: 'Please wait a moment and try again.' }, { status: 429 })
  attempts.set(user.id, [...recent, now])
  const body = await request.json().catch(() => null) as null | { text?: unknown; deviceId?: unknown; localNow?: unknown; timezone?: unknown; language?: unknown }
  if (!body || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 1_000 || typeof body.deviceId !== 'string' || typeof body.localNow !== 'string' || !Date.parse(body.localNow) || (body.language !== 'en' && body.language !== 'no') || (body.timezone != null && typeof body.timezone !== 'string')) return NextResponse.json({ status: 'error', message: "I can't do that yet." }, { status: 400 })
  const intent = resolveDeterministicAssistantIntent(body.text) ?? await aiIntent(body.text)
  if (!intent) return NextResponse.json({ status: 'error', message: "I can't do that yet." })
  try { return NextResponse.json(await executeAssistantAction(db, user, body.deviceId, intent, { localNow: body.localNow, timezone: body.timezone || null, language: body.language })) }
  catch { return NextResponse.json(friendlyError()) }
}

