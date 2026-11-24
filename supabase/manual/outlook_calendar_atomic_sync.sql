-- Deployment prerequisite for Outlook Calendar multi-selection.
-- Apply as a tracked migration only after staging validation.
-- No table schema changes. The caller is the server service role only.
begin;

create or replace function public.commit_outlook_calendar_sync(
  p_user_id uuid, p_expected_revision timestamptz, p_credentials jsonb,
  p_account_id text, p_account_label text, p_changed jsonb, p_obsolete_ids text[]
) returns boolean
language plpgsql security invoker set search_path = ''
as $$
declare v_revision timestamptz;
begin
  -- The advisory lock also protects the first connection (no row exists yet).
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('outlook-calendar:' || p_user_id::text, 0));
  select updated_at into v_revision from public.user_integrations
    where user_id = p_user_id and provider = 'teams' for update;
  if v_revision is distinct from p_expected_revision then
    return false;
  end if;

  insert into public.user_integrations
    (user_id, provider, status, encrypted_credentials, external_account_id, external_account_label, last_sync_at, last_error, updated_at)
    values (p_user_id, 'teams', 'connected', p_credentials, p_account_id, p_account_label, pg_catalog.now(), null, pg_catalog.now())
    on conflict (user_id, provider) do update set
      status = excluded.status, encrypted_credentials = excluded.encrypted_credentials,
      external_account_id = excluded.external_account_id, external_account_label = excluded.external_account_label,
      last_sync_at = excluded.last_sync_at, last_error = null, updated_at = excluded.updated_at;

  delete from public.integration_items
    where user_id = p_user_id and provider = 'teams' and external_id = any(p_obsolete_ids);
  insert into public.integration_items
    (user_id, provider, external_id, title, body, starts_at, due_at, priority, raw, updated_at)
    select p_user_id, 'teams', item.external_id, item.title, item.body, item.starts_at,
      item.due_at, item.priority, item.raw, pg_catalog.now()
    from pg_catalog.jsonb_to_recordset(p_changed) as item(
      external_id text, title text, body text, starts_at timestamptz, due_at timestamptz, priority integer, raw jsonb
    )
    on conflict (user_id, provider, external_id) do update set
      title = excluded.title, body = excluded.body, starts_at = excluded.starts_at, due_at = excluded.due_at,
      priority = excluded.priority, raw = excluded.raw, updated_at = excluded.updated_at;
  return true;
end;
$$;

create or replace function public.disconnect_outlook_calendar(p_user_id uuid)
returns boolean
language plpgsql security invoker set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('outlook-calendar:' || p_user_id::text, 0));
  insert into public.user_integrations
    (user_id, provider, status, encrypted_credentials, external_account_id, external_account_label, last_sync_at, last_error, updated_at)
    values (p_user_id, 'teams', 'disconnected', null, null, null, null, null, pg_catalog.now())
    on conflict (user_id, provider) do update set
      status = 'disconnected', encrypted_credentials = null, external_account_id = null, external_account_label = null,
      last_sync_at = null, last_error = null, updated_at = excluded.updated_at;
  delete from public.integration_items where user_id = p_user_id and provider = 'teams';
  return true;
end;
$$;

revoke all on function public.commit_outlook_calendar_sync(uuid,timestamptz,jsonb,text,text,jsonb,text[]) from public, anon, authenticated;
grant execute on function public.commit_outlook_calendar_sync(uuid,timestamptz,jsonb,text,text,jsonb,text[]) to service_role;
revoke all on function public.disconnect_outlook_calendar(uuid) from public, anon, authenticated;
grant execute on function public.disconnect_outlook_calendar(uuid) to service_role;
commit;
