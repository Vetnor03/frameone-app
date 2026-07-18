-- Keep the user-facing Watch last_checked_at monotonic across concurrent source probes.
create or replace function public.touch_monitoring_watch_checked_at(p_watch_id uuid,p_checked_at timestamptz)
returns void language sql security definer set search_path=public as $$
 update public.monitoring_watches
 set last_checked_at=greatest(coalesce(last_checked_at,'-infinity'::timestamptz),p_checked_at)
 where id=p_watch_id;
$$;

revoke execute on function public.touch_monitoring_watch_checked_at(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.touch_monitoring_watch_checked_at(uuid,timestamptz) to service_role;
notify pgrst,'reload schema';
