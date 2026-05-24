create table if not exists public.custom_surf_spots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  lat double precision not null,
  lon double precision not null,
  parking_lat double precision not null,
  parking_lon double precision not null,
  swell_sector_start_deg double precision not null,
  swell_sector_end_deg double precision not null,
  swell_main_deg double precision not null,
  wind_sector_start_deg double precision not null,
  wind_sector_end_deg double precision not null,
  wind_main_deg double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.custom_surf_spots enable row level security;

create policy "custom_surf_spots_select_own" on public.custom_surf_spots for select using (auth.uid() = user_id);
create policy "custom_surf_spots_insert_own" on public.custom_surf_spots for insert with check (auth.uid() = user_id);
create policy "custom_surf_spots_update_own" on public.custom_surf_spots for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "custom_surf_spots_delete_own" on public.custom_surf_spots for delete using (auth.uid() = user_id);
