import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const contact = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@remind.local'
webpush.setVapidDetails(contact, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)

function concise(value: unknown, max = 130) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

Deno.serve(async (req) => {
  const auth = req.headers.get('authorization') || ''
  if (auth !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` && req.headers.get('x-monitoring-secret') !== Deno.env.get('MONITORING_WORKER_SECRET')) return new Response('Unauthorized', { status: 401 })
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = await req.json().catch(() => ({})) as { monitoring_update_id?: string }
  const updateId = body.monitoring_update_id
  if (!updateId) return Response.json({ ok: false, error: 'missing_monitoring_update_id' }, { status: 400 })

  const { data: delivery, error: deliveryError } = await db.from('monitoring_update_push_deliveries').select('*').eq('monitoring_update_id', updateId).in('status', ['pending','failed']).maybeSingle()
  if (deliveryError) return Response.json({ ok: false, error: deliveryError.message }, { status: 500 })
  if (!delivery) return Response.json({ ok: true, skipped: true, reason: 'already_sent_or_suppressed' })

  const { error: claimError } = await db.from('monitoring_update_push_deliveries').update({ status: 'sending', attempts: (delivery.attempts || 0) + 1 }).eq('id', delivery.id).in('status', ['pending','failed'])
  if (claimError) return Response.json({ ok: false, error: claimError.message }, { status: 500 })

  const { data: pref } = await db.from('user_notification_preferences').select('push_enabled,permission_state').eq('user_id', delivery.user_id).maybeSingle()
  if (!pref?.push_enabled || pref.permission_state !== 'granted') {
    await db.from('monitoring_update_push_deliveries').update({ status: 'suppressed', last_error: 'notifications_disabled' }).eq('id', delivery.id)
    return Response.json({ ok: true, suppressed: true })
  }

  const { data: update } = await db.from('monitoring_updates').select('id,headline,summary,watch_id,monitoring_watches(title)').eq('id', updateId).maybeSingle()
  const { data: subs } = await db.from('user_push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', delivery.user_id).eq('enabled', true)
  let sent = 0
  const title = concise(`RE:MIND · ${(update as any)?.monitoring_watches?.title || 'AI Assistant'}`, 70)
  const payload = JSON.stringify({ title, body: concise(update?.summary || update?.headline), url: `/?tab=assistant&watch=${update?.watch_id || ''}&update=${updateId}`, tag: `monitoring-update-${updateId}` })
  for (const sub of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
      sent++
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 0)
      const message = String((error as Error)?.message || error)
      if (statusCode === 404 || statusCode === 410) await db.from('user_push_subscriptions').update({ enabled: false, last_error: message }).eq('id', sub.id)
      else await db.from('user_push_subscriptions').update({ last_error: message }).eq('id', sub.id)
    }
  }
  await db.from('monitoring_update_push_deliveries').update({ status: 'sent', sent_at: new Date().toISOString(), last_error: sent ? null : 'no_active_subscriptions' }).eq('id', delivery.id)
  return Response.json({ ok: true, sent })
})
