# Radar Phase 2 deployment

Apply `20260717180000_add_radar_two_stage_guarded.sql`, then deploy
`monitoring-scheduler`, `monitoring-source-worker`, and `monitoring-worker`.

Keep `RADAR_SOURCE_PROBE_MODE=shadow` during deployment. Backfill historical sources
with the service-role-only RPC:

```sql
select public.backfill_monitoring_watch_sources(); -- all Watches
-- or: select public.backfill_monitoring_watch_sources('<watch-id>'::uuid);
```

Set `RADAR_TWO_STAGE_OWNER_ALLOWLIST` to comma-separated owner UUIDs and
`RADAR_STRONG_SOURCE_DISCOVERY_HOURS=12`, then enable with exactly
`RADAR_SOURCE_PROBE_MODE=guarded`. Find the owner safely in the dashboard's
Authentication > Users page, or as a service-role administrator:

```sql
select id, email from auth.users where email = '<your exact email>';
```

The existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`MONITORING_CRON_SECRET`, and `MONITORING_WORKER_SECRET` remain required. Invalid
or absent allowlist configuration fails open to legacy paid scheduling. Switching
mode to `shadow` is the immediate kill switch and needs no data rollback.

Operational audit queries:

```sql
-- Paid runs avoided only after a healthy, unchanged-source gating decision.
select watch_id, count(*) avoided from monitoring_two_stage_audit
where event_type='paid_run_avoided' group by watch_id;
-- Completed source-triggered paid verification runs.
select watch_id, count(*) verifications from monitoring_runs
where run_reason='source_triggered_verification' and completed_at is not null group by watch_id;
-- Completed mandatory fallback discovery runs.
select watch_id, count(*) discoveries from monitoring_runs
where run_reason='fallback_discovery' and completed_at is not null group by watch_id;
```

Broad/news Watches and owners outside the allowlist retain legacy scheduling.
Source probes never call the paid provider or reserve quota; all paid work still
passes through `reserve_paid_monitoring_run`, preserving every existing cap.
