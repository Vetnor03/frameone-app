import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { mockMonitoringResult, monitoringModelFromEnv, runOpenAIWatch, stableFingerprint } from '../_shared/monitoring/provider.ts'

const MINUTES = 60_000

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
  if (watchError || !watch || (watch.status !== 'active' && watch.status !== 'error')) {
    await supabase.from('monitoring_queue').update({ completed_at: new Date().toISOString(), last_error: watchError?.message || 'watch_not_processable' }).eq('id', job.id)
    return { job_id: job.id, ok: true, skipped: true }
  }

  const provider = Deno.env.get('MONITORING_PROVIDER') || 'mock'
  const model = provider === 'openai' ? (monitoringModelFromEnv(Deno.env)) : 'mock'
  const staleRunBefore = new Date(Date.now() - 30 * MINUTES).toISOString()
  await supabase.from('monitoring_runs').update({ status: 'error', completed_at: new Date().toISOString(), error_message: 'stale_running_run_recovered' }).eq('watch_id', watch.id).eq('status', 'running').lt('started_at', staleRunBefore)
  const { data: run, error: runError } = await supabase.from('monitoring_runs').insert({ watch_id: watch.id, status: 'running', provider, model }).select('id').single()
  if (runError) {
    if (String(runError.code).includes('23505')) {
      await supabase.from('monitoring_queue').update({ claimed_at: null, claimed_by: null, run_after: new Date(Date.now() + 5 * MINUTES).toISOString(), last_error: 'watch_already_running' }).eq('id', job.id)
      return { job_id: job.id, watch_id: watch.id, ok: false, error: 'watch_already_running', retry_in_minutes: 5 }
    }
    throw runError
  }

  try {
    const { data: previousUpdates } = await supabase.from('monitoring_updates').select('headline,summary,event_at,fingerprint,source_urls,created_at').eq('watch_id', watch.id).order('created_at', { ascending: false }).limit(10)
    const result = provider === 'openai'
      ? await runOpenAIWatch({ ...watch, previous_updates: previousUpdates ?? [] }, Deno.env.get('OPENAI_API_KEY')!, model)
      : mockMonitoringResult(Deno.env.get('MONITORING_MOCK_MODE') || 'no_change')
    const status = result.status === 'change' && result.trigger_met ? 'change' : result.status
    let createdUpdate = false
    const nextMinutes = Math.max(5, Math.min(10080, Number(result.suggested_next_check_minutes || watch.frequency_minutes)))

    if (status === 'change') {
      const fingerprint = stableFingerprint(result)
      if (fingerprint && result.headline && result.summary && result.sources.length > 0) {
        const { error } = await supabase.from('monitoring_updates').insert({ watch_id: watch.id, run_id: run.id, headline: result.headline, summary: result.summary, event_at: result.event_at, confidence: result.confidence, fingerprint, source_urls: result.sources, is_read: false, dismissed_from_frame: false })
        if (!error) createdUpdate = true
        else if (!String(error.code).includes('23505')) throw error
      }
    }

    await supabase.from('monitoring_runs').update({ status, completed_at: new Date().toISOString(), response_id: result.response_id ?? null, raw_result: result.raw ?? result, usage: result.usage ?? {} }).eq('id', run.id)
    await supabase.from('monitoring_watches').update({ last_checked_at: new Date().toISOString(), next_check_at: new Date(Date.now() + nextMinutes * MINUTES).toISOString(), status: 'active' }).eq('id', watch.id)
    await supabase.from('monitoring_queue').update({ completed_at: new Date().toISOString(), last_error: null }).eq('id', job.id)
    return { job_id: job.id, watch_id: watch.id, ok: true, status, created_update: createdUpdate }
  } catch (err) {
    const message = String(err?.message || err)
    const backoffMinutes = Math.min(1440, Math.pow(2, Math.min(job.attempts, 8)) * 5)
    await supabase.from('monitoring_runs').update({ status: 'error', completed_at: new Date().toISOString(), error_message: message }).eq('id', run.id)
    await supabase.from('monitoring_watches').update({ last_checked_at: new Date().toISOString(), next_check_at: new Date(Date.now() + backoffMinutes * MINUTES).toISOString(), status: 'error' }).eq('id', watch.id)
    await supabase.from('monitoring_queue').update({ claimed_at: null, claimed_by: null, run_after: new Date(Date.now() + backoffMinutes * MINUTES).toISOString(), last_error: message }).eq('id', job.id)
    return { job_id: job.id, watch_id: watch.id, ok: false, error: message, retry_in_minutes: backoffMinutes }
  }
}
