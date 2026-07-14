-- Reactivate errored AI Assistant watches after a successful authenticated interpretation retry.
-- Forward-only replacement for public.apply_ai_assistant_interpretation because
-- 20260713183000_add_durable_ai_interpretation_queue.sql has already been applied in production.

create or replace function public.apply_ai_assistant_interpretation(
  p_watch_id uuid,
  p_owner_user_id uuid,
  p_request_snapshot text,
  p_title text,
  p_normalized_goal text,
  p_trigger_description text,
  p_search_guidance jsonb,
  p_frequency_minutes integer,
  p_completion_condition text,
  p_preferred_language text
)
returns public.monitoring_watches language plpgsql security definer set search_path = public as $$
declare updated_watch public.monitoring_watches;
begin
  update public.monitoring_watches
  set title = left(btrim(p_title), 90),
      normalized_goal = left(btrim(p_normalized_goal), 600),
      trigger_description = left(btrim(p_trigger_description), 500),
      search_guidance = coalesce(p_search_guidance, '{}'::jsonb),
      frequency_minutes = greatest(5, least(coalesce(p_frequency_minutes, frequency_minutes), 10080)),
      next_check_at = least(next_check_at, now()),
      completion_condition = nullif(left(btrim(coalesce(p_completion_condition, '')), 500), ''),
      preferred_language = case when p_preferred_language in ('en','no') then p_preferred_language else preferred_language end,
      interpreted_at = now(),
      interpretation_status = 'complete',
      interpretation_error = null,
      status = case when status = 'error' then 'active' else status end
  where id = p_watch_id and owner_user_id = p_owner_user_id and original_request = p_request_snapshot and status <> 'completed'
  returning * into updated_watch;
  if updated_watch.id is null then raise exception 'watch_not_found_forbidden_or_stale'; end if;
  return updated_watch;
end; $$;

revoke execute on function public.apply_ai_assistant_interpretation(uuid,uuid,text,text,text,text,jsonb,integer,text,text) from public, anon, authenticated;
grant execute on function public.apply_ai_assistant_interpretation(uuid,uuid,text,text,text,text,jsonb,integer,text,text) to service_role;
