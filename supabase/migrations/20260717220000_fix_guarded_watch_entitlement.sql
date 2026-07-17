-- Forward-only production repair: schedule eligibility already folds together the
-- Watch's active status and its subscription entitlement. Keep that RPC as the
-- authoritative gate; monitoring_enabled is not a monitoring_watches column.
create or replace function public.get_guarded_watch_decision(p_watch_id uuid,p_owner_allowlisted boolean,p_discovery_hours integer default 12)
returns table(can_gate boolean,reason text,discovery_due boolean,signal_id uuid) language plpgsql security definer set search_path=public as $$
declare w public.monitoring_watches; e record; active_count int; strong_count int; healthy_count int; relevant_healthy int; sig uuid; intent record;
begin
 select * into w from public.monitoring_watches where id=p_watch_id;
 if not found or not p_owner_allowlisted then return query select false,'owner_not_allowlisted',false,null::uuid; return; end if;
 select * into e from public.get_monitoring_watch_schedule_eligibility(p_watch_id);
 if not e.eligible or not e.use_instant_cadence then return query select false,'watch_not_entitled',false,null::uuid; return; end if;
 select * into intent from public.monitoring_country_intent(w.original_request,w.search_guidance);
 select count(*),count(*) filter(where public.is_guarded_strong_source(s)),
  count(*) filter(where public.is_guarded_strong_source(s) and s.content_fingerprint is not null and s.last_checked_at>=now()-interval '45 minutes' and s.consecutive_errors=0),
  count(*) filter(where public.is_guarded_strong_source(s) and s.content_fingerprint is not null and s.last_checked_at>=now()-interval '45 minutes' and s.consecutive_errors=0 and s.geography_relevant is true)
 into active_count,strong_count,healthy_count,relevant_healthy from public.monitoring_watch_sources s where s.watch_id=p_watch_id and s.is_active;
 select id into sig from public.monitoring_source_change_signals where watch_id=p_watch_id and consumed_at is null order by detected_at limit 1;
 if active_count=0 then return query select false,'missing_sources',false,sig; return; end if;
 if strong_count=0 then return query select false,'not_strong_source_watch',false,sig; return; end if;
 if healthy_count=0 then return query select false,'sources_missing_stale_or_failing',false,sig; return; end if;
 if intent.intent_state='ambiguous' or (intent.intent_state='resolved' and relevant_healthy=0) then return query select false,'eligibility_uncertain',false,sig; return; end if;
 return query select true,'healthy_strong_sources',coalesce(w.last_full_discovery_at,'-infinity'::timestamptz)<now()-make_interval(hours=>greatest(1,least(p_discovery_hours,48))),sig;
exception when others then return query select false,'eligibility_uncertain',false,null::uuid;
end $$;

revoke execute on function public.get_guarded_watch_decision(uuid,boolean,integer) from public,anon,authenticated;
grant execute on function public.get_guarded_watch_decision(uuid,boolean,integer) to service_role;

notify pgrst,'reload schema';
