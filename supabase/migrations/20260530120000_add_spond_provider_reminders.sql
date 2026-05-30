create table if not exists public.user_connected_providers (
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null default 'connected',
  encrypted_credentials jsonb,
  encrypted_session jsonb,
  last_sync_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider),
  constraint user_connected_providers_provider_check check (provider in ('spond')),
  constraint user_connected_providers_status_check check (status in ('connected', 'error', 'disabled'))
);

create table if not exists public.external_reminder_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  source text not null default 'spond',
  external_id text not null,
  title text not null,
  text text,
  due_at timestamptz not null,
  source_metadata jsonb not null default '{}'::jsonb,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint external_reminder_items_provider_check check (provider in ('spond')),
  constraint external_reminder_items_source_check check (source in ('spond')),
  constraint external_reminder_items_unique unique (user_id, provider, external_id)
);

create index if not exists external_reminder_items_user_due_idx
  on public.external_reminder_items (user_id, due_at)
  where dismissed_at is null;

alter table public.user_connected_providers enable row level security;
alter table public.external_reminder_items enable row level security;

drop policy if exists "user_connected_providers_select_own" on public.user_connected_providers;
create policy "user_connected_providers_select_own"
  on public.user_connected_providers for select
  using (auth.uid() = user_id);

drop policy if exists "user_connected_providers_delete_own" on public.user_connected_providers;
create policy "user_connected_providers_delete_own"
  on public.user_connected_providers for delete
  using (auth.uid() = user_id);

drop policy if exists "external_reminder_items_select_own" on public.external_reminder_items;
create policy "external_reminder_items_select_own"
  on public.external_reminder_items for select
  using (auth.uid() = user_id);

drop policy if exists "external_reminder_items_update_own_dismissal" on public.external_reminder_items;
create policy "external_reminder_items_update_own_dismissal"
  on public.external_reminder_items for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
