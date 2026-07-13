import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  if (req.headers.get('x-monitoring-secret') !== Deno.env.get('MONITORING_CRON_SECRET')) return new Response('Unauthorized', { status: 401 })
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const max = Number(new URL(req.url).searchParams.get('max') || Deno.env.get('MONITORING_SCHEDULER_BATCH_SIZE') || 100)
  const { data, error } = await supabase.rpc('enqueue_due_monitoring_watches', { max_count: max })
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 })
  return Response.json({ ok: true, enqueued: data ?? 0 })
})
