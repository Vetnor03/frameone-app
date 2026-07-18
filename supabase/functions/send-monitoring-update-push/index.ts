import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const contact = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@remind.local'
webpush.setVapidDetails(contact, Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)
const DEFAULT_MAX_ATTEMPTS = 5

function concise(value: unknown, max = 130) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function nextAttempt(attempts: number) {
  const minutes = Math.min(240, Math.max(5, Math.pow(2, Math.max(0, attempts - 1)) * 5))
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

async function processDelivery(db: any, delivery: any, maxAttempts: number) {
  const { data: pref } = await db.from('user_notification_preferences').select('push_enabled,permission_state').eq('user_id', delivery.user_id).maybeSingle()
  if (!pref?.push_enabled) {
    await db.from('monitoring_update_push_deliveries').update({ status: 'suppressed', last_error: 'notifications_disabled' }).eq('id', delivery.id)
    return { id: delivery.id, status: 'suppressed', sent: 0 }
  }

  const { data: update } = await db.from('monitoring_updates').select('id,headline,summary,watch_id,monitoring_watches(title)').eq('id', delivery.monitoring_update_id).maybeSingle()
  const { data: subs } = await db.from('user_push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id', delivery.user_id).eq('enabled', true)
  if (!subs?.length) {
    await db.from('monitoring_update_push_deliveries').update({ status: 'no_subscription', last_error: 'no_active_subscriptions' }).eq('id', delivery.id)
    return { id: delivery.id, status: 'no_subscription', sent: 0 }
  }

  let sent = 0
  let transientFailures = 0
  const invalidSubscriptions: string[] = []
  const transientMessages: string[] = []
  const title = concise(`RE:MIND · ${(update as any)?.monitoring_watches?.title || 'AI Assistant'}`, 70)
  const payload = JSON.stringify({ title, body: concise(update?.summary || update?.headline), url: `/?tab=assistant&watch=${update?.watch_id || ''}&update=${delivery.monitoring_update_id}`, tag: `monitoring-update-${delivery.monitoring_update_id}` })

  for (const sub of subs) {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
      sent++
    } catch (error) {
      const statusCode = Number((error as { statusCode?: number })?.statusCode || 0)
      const message = String((error as Error)?.message || error)
      if (statusCode === 404 || statusCode === 410) {
        invalidSubscriptions.push(sub.id)
        await db.from('user_push_subscriptions').update({ enabled: false, last_error: message }).eq('id', sub.id)
      } else {
        transientFailures++
        transientMessages.push(message.slice(0, 120))
        await db.from('user_push_subscriptions').update({ last_error: message }).eq('id', sub.id)
      }
    }
  }

  if (sent > 0) {
    await db.from('monitoring_update_push_deliveries').update({ status: 'sent', sent_at: new Date().toISOString(), last_error: transientFailures ? `partial_failure:${transientFailures}` : null }).eq('id', delivery.id)
    return { id: delivery.id, status: 'sent', sent, invalid: invalidSubscriptions.length, transient_failures: transientFailures }
  }

  if (transientFailures > 0) {
    const terminal = delivery.attempts >= maxAttempts
    await db.from('monitoring_update_push_deliveries').update({ status: terminal ? 'suppressed' : 'failed', last_error: transientMessages[0] || 'push_transient_failure', next_attempt_at: terminal ? new Date().toISOString() : nextAttempt(delivery.attempts) }).eq('id', delivery.id)
    return { id: delivery.id, status: terminal ? 'suppressed' : 'failed', sent: 0, retryable: !terminal }
  }

  await db.from('monitoring_update_push_deliveries').update({ status: 'no_subscription', last_error: invalidSubscriptions.length ? 'all_subscriptions_invalid' : 'no_active_subscriptions' }).eq('id', delivery.id)
  return { id: delivery.id, status: 'no_subscription', sent: 0, invalid: invalidSubscriptions.length }
}

Deno.serve(async (req) => {
  const auth = req.headers.get('authorization') || ''
  if (auth !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` && req.headers.get('x-monitoring-secret') !== Deno.env.get('MONITORING_WORKER_SECRET')) return new Response('Unauthorized', { status: 401 })
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = await req.json().catch(() => ({})) as { monitoring_update_id?: string; limit?: number; max_attempts?: number }
  const limit = Math.max(1, Math.min(50, Number(body.limit || new URL(req.url).searchParams.get('limit') || 10)))
  const maxAttempts = Math.max(1, Math.min(10, Number(body.max_attempts || Deno.env.get('PUSH_MAX_ATTEMPTS') || DEFAULT_MAX_ATTEMPTS)))

  const { data: deliveries, error } = await db.rpc('claim_monitoring_update_push_deliveries', {
    p_monitoring_update_id: body.monitoring_update_id || null,
    max_count: body.monitoring_update_id ? 1 : limit,
    max_attempts: maxAttempts,
  })
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })
  if (!deliveries?.length) return Response.json({ ok: true, claimed: 0 })

  const results = []
  for (const delivery of deliveries) results.push(await processDelivery(db, delivery, maxAttempts))
  return Response.json({ ok: true, claimed: deliveries.length, results })
})
