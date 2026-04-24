-- Device-shared groceries: active cart + suggestion history
create table if not exists public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  quantity integer not null default 1,
  category text not null default 'other',
  is_checked boolean not null default false,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grocery_items_name_not_empty check (char_length(btrim(name)) > 0),
  constraint grocery_items_quantity_min check (quantity >= 1),
  constraint grocery_items_category_valid check (category in ('fruit_veg','bread','dairy','cold_cuts','meat_fish','frozen','dry_goods','spices','toiletries','snacks','drinks','household','other'))
);

create table if not exists public.grocery_item_history (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  name text not null,
  usage_count integer not null default 1,
  category text not null default 'other',
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grocery_item_history_name_not_empty check (char_length(btrim(name)) > 0),
  constraint grocery_item_history_usage_min check (usage_count >= 1),
  constraint grocery_item_history_category_valid check (category in ('fruit_veg','bread','dairy','cold_cuts','meat_fish','frozen','dry_goods','spices','toiletries','snacks','drinks','household','other')),
  constraint grocery_item_history_device_name_unique unique (device_id, name)
);

update public.grocery_items
set category = 'cold_cuts'
where category = 'paalegg';

update public.grocery_item_history
set category = 'cold_cuts'
where category = 'paalegg';

create index if not exists grocery_items_device_active_idx
  on public.grocery_items (device_id, is_checked, updated_at desc);

create index if not exists grocery_item_history_device_usage_idx
  on public.grocery_item_history (device_id, usage_count desc, last_used_at desc);

create or replace function public.set_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_grocery_items_updated_at on public.grocery_items;
create trigger trg_set_grocery_items_updated_at
before update on public.grocery_items
for each row execute function public.set_timestamp_updated_at();

drop trigger if exists trg_set_grocery_item_history_updated_at on public.grocery_item_history;
create trigger trg_set_grocery_item_history_updated_at
before update on public.grocery_item_history
for each row execute function public.set_timestamp_updated_at();

alter table public.grocery_items enable row level security;
alter table public.grocery_item_history enable row level security;

create policy "Members can read grocery items"
on public.grocery_items
for select
using (exists (
  select 1
  from public.device_members dm
  where dm.device_id = grocery_items.device_id
    and dm.user_id = auth.uid()
));

create policy "Members can insert grocery items"
on public.grocery_items
for insert
with check (exists (
  select 1
  from public.device_members dm
  where dm.device_id = grocery_items.device_id
    and dm.user_id = auth.uid()
));

create policy "Members can update grocery items"
on public.grocery_items
for update
using (exists (
  select 1
  from public.device_members dm
  where dm.device_id = grocery_items.device_id
    and dm.user_id = auth.uid()
))
with check (exists (
  select 1
  from public.device_members dm
  where dm.device_id = grocery_items.device_id
    and dm.user_id = auth.uid()
));

create policy "Members can delete grocery items"
on public.grocery_items
for delete
using (exists (
  select 1
  from public.device_members dm
  where dm.device_id = grocery_items.device_id
    and dm.user_id = auth.uid()
));

create policy "Members can read grocery history"
on public.grocery_item_history
for select
using (exists (
  select 1
  from public.device_members dm
  where dm.device_id = grocery_item_history.device_id
    and dm.user_id = auth.uid()
));

create policy "Members can insert grocery history"
on public.grocery_item_history
for insert
with check (exists (
  select 1
  from public.device_members dm
  where dm.device_id = grocery_item_history.device_id
    and dm.user_id = auth.uid()
));

create policy "Members can update grocery history"
on public.grocery_item_history
for update
using (exists (
  select 1
  from public.device_members dm
  where dm.device_id = grocery_item_history.device_id
    and dm.user_id = auth.uid()
))
with check (exists (
  select 1
  from public.device_members dm
  where dm.device_id = grocery_item_history.device_id
    and dm.user_id = auth.uid()
));
