-- Secure server-side AI Assistant interpretation fields and narrow service-role update RPC.
-- This RPC never updates owner_user_id, frame_id, or show_on_frame.
alter table public.monitoring_watches add column if not exists preferred_language text not null default 'en';
alter table public.monitoring_watches add column if not exists completion_condition text;
alter table public.monitoring_watches add column if not exists interpreted_at timestamptz;
alter table public.monitoring_watches add column if not exists interpretation_status text not null default 'pending';
alter table public.monitoring_watches add column if not exists interpretation_error text;
alter table public.monitoring_watches add constraint monitoring_watches_preferred_language_check check (preferred_language in ('en','no'));
alter table public.monitoring_watches add constraint monitoring_watches_interpretation_status_check check (interpretation_status in ('pending','complete','failed'));

create or replace function public.apply_ai_assistant_interpretation(
  p_watch_id uuid,
  p_owner_user_id uuid,
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
      interpretation_error = null
  where id = p_watch_id and owner_user_id = p_owner_user_id
  returning * into updated_watch;
  if updated_watch.id is null then raise exception 'watch_not_found_or_forbidden'; end if;
  return updated_watch;
end; $$;

revoke execute on function public.apply_ai_assistant_interpretation(uuid,uuid,text,text,text,jsonb,integer,text,text) from public, anon, authenticated;
grant execute on function public.apply_ai_assistant_interpretation(uuid,uuid,text,text,text,jsonb,integer,text,text) to service_role;
