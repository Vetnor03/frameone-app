-- Repair AI Assistant Watch editing RPC to a single owner-only text edit path.

-- Keep this inspection query in the migration for operators reviewing drift before drops.
do $$
declare
  existing_signature text;
begin
  for existing_signature in
    select pg_get_function_identity_arguments(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'update_ai_assistant_watch_request'
  loop
    raise notice 'existing update_ai_assistant_watch_request(%)', existing_signature;
  end loop;
end $$;

-- Remove legacy/defaulted overloads that make PostgREST function resolution ambiguous.
drop function if exists public.update_ai_assistant_watch_request(uuid, text, text, integer, text, text, text, boolean);
drop function if exists public.update_ai_assistant_watch_request(uuid, text, text, boolean);

create or replace function public.update_ai_assistant_watch_request(
  p_watch_id uuid,
  p_original_request text
)
returns public.monitoring_watches
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned_request text := public.ai_assistant_clean_request(p_original_request);
  updated_watch public.monitoring_watches;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if char_length(cleaned_request) < 8 or cleaned_request !~ '[[:alnum:]]' then
    raise exception 'request_too_short';
  end if;

  if char_length(cleaned_request) > 1000 then
    raise exception 'request_too_long';
  end if;

  update public.monitoring_watches
  set original_request = cleaned_request
  where id = p_watch_id and owner_user_id = auth.uid()
  returning * into updated_watch;

  if updated_watch.id is null then
    raise exception 'watch_not_found_or_not_owned';
  end if;

  return updated_watch;
end;
$$;

revoke execute on function public.update_ai_assistant_watch_request(uuid, text) from public, anon;
grant execute on function public.update_ai_assistant_watch_request(uuid, text) to authenticated;

notify pgrst, 'reload schema';
