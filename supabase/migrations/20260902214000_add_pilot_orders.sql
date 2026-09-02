create extension if not exists pgcrypto;

create table if not exists public.pilot_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  full_name text not null,
  email text not null unique,
  shipping_address_line1 text not null,
  shipping_address_line2 text,
  shipping_postal_code text not null,
  shipping_city text not null,
  shipping_country text not null default 'Norway',
  frame_id text not null check (frame_id in ('american-walnut', 'dark-charcoal', 'light-oak')),
  frame_name text not null,
  matte_id text not null check (matte_id in ('beige', 'solid-black', 'new-castle', 'sanguine', 'midnight-blue-velour', 'silver-birch')),
  matte_name text not null,
  matte_limited_edition boolean not null default false,
  status text not null default 'submitted' check (status in ('submitted', 'confirmed', 'fulfilled', 'cancelled')),
  source text not null default 'pilot-page'
);

create index if not exists pilot_orders_created_at_idx on public.pilot_orders (created_at desc);
create index if not exists pilot_orders_status_idx on public.pilot_orders (status, created_at desc);

alter table public.pilot_orders enable row level security;

revoke all on table public.pilot_orders from anon, authenticated;
grant all on table public.pilot_orders to service_role;
