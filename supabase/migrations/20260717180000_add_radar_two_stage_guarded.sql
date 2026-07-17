-- Radar Phase 2: guarded two-stage monitoring. Configuration remains in Edge secrets,
-- so changing guarded back to shadow restores the legacy enqueue function immediately.
alter table public.monitoring_source_probes drop constraint monitoring_source_probes_outcome_check;
alter table public.monitoring_source_probes add constraint monitoring_source_probes_outcome_check
  check(outcome in ('baseline_created','not_modified','unchanged','changed','unsupported','blocked','error'));

alter table public.monitoring_queue add column if not exists enqueue_reason text not null default 'legacy_adaptive'
  check(enqueue_reason in ('legacy_adaptive','source_change','fallback_discovery','safety_fallback'));
alter table public.monitoring_runs add column if not exists run_reason text not null default 'legacy_adaptive'
  check(run_reason in ('legacy_adaptive','source_triggered_verification','fallback_discovery','safety_fallback'));
alter table public.monitoring_watches add column if not exists last_full_discovery_at timestamptz;

create table public.monitoring_source_change_signals (
 id uuid primary key default gen_random_uuid(), watch_id uuid not null references public.monitoring_watches(id) on delete cascade,
 source_id uuid not null references public.monitoring_watch_sources(id) on delete cascade,
 probe_id uuid not null references public.monitoring_source_probes(id) on delete cascade,
 detected_at timestamptz not null default now(), reason text not null,
 consumed_at timestamptz, monitoring_run_id uuid references public.monitoring_runs(id) on delete set null
);
create unique index monitoring_source_change_one_unconsumed_idx on public.monitoring_source_change_signals(watch_id,source_id) where consumed_at is null;
alter table public.monitoring_source_change_signals enable row level security;
revoke all on public.monitoring_source_change_signals from public,anon,authenticated;

create table public.monitoring_two_stage_audit (
 id bigint generated always as identity primary key, watch_id uuid not null references public.monitoring_watches(id) on delete cascade,
 event_type text not null check(event_type in ('paid_run_avoided','source_triggered_verification','fallback_discovery','safety_fallback')),
 reason text not null, source_id uuid references public.monitoring_watch_sources(id) on delete set null,
 signal_id uuid references public.monitoring_source_change_signals(id) on delete set null, details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index monitoring_two_stage_audit_watch_created_idx on public.monitoring_two_stage_audit(watch_id,created_at desc);
alter table public.monitoring_two_stage_audit enable row level security;
revoke all on public.monitoring_two_stage_audit from public,anon,authenticated;

-- Conservative classification: an HTML page is strong only when its semantic role is
-- product/listing/status/official and it does not look like a one-off news/article URL.
create or replace function public.is_guarded_strong_source(s public.monitoring_watch_sources) returns boolean language sql stable as $$
 select s.is_active and s.probe_eligible and s.disabled_reason is null
 and s.source_role in ('exact_url','feed','status','official','product','listing')
 and (s.source_type in ('rss','atom','json','sitemap') or
      (s.source_type='html' and s.source_role in ('product','listing','status','official','exact_url')
       and s.normalized_url !~* '/(news|blog|articles?)/[^/?]+/?$'))
$$;
revoke execute on function public.is_guarded_strong_source(public.monitoring_watch_sources) from public,anon,authenticated;

-- Fail-open decision used by both scheduler and source worker. can_gate=false means
-- the caller must retain paid monitoring, never silently skip.
create or replace function public.get_guarded_watch_decision(p_watch_id uuid,p_owner_allowlisted boolean,p_discovery_hours integer default 12)
returns table(can_gate boolean,reason text,discovery_due boolean,signal_id uuid) language plpgsql security definer set search_path=public as $$
declare w public.monitoring_watches; e record; active_count int; strong_count int; healthy_count int; sig uuid;
begin
 select * into w from public.monitoring_watches where id=p_watch_id;
 if not found or not p_owner_allowlisted then return query select false,'owner_not_allowlisted',false,null::uuid; return; end if;
 select * into e from public.get_monitoring_watch_schedule_eligibility(p_watch_id);
 if not e.eligible or not e.use_instant_cadence or w.status<>'active' or not w.monitoring_enabled then return query select false,'watch_not_entitled',false,null::uuid; return; end if;
 select count(*),count(*) filter(where public.is_guarded_strong_source(s)),
  count(*) filter(where public.is_guarded_strong_source(s) and s.content_fingerprint is not null and s.last_checked_at>=now()-interval '45 minutes' and s.consecutive_errors=0)
 into active_count,strong_count,healthy_count from public.monitoring_watch_sources s where s.watch_id=p_watch_id and s.is_active;
 select id into sig from public.monitoring_source_change_signals where watch_id=p_watch_id and consumed_at is null order by detected_at limit 1;
 if active_count=0 then return query select false,'missing_sources',false,sig; return; end if;
 if strong_count=0 then return query select false,'not_strong_source_watch',false,sig; return; end if;
 if healthy_count=0 then return query select false,'sources_missing_stale_or_failing',false,sig; return; end if;
 return query select true,'healthy_strong_sources',coalesce(w.last_full_discovery_at,'-infinity'::timestamptz)<now()-make_interval(hours=>greatest(1,least(p_discovery_hours,48))),sig;
exception when others then return query select false,'eligibility_uncertain',false,null::uuid;
end $$;

create or replace function public.enqueue_due_guarded_monitoring_watches(max_count integer,p_allowlisted_owners uuid[],p_discovery_hours integer default 12)
returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin
 with due as (select w.id,w.owner_user_id,d.* from public.monitoring_watches w
  cross join lateral public.get_monitoring_watch_schedule_eligibility(w.id) e
  cross join lateral public.get_guarded_watch_decision(w.id,w.owner_user_id=any(p_allowlisted_owners),p_discovery_hours) d
  where e.eligible and w.next_check_at<=now() order by w.next_check_at limit greatest(1,least(max_count,1000)) for update of w skip locked),
 decisions as (select *,case when not can_gate then 'legacy_adaptive' when signal_id is not null then 'source_change' when discovery_due then 'fallback_discovery' else null end enqueue_reason from due),
 audited as (insert into public.monitoring_two_stage_audit(watch_id,event_type,reason,signal_id)
  select id,'paid_run_avoided','healthy_unchanged_source',signal_id from decisions where can_gate and enqueue_reason is null returning 1),
 ins as (insert into public.monitoring_queue(watch_id,enqueue_reason) select id,enqueue_reason from decisions where enqueue_reason is not null on conflict do nothing returning 1)
 select count(*) into n from ins; return n;
end $$;

create or replace function public.record_guarded_source_change(p_watch_id uuid,p_source_id uuid,p_probe_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare sid uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_watch_id::text||p_source_id::text,2));
 select id into sid from public.monitoring_source_change_signals where watch_id=p_watch_id and source_id=p_source_id and consumed_at is null;
 if sid is null then insert into public.monitoring_source_change_signals(watch_id,source_id,probe_id,reason) values(p_watch_id,p_source_id,p_probe_id,p_reason) returning id into sid; end if;
 insert into public.monitoring_queue(watch_id,enqueue_reason) values(p_watch_id,'source_change') on conflict do nothing;
 return sid;
