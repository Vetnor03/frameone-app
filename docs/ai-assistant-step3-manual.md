# RE:MIND AI Assistant step 3 manual operations

## Required Supabase secrets

```bash
supabase secrets set OPENAI_API_KEY="sk-..."
supabase secrets set OPENAI_MONITORING_MODEL="gpt-4.1-mini"
supabase secrets set MONITORING_PROVIDER="openai"
supabase secrets set MONITORING_CRON_SECRET="replace-with-random-scheduler-secret"
supabase secrets set MONITORING_WORKER_SECRET="replace-with-random-worker-secret"
```

`OPENAI_MONITORING_MODEL` defaults to `gpt-4.1-mini` in one shared constant when unset because it is a cost-conscious Responses API model suitable for structured monitoring tasks. The mock provider remains available with `MONITORING_PROVIDER=mock`.

## Deploy

```bash
supabase db push
supabase functions deploy interpret-ai-assistant monitoring-scheduler monitoring-worker
```

No recurring cron is configured in this step. The interpretation queue is durable in Postgres (`ai_assistant_interpretation_queue`), but processing is manually invoked until cron is intentionally added.

## Manual end-to-end smoke test

Set placeholders only; do not print real secrets:

```bash
export SUPABASE_URL="https://PROJECT_REF.supabase.co"
export USER_JWT="authenticated-user-jwt"
export SUPABASE_DB_URL="postgresql://postgres:REDACTED@db.PROJECT_REF.supabase.co:5432/postgres"
export MONITORING_CRON_SECRET="replace-with-random-scheduler-secret"
export MONITORING_WORKER_SECRET="replace-with-random-worker-secret"
```

Create a task through the normal authenticated RPC. This returns immediately and durably enqueues interpretation server-side:

```bash
curl -s "$SUPABASE_URL/rest/v1/rpc/create_ai_assistant_watch" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "apikey: SUPABASE_ANON_KEY_PLACEHOLDER" \
  -H "Content-Type: application/json" \
  --data '{"p_original_request":"Tell me if OpenAI announces a new Responses API web search feature.","p_frame_id":null}'
```

Set the returned watch id:

```bash
export WATCH_ID="existing-watch-uuid"
```

Inspect durable interpretation scheduling:

```bash
psql "$SUPABASE_DB_URL" -c "select w.id,w.interpretation_status,w.title,w.trigger_description,q.id as interpretation_job,q.attempts,q.run_after,q.claimed_at,q.completed_at,q.last_error from public.monitoring_watches w left join public.ai_assistant_interpretation_queue q on q.watch_id=w.id and q.completed_at is null where w.id = '$WATCH_ID';"
```

Process interpretation manually (worker-secret protected, safe to retry):

```bash
curl -i "$SUPABASE_URL/functions/v1/interpret-ai-assistant?limit=1" \
  -H "x-monitoring-secret: $MONITORING_WORKER_SECRET"
```

Authenticated manual retry remains available if needed; it only re-enqueues the owned task and cannot process another user’s watch:

```bash
curl -i "$SUPABASE_URL/functions/v1/interpret-ai-assistant" \
  -H "Authorization: Bearer $USER_JWT" \
  -H "Content-Type: application/json" \
  --data "{\"watch_id\":\"$WATCH_ID\"}"
```

Inspect successful interpretation:

```bash
psql "$SUPABASE_DB_URL" -c "select id,interpretation_status,interpreted_at,preferred_language,completion_condition,frequency_minutes,title,trigger_description,search_guidance from public.monitoring_watches where id = '$WATCH_ID';"
```

Enqueue due monitoring tasks manually:

```bash
curl -i "$SUPABASE_URL/functions/v1/monitoring-scheduler?max=10" \
  -H "x-monitoring-secret: $MONITORING_CRON_SECRET"
```

Inspect monitoring queue status:

```bash
psql "$SUPABASE_DB_URL" -c "select id,watch_id,attempts,run_after,claimed_at,completed_at,last_error from public.monitoring_queue where watch_id = '$WATCH_ID' order by created_at desc limit 5;"
```

Invoke the worker once for one real OpenAI web search when `MONITORING_PROVIDER=openai`:

```bash
curl -i "$SUPABASE_URL/functions/v1/monitoring-worker?limit=1" \
  -H "x-monitoring-secret: $MONITORING_WORKER_SECRET"
```

Verify completed `web_search_call`, response id, usage, and run status:

```bash
psql "$SUPABASE_DB_URL" -c "select id,status,response_id,usage,raw_result->>'returned_source_count' as returned_source_count,error_message,completed_at from public.monitoring_runs where watch_id = '$WATCH_ID' order by started_at desc limit 5;"
psql "$SUPABASE_DB_URL" -c "select jsonb_path_exists(raw_result, '$.output[*] ? (@.type == \"web_search_call\" && (!exists(@.status) || @.status == \"completed\"))') as completed_web_search_call from public.monitoring_runs where watch_id = '$WATCH_ID' order by started_at desc limit 1;"
```

Inspect source-grounded update metadata and duplicate fingerprint behavior:

```bash
psql "$SUPABASE_DB_URL" -c "select headline,fingerprint,source_urls,created_at from public.monitoring_updates where watch_id = '$WATCH_ID' order by created_at desc limit 10;"
psql "$SUPABASE_DB_URL" -c "select fingerprint,count(*) from public.monitoring_updates where watch_id = '$WATCH_ID' group by fingerprint having count(*) > 1;"
```

Run the scheduler and worker a second time to confirm the same semantic development does not create a duplicate update:

```bash
curl -i "$SUPABASE_URL/functions/v1/monitoring-scheduler?max=10" -H "x-monitoring-secret: $MONITORING_CRON_SECRET"
curl -i "$SUPABASE_URL/functions/v1/monitoring-worker?limit=1" -H "x-monitoring-secret: $MONITORING_WORKER_SECRET"
```

For no-change/error retry smoke testing, temporarily use the mock provider in a non-production project:

```bash
supabase secrets set MONITORING_PROVIDER="mock" MONITORING_MOCK_MODE="no_change"
curl -i "$SUPABASE_URL/functions/v1/monitoring-worker?limit=1" -H "x-monitoring-secret: $MONITORING_WORKER_SECRET"

supabase secrets set MONITORING_MOCK_MODE="error"
curl -i "$SUPABASE_URL/functions/v1/monitoring-worker?limit=1" -H "x-monitoring-secret: $MONITORING_WORKER_SECRET"
psql "$SUPABASE_DB_URL" -c "select status,next_check_at from public.monitoring_watches where id = '$WATCH_ID';"
```
