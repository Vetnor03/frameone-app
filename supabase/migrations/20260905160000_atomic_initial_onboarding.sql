-- A one-row lifecycle marker makes initial starter seeding retry-safe and ensures
-- deleted starter content is never inferred from an empty table and recreated.
create table if not exists public.device_onboarding_state (
  device_id text primary key references public.devices(device_id) on delete cascade,
  completed_at timestamptz not null default now(),
  starter_content_seed_version integer not null default 1,
  completed_by_user_id uuid not null references auth.users(id)
);

alter table public.reminders add column if not exists starter_key text;
alter table public.countdown_events add column if not exists starter_key text;
create unique index if not exists reminders_device_starter_key_uidx on public.reminders(device_id, starter_key) where starter_key is not null;
create unique index if not exists countdown_device_starter_key_uidx on public.countdown_events(device_id, starter_key) where starter_key is not null;

alter table public.device_onboarding_state enable row level security;

create or replace function public.complete_initial_device_onboarding(
  p_device_id text,
  p_settings jsonb,
  p_starter_reminders jsonb default '[]'::jsonb,
  p_starter_countdowns jsonb default '[]'::jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_claimed integer;
begin
  if v_user_id is null or not exists (
    select 1 from public.device_members
    where device_id = p_device_id and user_id = v_user_id
  ) then
    return false;
  end if;

  -- Only the transaction which creates the lifecycle row may seed. A retry,
  -- including one after the user deletes every seed, only re-applies settings.
  insert into public.device_onboarding_state(device_id, completed_by_user_id)
  values (p_device_id, v_user_id)
  on conflict (device_id) do nothing;
  get diagnostics v_claimed = row_count;

  if v_claimed = 1 and not exists (select 1 from public.reminders where device_id = p_device_id) then
    insert into public.reminders(device_id, created_by_user_id, updated_by_user_id, starter_key, title, due_date, repeat_type, is_done)
    select p_device_id, v_user_id, v_user_id,
      value->>'key', left(value->>'title', 120), (value->>'due_date')::date,
      coalesce(nullif(value->>'repeat_type', ''), 'none'), false
    from jsonb_array_elements(p_starter_reminders)
    where value ? 'key' and value ? 'title' and value ? 'due_date';
  end if;

  if v_claimed = 1 and not exists (select 1 from public.countdown_events where device_id = p_device_id) then
    insert into public.countdown_events(device_id, created_by_user_id, updated_by_user_id, starter_key, title, target_date, pinned)
    select p_device_id, v_user_id, v_user_id,
      value->>'key', left(value->>'title', 120), (value->>'target_date')::date, false
    from jsonb_array_elements(p_starter_countdowns)
    where value ? 'key' and value ? 'title' and value ? 'target_date';
  end if;

  insert into public.device_settings(device_id, settings_json, updated_at)
  values (p_device_id, p_settings, now())
  on conflict (device_id) do update
    set settings_json = excluded.settings_json, updated_at = excluded.updated_at;

  return true;
end;
$$;

revoke all on function public.complete_initial_device_onboarding(text, jsonb, jsonb, jsonb) from public;
grant execute on function public.complete_initial_device_onboarding(text, jsonb, jsonb, jsonb) to authenticated;
