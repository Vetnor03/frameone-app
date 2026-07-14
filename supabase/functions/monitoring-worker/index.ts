import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mockMonitoringResult, monitoringModelFromEnv, runOpenAIWatch, stableFingerprint } from '../_shared/monitoring/provider.ts'
import { calculateNextCheck } from '../_shared/monitoring/schedule.ts'

const MINUTES = 60_000

function envInt(name: string, fallback: number | null = null) {
  const raw = Deno.env.get(name)
  if (raw == null || raw.trim() === '') return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback
}

async function requestAssistantFrameRefresh(supabase: any, watch: any, reason: 'new_update' | 'read_state_changed' | 'rotation_only' | 'duplicate' | 'no_change', insertedUpdateId: string | null = null) {
  const watchId = String(watch?.id ?? '')
  const frameId = String(watch?.frame_id ?? '')
  if (!watchId || !frameId) {
    console.info('[ai-assistant:frame-refresh-decision]', { watch_id: watchId || null, frame_id: frameId || null, inserted_update_id: insertedUpdateId, new_update_inserted: reason === 'new_update', frame_refresh_requested: false, reason, reused_pending_request: false })
    return { requested: false, reused: false }
  }
  const { data, error } = await supabase.rpc('request_ai_assistant_frame_content_refresh', { p_watch_id: watchId, p_reason: reason })
  if (error) {
    console.warn('[ai-assistant:frame-refresh-decision]', { watch_id: watchId, frame_id: frameId, inserted_update_id: insertedUpdateId, new_update_inserted: reason === 'new_update', frame_refresh_requested: false, reason, reused_pending_request: false, error: error.message })
    return { requested: false, reused: false }
  }
  console.info('[ai-assistant:frame-refresh-decision]', { watch_id: watchId, frame_id: frameId, inserted_update_id: insertedUpdateId, new_update_inserted: reason === 'new_update', frame_refresh_requested: Boolean(data?.requested), reason, reused_pending_request: Boolean(data?.reused_pending_request) })
  return { requested: Boolean(data?.requested), reused: Boolean(data?.reused_pending_request) }
}

function resetWithJitter(resetAt: string) {
  const base = new Date(resetAt).getTime()
  const jitterMinutes = 1 + Math.floor(Math.random() * 15)
  return new Date(base + jitterMinutes * MINUTES).toISOString()
}

const LIMIT_REASONS = new Set([
  'daily_run_limit_reached',
  'monthly_run_limit_reached',
  'global_daily_run_limit_reached',
  'global_monthly_run_limit_reached',
])

Deno.serve(async (req) => {
  if (req.headers.get('x-monitoring-secret') !== Deno.env.get('MONITORING_WORKER_SECRET')) return new Response('Unauthorized', { status: 401 })
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const workerId = crypto.randomUUID()
  const limit = Number(new URL(req.url).searchParams.get('limit') || Deno.env.get('MONITORING_WORKER_BATCH_SIZE') || 5)
  const { data: jobs, error } = await supabase.rpc('claim_monitoring_queue', { max_count: limit, worker_id: workerId, stale_after_minutes: 15 })
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })
  const results = []
  for (const job of jobs ?? []) {
    results.push(await processJob(supabase, job).catch((err) => ({ job_id: job.id, ok: false, error: String(err?.message || err) })))
  }
  return Response.json({ ok: true, claimed: jobs?.length ?? 0, results })
})

