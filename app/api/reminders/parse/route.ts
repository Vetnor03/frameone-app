import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseReminder, type ReminderParseContext } from '@/app/lib/reminders/parser'

export async function POST(request: Request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabaseAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: auth } = await supabaseAdmin.auth.getUser(token)
  if (!auth.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: Partial<ReminderParseContext>
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  if (typeof body.text !== 'string' || body.text.trim().length < 1 || body.text.length > 2_000 || typeof body.localNow !== 'string' || !Date.parse(body.localNow) || (body.language !== 'en' && body.language !== 'no') || (body.timezone != null && typeof body.timezone !== 'string')) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
  const reminder = await parseReminder({ text: body.text, localNow: body.localNow, timezone: body.timezone || null, language: body.language })
  if (!reminder) return NextResponse.json({ error: 'Could not parse reminder' }, { status: 503 })
  return NextResponse.json({ reminder })
}
