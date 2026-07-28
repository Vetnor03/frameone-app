import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const tokenPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function page(message: string, status = 200) {
  return new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>RE:MIND newsletter</title></head><body style="font-family:Arial,sans-serif;margin:0;background:#faf9f7;color:#111"><main style="max-width:560px;margin:80px auto;padding:24px"><h1 style="letter-spacing:.12em">RE:MIND</h1><p>${message}</p><a href="/shop" style="color:#111">Return to shop</a></main></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || ''
  if (!tokenPattern.test(token)) return page('This unsubscribe link is invalid.', 400)

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return page('Unsubscribe is temporarily unavailable. Please try again later.', 500)

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await supabase
    .from('newsletter_subscribers')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('unsubscribe_token', token)
    .is('unsubscribed_at', null)
    .select('id')

  if (error) {
    console.error('[newsletter] Unsubscribe failed.', { error })
    return page('Unsubscribe is temporarily unavailable. Please try again later.', 500)
  }

  return page(data?.length ? 'You have been unsubscribed from the newsletter.' : 'You are already unsubscribed from the newsletter.')
}
