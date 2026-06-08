create extension if not exists pgcrypto;

create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text null,
  source text not null default 'shop',
  created_at timestamptz not null default now()
);

create index if not exists waitlist_signups_created_at_idx
  on public.waitlist_signups (created_at desc);

create index if not exists waitlist_signups_source_idx
  on public.waitlist_signups (source);
