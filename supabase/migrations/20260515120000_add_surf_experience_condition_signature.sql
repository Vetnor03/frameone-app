alter table public.user_surf_experiences
  add column if not exists primary_swell_height_m double precision,
  add column if not exists primary_swell_period_s double precision,
  add column if not exists primary_swell_dir_from_deg double precision,
  add column if not exists secondary_swell_height_m double precision,
  add column if not exists secondary_swell_period_s double precision,
  add column if not exists secondary_swell_dir_from_deg double precision,
  add column if not exists third_swell_height_m double precision,
  add column if not exists third_swell_period_s double precision,
  add column if not exists third_swell_dir_from_deg double precision,
  add column if not exists tide_m double precision,
  add column if not exists forecast_time_utc timestamptz,
  add column if not exists selected_swell_index integer,
  add column if not exists condition_signature jsonb;

create index if not exists user_surf_experiences_condition_signature_gin
  on public.user_surf_experiences using gin (condition_signature);