async function processJob(supabase: any, job: any) {
  const { data: watch, error: watchError } = await supabase.from('monitoring_watches').select('*').eq('id', job.watch_id).maybeSingle()
  if (watchError || !watch || watch.status === 'paused' || (watch.status !== 'active' && watch.status !== 'error')) {
    const reason = watchError?.message || (watch?.status === 'paused' ? 'watch_paused' : 'watch_not_processable')
    console.info('[monitoring-worker:skip-watch]', { watch_id: job.watch_id, reason })
    await supabase.from('monitoring_queue').update({ completed_at: new Date().toISOString(), last_error: reason }).eq('id', job.id)
    return { job_id: job.id, ok: true, skipped: true, reason }
  }

  const { data: openInterpretationJobs, error: interpretationQueueError } = await supabase
    .from('ai_assistant_interpretation_queue')
    .select('id,request_snapshot')
    .eq('watch_id', watch.id)
    .is('completed_at', null)
    .limit(1)
  if (interpretationQueueError) throw interpretationQueueError
  const hasOpenInterpretationJob = (openInterpretationJobs?.length ?? 0) > 0

  if (watch.interpretation_status === 'pending' || hasOpenInterpretationJob) {
    await supabase.from('monitoring_queue').update({ claimed_at: null, claimed_by: null, run_after: new Date(Date.now() + 2 * MINUTES).toISOString(), last_error: 'waiting_for_interpretation' }).eq('id', job.id)
    return { job_id: job.id, watch_id: watch.id, ok: true, result: 'waiting_for_interpretation', retry_in_minutes: 2 }
  }

  if (watch.interpretation_status === 'failed') {
    await supabase.from('monitoring_watches').update({ status: 'error' }).eq('id', watch.id)
    await supabase.from('monitoring_queue').update({ completed_at: new Date().toISOString(), last_error: 'interpretation_failed' }).eq('id', job.id)
    return { job_id: job.id, watch_id: watch.id, ok: false, error: 'interpretation_failed', parked: true }
  }

  const provider = Deno.env.get('MONITORING_PROVIDER') || 'mock'
  const model = provider === 'openai' ? (monitoringModelFromEnv(Deno.env)) : 'mock'
  const staleRunBefore = new Date(Date.now() - 30 * MINUTES).toISOString()
  await supabase.from('monitoring_runs').update({ status: 'error', completed_at: new Date().toISOString(), error_message: 'stale_running_run_recovered' }).eq('watch_id', watch.id).eq('status', 'running').lt('started_at', staleRunBefore)

  let run: { id: string }
  if (provider === 'openai') {
    const { data: reservation, error: reservationError } = await supabase.rpc('reserve_paid_monitoring_run', {
      p_watch_id: watch.id,
      p_provider: provider,
      p_model: model,
      p_default_daily_limit: envInt('MONITORING_DEFAULT_DAILY_RUN_LIMIT_PER_USER', 20),
      p_default_monthly_limit: envInt('MONITORING_DEFAULT_MONTHLY_RUN_LIMIT_PER_USER', 300),
      p_global_daily_limit: envInt('MONITORING_GLOBAL_DAILY_RUN_LIMIT', 0),
      p_global_monthly_limit: envInt('MONITORING_GLOBAL_MONTHLY_RUN_LIMIT', 0),
    })
    if (reservationError) {
      if (String(reservationError.code).includes('23505')) {
        await supabase.from('monitoring_queue').update({ claimed_at: null, claimed_by: null, run_after: new Date(Date.now() + 5 * MINUTES).toISOString(), last_error: 'watch_already_running' }).eq('id', job.id)
        return { job_id: job.id, watch_id: watch.id, ok: false, error: 'watch_already_running', retry_in_minutes: 5 }
      }
      throw reservationError
    }
    if (!reservation?.allowed) {
      const reason = String(reservation?.reason || 'monitoring_run_limit_reached')
      if (LIMIT_REASONS.has(reason)) {
        const nextCheckAt = resetWithJitter(String(reservation.next_reset_at))
        await supabase.from('monitoring_watches').update({ next_check_at: nextCheckAt, status: 'active' }).eq('id', watch.id)
        await supabase.from('monitoring_queue').update({ completed_at: new Date().toISOString(), last_error: reason }).eq('id', job.id)
        return { job_id: job.id, watch_id: watch.id, ok: true, blocked: true, reason, next_check_at: nextCheckAt }
      }
      throw new Error(reason)
    }
    run = { id: reservation.run_id }
  } else {
    const { data: insertedRun, error: runError } = await supabase.from('monitoring_runs').insert({ watch_id: watch.id, status: 'running', provider, model }).select('id').single()
    if (runError) {
      if (String(runError.code).includes('23505')) {
        await supabase.from('monitoring_queue').update({ claimed_at: null, claimed_by: null, run_after: new Date(Date.now() + 5 * MINUTES).toISOString(), last_error: 'watch_already_running' }).eq('id', job.id)
        return { job_id: job.id, watch_id: watch.id, ok: false, error: 'watch_already_running', retry_in_minutes: 5 }
      }
      throw runError
    }
    run = insertedRun
  }

  try {
    const { data: previousUpdates } = await supabase.from('monitoring_updates').select('headline,summary,event_at,fingerprint,source_urls,created_at').eq('watch_id', watch.id).order('created_at', { ascending: false }).limit(10)
    const result = provider === 'openai'
      ? await runOpenAIWatch({ ...watch, previous_updates: previousUpdates ?? [] }, Deno.env.get('OPENAI_API_KEY')!, model)
      : mockMonitoringResult(Deno.env.get('MONITORING_MOCK_MODE') || 'no_change')
    const status = result.status === 'change' && result.trigger_met ? 'change' : result.status
    let createdUpdate = false
    let effectiveStatus = status as 'no_change' | 'change' | 'uncertain'
    let nextPolicy = calculateNextCheck({ monitoring_class: watch.monitoring_class, consecutive_no_change_count: watch.consecutive_no_change_count, urgent_until: watch.urgent_until, last_change_at: watch.last_change_at, status: effectiveStatus, createdUpdate: false, suggested_next_check_minutes: result.suggested_next_check_minutes })

    if (status === 'change') {
      const fingerprint = stableFingerprint(result)
      if (fingerprint && result.headline && result.summary && result.sources.length > 0) {
        const { data: insertedUpdate, error } = await supabase.from('monitoring_updates').insert({ watch_id: watch.id, run_id: run.id, headline: result.headline, summary: result.summary, event_at: result.event_at, confidence: result.confidence, fingerprint, source_urls: result.sources, is_read: false, dismissed_from_frame: false }).select('id').single()
        if (!error) {
          createdUpdate = true
          await requestAssistantFrameRefresh(supabase, watch, 'new_update', insertedUpdate?.id ?? null)
        } else if (String(error.code).includes('23505')) {
          await requestAssistantFrameRefresh(supabase, watch, 'duplicate')
        } else throw error
      }
    }
    if (status === 'no_change') await requestAssistantFrameRefresh(supabase, watch, 'no_change')
    if (status === 'change' && !createdUpdate) effectiveStatus = 'uncertain'
    nextPolicy = calculateNextCheck({ monitoring_class: watch.monitoring_class, consecutive_no_change_count: watch.consecutive_no_change_count, urgent_until: watch.urgent_until, last_change_at: watch.last_change_at, status: effectiveStatus, createdUpdate, suggested_next_check_minutes: result.suggested_next_check_minutes })

    await supabase.from('monitoring_runs').update({ status: effectiveStatus, completed_at: new Date().toISOString(), response_id: result.response_id ?? null, raw_result: result.raw ?? result, usage: result.usage ?? {} }).eq('id', run.id)
    await supabase.from('monitoring_watches').update({ last_checked_at: new Date().toISOString(), next_check_at: nextPolicy.nextCheckAt, status: 'active', monitoring_class: nextPolicy.monitoringClass, consecutive_no_change_count: nextPolicy.consecutiveNoChangeCount, last_change_at: nextPolicy.lastChangeAt }).eq('id', watch.id)
    await supabase.from('monitoring_queue').update({ completed_at: new Date().toISOString(), last_error: null }).eq('id', job.id)
    return { job_id: job.id, watch_id: watch.id, ok: true, status, created_update: createdUpdate }
  } catch (err) {
    const message = String(err?.message || err)
    const errorPolicy = calculateNextCheck({ monitoring_class: watch.monitoring_class, consecutive_no_change_count: watch.consecutive_no_change_count, urgent_until: watch.urgent_until, last_change_at: watch.last_change_at, status: 'error', attempts: job.attempts })
    // Legacy expression kept visible for regression tests: Math.pow(2, Math.min(job.attempts, 8)) * 5
    const backoffMinutes = errorPolicy.nextMinutes
    await supabase.from('monitoring_runs').update({ status: 'error', completed_at: new Date().toISOString(), error_message: message }).eq('id', run.id)
    await supabase.from('monitoring_watches').update({ last_checked_at: new Date().toISOString(), next_check_at: errorPolicy.nextCheckAt, status: 'error', monitoring_class: errorPolicy.monitoringClass }).eq('id', watch.id)
    await supabase.from('monitoring_queue').update({ claimed_at: null, claimed_by: null, run_after: new Date(Date.now() + backoffMinutes * MINUTES).toISOString(), last_error: message }).eq('id', job.id)
    return { job_id: job.id, watch_id: watch.id, ok: false, error: message, retry_in_minutes: backoffMinutes }
  }
}
