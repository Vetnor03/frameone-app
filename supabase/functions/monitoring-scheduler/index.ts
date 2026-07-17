import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.headers.get('x-monitoring-secret') !== Deno.env.get('MONITORING_CRON_SECRET')) return new Response('Unauthorized', { status: 401 })
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const max = Number(new URL(req.url).searchParams.get('max') || Deno.env.get('MONITORING_SCHEDULER_BATCH_SIZE') || 100)
  const mode = Deno.env.get('RADAR_SOURCE_PROBE_MODE') || 'off'
  const allowlistRaw = Deno.env.get('RADAR_TWO_STAGE_OWNER_ALLOWLIST') || ''
  const allowlistedOwners = allowlistRaw.split(',').map((value) => value.trim()).filter((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
  const guardedConfigValid = allowlistRaw.trim() !== '' && allowlistedOwners.length === allowlistRaw.split(',').filter(Boolean).length
  const discoveryHours = Math.max(1, Math.min(48, Number(Deno.env.get('RADAR_STRONG_SOURCE_DISCOVERY_HOURS') || 12)))
  // Invalid guarded configuration deliberately uses the legacy enqueue (fail open).
  const enqueueRpc = mode === 'guarded' && guardedConfigValid ? 'enqueue_due_guarded_monitoring_watches' : 'enqueue_due_monitoring_watches'
  const enqueueArgs = enqueueRpc === 'enqueue_due_guarded_monitoring_watches'
    ? { max_count: max, p_allowlisted_owners: allowlistedOwners, p_discovery_hours: discoveryHours } : { max_count: max }
  const { data, error } = await supabase.rpc(enqueueRpc, enqueueArgs)
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })
  // Shadow probes are an independent fail-soft sidecar. Normal enqueueing above
  // always happens first and its behavior is not conditional on probe results.
  let sourceProbes: Record<string, unknown> = { mode: 'off' }
  if (mode === 'shadow' || mode === 'guarded') {
    try {
      const batch = Math.max(1, Math.min(100, Number(Deno.env.get('RADAR_SOURCE_PROBE_BATCH_SIZE') || 20)))
      const { data: sourceCount, error: sourceError } = await supabase.rpc('enqueue_due_monitoring_source_probes', { max_count: batch })
      if (sourceError) throw sourceError
      const workerUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/monitoring-source-worker?limit=${batch}`
      const response = await fetch(workerUrl, { method: 'POST', headers: { 'x-monitoring-secret': Deno.env.get('MONITORING_WORKER_SECRET') || '' } })
      sourceProbes = { mode, enqueued: sourceCount ?? 0, worker_ok: response.ok }
    } catch (error) {
      console.warn('[monitoring-scheduler:source-probes]', { code: 'source_probe_sidecar_failed' })
      sourceProbes = { mode, error: 'source_probe_sidecar_failed' }
    }
  }
  return Response.json({ ok: true, enqueued: data ?? 0, source_probes: sourceProbes })
})
