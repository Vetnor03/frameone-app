-- Run this migration in Supabase to create the Newsletter list used by the shop footer.
create extension if not exists pgcrypto;

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  source text not null default 'shop',
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz null,
  unsubscribe_token uuid not null default gen_random_uuid(),
  welcome_email_sent_at timestamptz null,
  constraint newsletter_subscribers_email_length check (char_length(email) between 3 and 320),
  constraint newsletter_subscribers_email_normalized check (email = lower(trim(email)))
);

create unique index if not exists newsletter_subscribers_email_key
  on public.newsletter_subscribers (email);

create unique index if not exists newsletter_subscribers_unsubscribe_token_key
  on public.newsletter_subscribers (unsubscribe_token);

create index if not exists newsletter_subscribers_active_idx
  on public.newsletter_subscribers (subscribed_at desc)
  where unsubscribed_at is null;

alter table public.newsletter_subscribers enable row level security;

-- No public policies are intentional. The API route uses the service-role key, while
-- browser clients cannot read subscriber emails or write subscription state directly.
revoke all on table public.newsletter_subscribers from anon, authenticated;
