-- Cheap, selective physical-frame invalidation.  This ledger contains no
-- rendered/source payloads, so polling it never invokes an integration.
create table if not exists public.frame_content_revisions (
  device_id text primary key,
  revision bigint not null default 0 check (revision >= 0),
  changed_modules text[] not null default '{}',
  changed_at timestamptz not null default clock_timestamp()
);
alter table public.frame_content_revisions enable row level security;
revoke all on public.frame_content_revisions from public, anon, authenticated;
create table if not exists public.frame_content_revision_changes (
  device_id text not null,
  revision bigint not null,
  changed_modules text[] not null,
  changed_at timestamptz not null default clock_timestamp(),
  primary key(device_id, revision)
);
create index if not exists frame_content_revision_changes_lookup
  on public.frame_content_revision_changes(device_id, revision desc);
alter table public.frame_content_revision_changes enable row level security;
revoke all on public.frame_content_revision_changes from public, anon, authenticated;

create or replace function public.bump_frame_content_revision(p_device_id text, p_modules text[])
returns bigint language plpgsql security definer set search_path = '' as $$
declare result bigint;
begin
  insert into public.frame_content_revisions(device_id, revision, changed_modules)
  values (p_device_id, 1, coalesce(p_modules, array['all']::text[]))
  on conflict (device_id) do update set
    revision = public.frame_content_revisions.revision + 1,
    changed_modules = (select array_agg(distinct key) from unnest(
      public.frame_content_revisions.changed_modules || excluded.changed_modules) key),
    changed_at = clock_timestamp()
  returning revision into result;
  insert into public.frame_content_revision_changes(device_id, revision, changed_modules)
    values (p_device_id, result, coalesce(p_modules, array['all']::text[]));
  delete from public.frame_content_revision_changes
    where device_id = p_device_id and revision < result - 64;
  return result;
end $$;

create or replace function public.bump_user_surf_frame_content() returns trigger
language plpgsql security definer set search_path = '' as $$
declare owner uuid; frame record;
begin
  owner := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  for frame in select distinct dm.device_id from public.device_members dm where dm.user_id = owner
  loop
    perform public.bump_frame_content_revision(frame.device_id, array['surf']);
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create or replace function public.bump_integration_frame_content() returns trigger
language plpgsql security definer set search_path = '' as $$
declare row_data jsonb; owner uuid; scoped_device text; frame record;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  owner := nullif(row_data->>'user_id', '')::uuid;
  scoped_device := nullif(row_data->>'device_id', '');
  for frame in
    select distinct candidate.device_id from (
      select scoped_device as device_id where scoped_device is not null
      union
      select dm.device_id from public.device_members dm where dm.user_id = owner
    ) candidate where candidate.device_id is not null
  loop
    perform public.bump_frame_content_revision(frame.device_id, array['reminders']);
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke execute on function public.bump_frame_content_revision(text, text[]) from public, anon, authenticated;
grant execute on function public.bump_frame_content_revision(text, text[]) to service_role;

create or replace function public.bump_direct_frame_content() returns trigger
language plpgsql security definer set search_path = '' as $$
declare raw_id text; id text; modules text[];
begin
  raw_id := case when tg_op = 'DELETE' then to_jsonb(old)->>'device_id' else to_jsonb(new)->>'device_id' end;
  select d.device_id into id from public.devices d
  where d.device_id = raw_id or d.id::text = raw_id limit 1;
  modules := case tg_table_name
    when 'reminders' then array['reminders']
    when 'reminder_completions' then array['reminders']
    when 'countdown_events' then array['countdown']
    when 'device_settings' then array['all']
    when 'integration_items' then array['reminders']
    when 'local_event_frame_skips' then array['reminders']
    else array['all'] end;
  if id is not null then perform public.bump_frame_content_revision(id, modules); end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

do $$ begin
  if to_regclass('public.user_surf_experiences') is not null then
    drop trigger if exists frame_content_revision on public.user_surf_experiences;
    create trigger frame_content_revision after insert or update or delete on public.user_surf_experiences
      for each row execute function public.bump_user_surf_frame_content();
  end if;
end $$;

do $$ declare table_name text;
begin
  foreach table_name in array array['reminders','reminder_completions','countdown_events','device_settings','local_event_frame_skips'] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop trigger if exists frame_content_revision on public.%I', table_name);
      execute format('create trigger frame_content_revision after insert or update or delete on public.%I for each row execute function public.bump_direct_frame_content()', table_name);
    end if;
  end loop;
end $$;

do $$ declare table_name text;
begin
  foreach table_name in array array['integration_items','user_integrations'] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop trigger if exists frame_content_revision on public.%I', table_name);
      execute format('create trigger frame_content_revision after insert or update or delete on public.%I for each row execute function public.bump_integration_frame_content()', table_name);
    end if;
  end loop;
end $$;

-- Keep the existing durable/idempotent manual-request contract, while making
-- a newly accepted request a screen-wide freshness invalidation. Replays return
-- before bumping either revision.
create or replace function public.request_device_display_revision(p_device_id text, p_request_id text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare result bigint;
begin
  if p_request_id is null or length(p_request_id) < 8 or length(p_request_id) > 128 then
    raise exception 'invalid_request_id' using errcode = '22023';
  end if;
  insert into public.device_update_state(device_id) values (p_device_id) on conflict (device_id) do nothing;
  perform 1 from public.device_update_state where device_id = p_device_id for update;
  select requested_revision into result from public.device_update_requests
    where device_id = p_device_id and request_id = p_request_id;
  if result is not null then return result; end if;
  update public.device_update_state set requested_revision = requested_revision + 1,
    requested_at = clock_timestamp(), request_id = p_request_id,
    app_active_until = clock_timestamp() + interval '2 minutes'
    where device_id = p_device_id returning requested_revision into result;
  insert into public.device_update_requests(device_id, request_id, requested_revision, requested_at)
    values (p_device_id, p_request_id, result, clock_timestamp());
  perform public.bump_frame_content_revision(p_device_id, array['all']);
  return result;
end $$;
revoke execute on function public.request_device_display_revision(text, text) from public, anon, authenticated;
grant execute on function public.request_device_display_revision(text, text) to service_role;
