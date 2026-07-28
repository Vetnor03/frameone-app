create table if not exists public.shop_frame_interest (
  frame_id text not null,
  visitor_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (frame_id, visitor_id)
);

alter table public.shop_frame_interest enable row level security;

-- No public policies: the server endpoint writes with the service role and
-- aggregate demand is not exposed to storefront clients.
revoke all on table public.shop_frame_interest from anon, authenticated;
