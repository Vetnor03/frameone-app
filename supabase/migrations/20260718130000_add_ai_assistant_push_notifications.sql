create table if not exists public.user_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_enabled boolean not null default false,
  permission_state text not null default 'default',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_notification_preferences_permission_check check (permission_state in ('default','granted','denied','unsupported'))
);

create table if not exists public.user_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  enabled boolean not null default true,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_push_subscriptions_endpoint_not_empty check (char_length(btrim(endpoint)) > 0),
  constraint user_push_subscriptions_p256dh_not_empty check (char_length(btrim(p256dh)) > 0),
  constraint user_push_subscriptions_auth_not_empty check (char_length(btrim(auth)) > 0),
  constraint user_push_subscriptions_user_endpoint_unique unique (user_id, endpoint)
);

create table if not exists public.monitoring_update_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  monitoring_update_id uuid not null references public.monitoring_updates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint monitoring_update_push_deliveries_status_check check (status in ('pending','sending','sent','suppressed','failed')),
  constraint monitoring_update_push_deliveries_unique unique (monitoring_update_id, user_id)
);

create index if not exists user_push_subscriptions_user_enabled_idx on public.user_push_subscriptions (user_id) where enabled = true;
create index if not exists monitoring_update_push_deliveries_pending_idx on public.monitoring_update_push_deliveries (created_at) where status = 'pending';

drop trigger if exists trg_user_notification_preferences_updated_at on public.user_notification_preferences;
create trigger trg_user_notification_preferences_updated_at before update on public.user_notification_preferences for each row execute function public.set_timestamp_updated_at();
drop trigger if exists trg_user_push_subscriptions_updated_at on public.user_push_subscriptions;
create trigger trg_user_push_subscriptions_updated_at before update on public.user_push_subscriptions for each row execute function public.set_timestamp_updated_at();
drop trigger if exists trg_monitoring_update_push_deliveries_updated_at on public.monitoring_update_push_deliveries;
create trigger trg_monitoring_update_push_deliveries_updated_at before update on public.monitoring_update_push_deliveries for each row execute function public.set_timestamp_updated_at();

alter table public.user_notification_preferences enable row level security;
alter table public.user_push_subscriptions enable row level security;
alter table public.monitoring_update_push_deliveries enable row level security;

drop policy if exists "Users can manage own notification preference" on public.user_notification_preferences;
create policy "Users can manage own notification preference" on public.user_notification_preferences for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Users can manage own push subscriptions" on public.user_push_subscriptions;
create policy "Users can manage own push subscriptions" on public.user_push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Users can read own push deliveries" on public.monitoring_update_push_deliveries;
create policy "Users can read own push deliveries" on public.monitoring_update_push_deliveries for select using (user_id = auth.uid());

grant select, insert, update, delete on public.user_notification_preferences to authenticated;
grant select, insert, update, delete on public.user_push_subscriptions to authenticated;
grant select on public.monitoring_update_push_deliveries to authenticated;

create or replace function public.queue_monitoring_update_push(p_monitoring_update_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare target_user_id uuid;
begin
  select w.owner_user_id into target_user_id
  from public.monitoring_updates u
  join public.monitoring_watches w on w.id = u.watch_id
  where u.id = p_monitoring_update_id;

  if target_user_id is null then return false; end if;

  insert into public.monitoring_update_push_deliveries (monitoring_update_id, user_id, status)
  values (p_monitoring_update_id, target_user_id, 'pending')
  on conflict (monitoring_update_id, user_id) do nothing;
  return true;
end; $$;

revoke execute on function public.queue_monitoring_update_push(uuid) from public, anon, authenticated;
grant execute on function public.queue_monitoring_update_push(uuid) to service_role;
