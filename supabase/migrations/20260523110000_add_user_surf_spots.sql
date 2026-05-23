create table if not exists public.user_surf_spots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  lat double precision not null,
  lng double precision not null,
  parking_lat double precision not null,
  parking_lng double precision not null,
  swell_start_angle double precision not null,
  swell_end_angle double precision not null,
  wind_start_angle double precision not null,
  wind_end_angle double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_surf_spots enable row level security;

do $$ begin
  create policy "user_surf_spots_select_own" on public.user_surf_spots for select using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "user_surf_spots_insert_own" on public.user_surf_spots for insert with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "user_surf_spots_update_own" on public.user_surf_spots for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "user_surf_spots_delete_own" on public.user_surf_spots for delete using (auth.uid() = user_id);
exception when duplicate_object then null; end $$;
