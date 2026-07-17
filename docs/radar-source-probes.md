# Radar source probes — Phase 1 operations

Phase 1 is an **observation-only sidecar**. It never calls OpenAI and probe outcomes never enqueue, skip, accelerate, delay, or suppress `monitoring_queue`. The scheduler always runs the existing paid-monitor enqueue first. `off` is the default.

## Eligibility and cadence

Registry candidates qualify when they are an exact URL from the request; detected RSS, Atom, JSON, or sitemap; seen in at least two successful AI runs; selected in at least two runs; or conservatively classified as a feed, status, official, product, or listing page. A once-seen article remains inactive. At most three are activated, deterministically ordered by priority, role, normalized URL, and UUID: exact URL; feed/status; official/repeated stable; product/listing; article. Queue SQL additionally requires an active Watch, internal Radar (`is_instant`), current subscription entitlement, active/eligible source, no disable reason, due time, and no unfinished job.

Successful probes recur after 15 minutes. Consecutive failures back off 15m, 30m, 1h, 3h, then 6h. Three permanent 404/410, unsupported-type, or unsafe-destination failures disable only that source.

## Security boundary

Only HTTP(S), ports 80/443, public DNS answers, and supported textual MIME types are accepted. Credentials, localhost/local names, metadata hosts, IPv4 loopback/private/link-local/carrier-grade NAT/benchmark/multicast, and IPv6 loopback/ULA/link-local/multicast are rejected. Every redirect (maximum three) is URL- and DNS-validated. Requests contain no cookie or authorization, execute no JavaScript, do not crawl links, time out by 8 seconds, and read at most 512 KiB. Bodies and DNS diagnostics are never stored.

## Enable shadow mode

1. Apply `20260717120000_add_radar_source_probe_shadow.sql` with `supabase db push`.
2. Set Edge secrets: `RADAR_SOURCE_PROBE_MODE=shadow`, `MONITORING_WORKER_SECRET` (the existing shared secret), and optionally the four bounded tuning variables documented in `.env.example`.
3. Deploy `monitoring-source-worker`, `monitoring-scheduler`, and `monitoring-worker`.
4. Keep the existing scheduler invocation unchanged. On each invocation it now invokes the probe worker only in shadow mode.
5. To turn observations off immediately, set `RADAR_SOURCE_PROBE_MODE=off` on both scheduler and source worker. Paid monitoring is unaffected either way.

## Observation queries

The comparison window below associates an AI run with source changes in the preceding six hours. This is an observational heuristic, not a savings claim. Continue reading OpenAI token/cost information from `monitoring_runs.usage`.

Set any combination of `:watch_id` and `:owner_user_id` to NULL for all entitled Radar Watches.

```sql
-- Summary for an arbitrary interval (:since), one Watch/user/all Radar Watches.
select count(*) total_source_probes,
 count(*) filter(where p.outcome in ('not_modified','unchanged')) unchanged_probes,
 count(*) filter(where p.outcome='changed') changed_probes,
 count(*) filter(where p.outcome in ('error','blocked','unsupported')) probe_errors,
 round(avg(p.duration_ms)) average_duration_ms, coalesce(sum(p.bytes_read),0) bytes_downloaded
from public.monitoring_source_probes p join public.monitoring_watches w on w.id=p.watch_id
where p.checked_at >= :since and w.is_instant
 and (:watch_id::uuid is null or w.id=:watch_id)
 and (:owner_user_id::uuid is null or w.owner_user_id=:owner_user_id);
```

Exact last-24-hours query:

```sql
select outcome,count(*) probes,round(avg(duration_ms)) average_duration_ms,coalesce(sum(bytes_read),0) bytes_downloaded
from public.monitoring_source_probes where checked_at>=now()-interval '24 hours'
group by outcome order by outcome;
```

Exact last-7-days query:

```sql
select date_trunc('day',checked_at) day,outcome,count(*) probes,round(avg(duration_ms)) average_duration_ms,coalesce(sum(bytes_read),0) bytes_downloaded
from public.monitoring_source_probes where checked_at>=now()-interval '7 days'
group by 1,2 order by 1 desc,2;
```

```sql
-- Probe/AI agreement and potential no-change candidates (six-hour lookback).
with paired as (
 select r.id,r.watch_id,r.status,r.started_at,r.usage,
  exists(select 1 from public.monitoring_source_probes p where p.watch_id=r.watch_id and p.outcome='changed' and p.checked_at between r.started_at-interval '6 hours' and r.started_at) source_changed
 from public.monitoring_runs r join public.monitoring_watches w on w.id=r.watch_id
 where r.provider='openai' and r.started_at>=:since and w.is_instant
)
select count(*) filter(where source_changed and status='no_change') changed_then_ai_no_change,
 count(*) filter(where source_changed and status='change') changed_then_ai_change,
 count(*) filter(where not source_changed and status='change') ai_changes_without_preceding_source_change,
 count(*) filter(where not source_changed and status='no_change') estimated_runs_potentially_avoidable
from paired;

-- Sources that have not yet produced a useful signal.
select s.watch_id,s.id,s.normalized_url,count(p.id) probes,max(p.checked_at) last_probe
from public.monitoring_watch_sources s left join public.monitoring_source_probes p on p.source_id=s.id
group by s.watch_id,s.id,s.normalized_url
having count(p.id)>0 and count(p.id) filter(where p.outcome='changed')=0
order by probes desc;
```

Individual probe rows should be pruned with service-role scheduling of `prune_monitoring_source_probes(14)`. This does not delete Watch history, monitoring runs, or updates.

## Phase 2 contract (not active)

Strong sources (exact product URL, status/official event page, RSS/API) may eventually trigger AI verification on change, with full discovery every roughly 12–24 hours. Broad topics still require discovery roughly every 4–6 hours (temporarily faster for active situations), while cheap probes watch known sources. **A periodic discovery search remains mandatory even when no known source changes**, because a development can appear at a new source. No such gating or triggering exists in Phase 1.
