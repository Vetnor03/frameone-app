-- Personal pilot invitations are random application UUIDs.
-- Keep shipping/contact data accessible only to the server service role.
create table if not exists public.pilot_confirmations (
  application_id uuid primary key references public.pilot_applications(id) on delete cascade,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz not null default now(),
  full_name text not null check (char_length(full_name) between 2 and 100),
  phone text not null check (char_length(phone) between 8 and 25),
  shipping_address_line1 text not null check (char_length(shipping_address_line1) between 3 and 160),
  shipping_address_line2 text check (shipping_address_line2 is null or char_length(shipping_address_line2) <= 160),
  shipping_postal_code text not null check (shipping_postal_code ~ '^[0-9]{4}$'),
  shipping_city text not null check (char_length(shipping_city) between 2 and 100),
  shipping_country text not null default 'Norge' check (shipping_country = 'Norge'),
  loan_acknowledged_at timestamptz not null,
  prototype_acknowledged_at timestamptz not null,
  feedback_acknowledged_at timestamptz not null,
  terms_version text not null
);

alter table public.pilot_confirmations enable row level security;
revoke all on table public.pilot_confirmations from public, anon, authenticated;
grant all on table public.pilot_confirmations to service_role;