end $$;

create or replace function public.consume_monitoring_source_signal(p_watch_id uuid,p_run_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare sid uuid; begin select id into sid from public.monitoring_source_change_signals where watch_id=p_watch_id and consumed_at is null order by detected_at limit 1 for update skip locked;
 if sid is not null then update public.monitoring_source_change_signals set consumed_at=now(),monitoring_run_id=p_run_id where id=sid; end if; return sid; end $$;

-- Service-only, idempotent one-time backfill. It reuses the canonical normalizer/registry.
create or replace function public.backfill_monitoring_watch_sources(p_watch_id uuid default null) returns integer language plpgsql security definer set search_path=public as $$
declare w record; u record; r record; discovered jsonb; total int:=0;
begin
 for w in select * from public.monitoring_watches where p_watch_id is null or id=p_watch_id loop
  discovered:='[]'::jsonb;
  for u in select jsonb_array_elements(coalesce(to_jsonb(mu.source_urls),'[]'::jsonb)) item from public.monitoring_updates mu where mu.watch_id=w.id loop discovered:=discovered||jsonb_build_array(case when jsonb_typeof(u.item)='string' then jsonb_build_object('url',u.item#>>'{}') else u.item end); end loop;
  for r in select raw_result from public.monitoring_runs where watch_id=w.id and status in ('no_change','change','uncertain') loop
   discovered:=discovered||coalesce(r.raw_result->'discovered_sources','[]')||coalesce(r.raw_result->'sources','[]')||coalesce(r.raw_result->'grounded_sources','[]');
  end loop;
  total:=total+public.register_monitoring_watch_sources(w.id,discovered,'[]',w.original_request,3);
 end loop; return total;
end $$;

revoke execute on function public.get_guarded_watch_decision(uuid,boolean,integer),public.enqueue_due_guarded_monitoring_watches(integer,uuid[],integer),public.record_guarded_source_change(uuid,uuid,uuid,text),public.consume_monitoring_source_signal(uuid,uuid),public.backfill_monitoring_watch_sources(uuid) from public,anon,authenticated;
grant execute on function public.get_guarded_watch_decision(uuid,boolean,integer),public.enqueue_due_guarded_monitoring_watches(integer,uuid[],integer),public.record_guarded_source_change(uuid,uuid,uuid,text),public.consume_monitoring_source_signal(uuid,uuid),public.backfill_monitoring_watch_sources(uuid) to service_role;
notify pgrst,'reload schema';
