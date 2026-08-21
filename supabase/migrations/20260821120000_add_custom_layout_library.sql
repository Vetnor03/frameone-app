create table if not exists public.custom_layouts (
  id uuid primary key default gen_random_uuid(),
  device_id text not null references public.devices(device_id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  cells jsonb not null check (jsonb_typeof(cells) = 'array' and jsonb_array_length(cells) between 1 and 16),
  sort_order bigint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists custom_layouts_device_order_idx on public.custom_layouts(device_id, sort_order, created_at);
alter table public.custom_layouts enable row level security;

create policy "Owners can read custom layouts" on public.custom_layouts for select to authenticated
using (owner_user_id = auth.uid() and exists (select 1 from public.device_members dm where dm.device_id = custom_layouts.device_id and dm.user_id = auth.uid()));
create policy "Owners can create custom layouts" on public.custom_layouts for insert to authenticated
with check (owner_user_id = auth.uid() and exists (select 1 from public.device_members dm where dm.device_id = custom_layouts.device_id and dm.user_id = auth.uid()));
create policy "Owners can update custom layouts" on public.custom_layouts for update to authenticated
using (owner_user_id = auth.uid() and exists (select 1 from public.device_members dm where dm.device_id = custom_layouts.device_id and dm.user_id = auth.uid()))
with check (owner_user_id = auth.uid() and exists (select 1 from public.device_members dm where dm.device_id = custom_layouts.device_id and dm.user_id = auth.uid()));
create policy "Owners can delete custom layouts" on public.custom_layouts for delete to authenticated
using (owner_user_id = auth.uid() and exists (select 1 from public.device_members dm where dm.device_id = custom_layouts.device_id and dm.user_id = auth.uid()));

create or replace function public.touch_custom_layout_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists custom_layouts_touch_updated_at on public.custom_layouts;
create trigger custom_layouts_touch_updated_at before update on public.custom_layouts for each row execute function public.touch_custom_layout_updated_at();
