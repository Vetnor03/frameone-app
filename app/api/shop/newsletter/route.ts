import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendNewsletterWelcomeEmail } from '@/app/lib/newsletterEmail'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type NewsletterSubscriber = {
  id: string
  email: string
  unsubscribe_token: string
  unsubscribed_at: string | null
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const source = typeof body?.source === 'string' && body.source.trim()
    ? body.source.trim().slice(0, 100)
    : 'shop'

  if (!email || email.length > 320 || !emailPattern.test(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 })
  }

  const supabase = adminClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Newsletter signup is not configured.' }, { status: 500 })
  }

  const { data: existing, error: lookupError } = await supabase
    .from('newsletter_subscribers')
    .select('id,email,unsubscribe_token,unsubscribed_at')
    .eq('email', email)
    .maybeSingle<NewsletterSubscriber>()

  if (lookupError) {
    console.error('[newsletter] Subscriber lookup failed.', { error: lookupError })
    return NextResponse.json({ error: 'Unable to join the newsletter right now.' }, { status: 500 })
  }

  if (existing && !existing.unsubscribed_at) {
    return NextResponse.json({ ok: true })
  }

  const unsubscribeToken = randomUUID()
  const now = new Date().toISOString()
  const query = existing
    ? supabase
        .from('newsletter_subscribers')
        .update({ source, subscribed_at: now, unsubscribed_at: null, unsubscribe_token: unsubscribeToken })
        .eq('id', existing.id)
    : supabase
        .from('newsletter_subscribers')
        .insert({ email, source, unsubscribe_token: unsubscribeToken })

  const { data: subscriber, error } = await query
    .select('id,email,unsubscribe_token,unsubscribed_at')
    .single<NewsletterSubscriber>()

  if (error || !subscriber) {
    console.error('[newsletter] Subscriber save failed.', { error })
    return NextResponse.json({ error: 'Unable to join the newsletter right now.' }, { status: 500 })
  }

  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL
  const siteUrl = configuredSiteUrl || new URL(request.url).origin
  const emailSent = await sendNewsletterWelcomeEmail({ email, unsubscribeToken, siteUrl })

  if (emailSent) {
    const { error: emailUpdateError } = await supabase
      .from('newsletter_subscribers')
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq('id', subscriber.id)
    if (emailUpdateError) console.error('[newsletter] Email status update failed.', { error: emailUpdateError })
  }

  return NextResponse.json({ ok: true })
}
