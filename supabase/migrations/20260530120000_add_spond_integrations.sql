create table if not exists public.user_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null default 'disconnected',
  encrypted_credentials jsonb,
  external_account_id text,
  external_account_label text,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_integrations_provider_not_empty check (char_length(btrim(provider)) > 0),
  constraint user_integrations_status_valid check (status in ('connected', 'disconnected', 'error'))
);

create unique index if not exists user_integrations_user_provider_idx
  on public.user_integrations (user_id, provider);

create index if not exists user_integrations_user_status_idx
  on public.user_integrations (user_id, status);

create table if not exists public.integration_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  external_id text not null,
  title text not null,
  body text,
  starts_at timestamptz,
  due_at timestamptz,
  priority integer not null default 0,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_items_provider_not_empty check (char_length(btrim(provider)) > 0),
  constraint integration_items_external_id_not_empty check (char_length(btrim(external_id)) > 0),
  constraint integration_items_title_not_empty check (char_length(btrim(title)) > 0)
);

create unique index if not exists integration_items_user_provider_external_idx
  on public.integration_items (user_id, provider, external_id);

create index if not exists integration_items_user_provider_priority_starts_idx
  on public.integration_items (user_id, provider, priority, starts_at);

alter table public.user_integrations enable row level security;
alter table public.integration_items enable row level security;

drop policy if exists "Users can read own integration status" on public.user_integrations;
create policy "Users can read own integration status"
on public.user_integrations
for select
using (user_id = auth.uid());

drop policy if exists "Users can read own integration items" on public.integration_items;
create policy "Users can read own integration items"
on public.integration_items
for select
using (user_id = auth.uid());
