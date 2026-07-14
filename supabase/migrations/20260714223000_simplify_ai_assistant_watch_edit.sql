-- Simplify Watch editing so only the user's original natural-language request changes.

create or replace function public.update_ai_assistant_watch_request(
  p_watch_id uuid,
  p_original_request text,
  p_title text default null,
  p_frequency_minutes integer default null,
  p_completion_condition text default null,
  p_preferred_language text default 'en',
  p_frame_id text default null,
  p_show_on_frame boolean default false
)
returns public.monitoring_watches language plpgsql security definer set search_path = public as $$
declare
  cleaned_request text := public.ai_assistant_clean_request(p_original_request);
  updated_watch public.monitoring_watches;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if char_length(cleaned_request) < 8 or cleaned_request !~ '[[:alnum:]]' then raise exception 'request_too_short'; end if;
  if char_length(cleaned_request) > 1000 then raise exception 'request_too_long'; end if;

  update public.monitoring_watches
  set original_request = cleaned_request
  where id = p_watch_id and owner_user_id = auth.uid()
  returning * into updated_watch;

  if updated_watch.id is null then raise exception 'watch_not_found'; end if;
  return updated_watch;
end; $$;

revoke execute on function public.update_ai_assistant_watch_request(uuid,text,text,integer,text,text,text,boolean) from public, anon;
grant execute on function public.update_ai_assistant_watch_request(uuid,text,text,integer,text,text,text,boolean) to authenticated;
