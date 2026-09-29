create extension if not exists pgcrypto;

create table if not exists public.pilot_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null check (char_length(full_name) between 1 and 100),
  email text not null unique check (char_length(email) <= 200),
  city text not null check (char_length(city) between 1 and 80),
  household text not null check (household in ('me', 'shared')),
  platform text not null check (platform in ('ios', 'android', 'both')),
  home_wifi text not null check (home_wifi in ('yes', 'no', 'unsure')),
  use_case text not null check (use_case in ('reminders','calendar','weather_news','mixed','other')),
  note text check (note is null or char_length(note) <= 400),
  age_confirmed boolean not null check (age_confirmed),
  prototype_acknowledged_at timestamptz not null,
  return_acknowledged_at timestamptz not null,
  feedback_acknowledged_at timestamptz not null,
  terms_version text not null,
  source text not null default 'pilot-public-application',
  status text not null default 'applied' check (status in ('applied','shortlisted','selected','declined','withdrawn'))
);

create index if not exists pilot_applications_created_at_idx on public.pilot_applications (created_at desc);
create index if not exists pilot_applications_status_idx on public.pilot_applications (status, created_at desc);

alter table public.pilot_applications enable row level security;
revoke all on table public.pilot_applications from public, anon, authenticated;
grant all on table public.pilot_applications to service_role;
