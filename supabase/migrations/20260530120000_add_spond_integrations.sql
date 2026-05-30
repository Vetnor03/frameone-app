-- Spond integration connection metadata and imported reminder-like items.
-- Credentials are encrypted in the application before being written to encrypted_credentials.
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
  constraint user_integrations_status_valid check (status in ('connected', 'disconnected', 'error')),
  constraint user_integrations_user_provider_unique unique (user_id, provider)
);

create table if not exists public.integration_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  external_id text not null,
  title text not null,
  body text,
  starts_at timestamptz,
  due_at timestamptz,
  priority integer not null default 100,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_items_provider_not_empty check (char_length(btrim(provider)) > 0),
  constraint integration_items_external_id_not_empty check (char_length(btrim(external_id)) > 0),
  constraint integration_items_title_not_empty check (char_length(btrim(title)) > 0),
  constraint integration_items_user_provider_external_unique unique (user_id, provider, external_id)
);

create index if not exists user_integrations_user_provider_idx
  on public.user_integrations (user_id, provider);

create index if not exists integration_items_user_provider_due_idx
  on public.integration_items (user_id, provider, priority, due_at, starts_at);

create or replace function public.set_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_user_integrations_updated_at on public.user_integrations;
create trigger trg_set_user_integrations_updated_at
before update on public.user_integrations
for each row execute function public.set_timestamp_updated_at();

drop trigger if exists trg_set_integration_items_updated_at on public.integration_items;
create trigger trg_set_integration_items_updated_at
before update on public.integration_items
for each row execute function public.set_timestamp_updated_at();

alter table public.user_integrations enable row level security;
alter table public.integration_items enable row level security;

drop policy if exists "Users can read own integrations" on public.user_integrations;
create policy "Users can read own integrations"
on public.user_integrations
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own integrations" on public.user_integrations;
create policy "Users can insert own integrations"
on public.user_integrations
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own integrations" on public.user_integrations;
create policy "Users can update own integrations"
on public.user_integrations
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own integrations" on public.user_integrations;
create policy "Users can delete own integrations"
on public.user_integrations
for delete
using (auth.uid() = user_id);

drop policy if exists "Users can read own integration items" on public.integration_items;
create policy "Users can read own integration items"
on public.integration_items
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own integration items" on public.integration_items;
create policy "Users can insert own integration items"
on public.integration_items
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own integration items" on public.integration_items;
create policy "Users can update own integration items"
on public.integration_items
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own integration items" on public.integration_items;
create policy "Users can delete own integration items"
on public.integration_items
for delete
using (auth.uid() = user_id);
