import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseReminder, validateParsedReminder, type ReminderParseContext } from '@/app/lib/reminders/parser'

export async function POST(request: Request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: auth } = await supabaseAdmin.auth.getUser(token)
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: Partial<ReminderParseContext>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  const isClarification = body.partial !== undefined || body.clarificationQuestion !== undefined || body.clarificationAnswer !== undefined
  if (typeof body.text !== 'string' || body.text.trim().length < 1 || body.text.length > 2_000 || typeof body.localNow !== 'string' || !Date.parse(body.localNow) || (body.language !== 'en' && body.language !== 'no') || (body.timezone != null && typeof body.timezone !== 'string') || (isClarification && (!validateParsedReminder(body.partial) || typeof body.clarificationQuestion !== 'string' || !body.clarificationQuestion.trim() || body.clarificationQuestion.length > 240 || typeof body.clarificationAnswer !== 'string' || !body.clarificationAnswer.trim() || body.clarificationAnswer.length > 1_000))) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const result = await parseReminder({
    text: body.text, localNow: body.localNow, timezone: body.timezone || null, language: body.language,
    partial: body.partial, clarificationQuestion: body.clarificationQuestion, clarificationAnswer: body.clarificationAnswer,
  })
  if (!result) return NextResponse.json({ status: 'failed', error: 'Could not parse reminder' }, { status: 503 })
  return NextResponse.json(result)
}
