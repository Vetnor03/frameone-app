create extension if not exists pgcrypto;

create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text null,
  source text not null default 'shop',
  product_interest text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint waitlist_signups_email_not_blank check (length(btrim(email)) > 0)
);

create unique index if not exists waitlist_signups_email_key on public.waitlist_signups (email);

create or replace function public.set_waitlist_signups_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists waitlist_signups_set_updated_at on public.waitlist_signups;
create trigger waitlist_signups_set_updated_at
before update on public.waitlist_signups
for each row
execute function public.set_waitlist_signups_updated_at();

alter table public.waitlist_signups enable row level security;
