-- Teams reuses the generic integration tables introduced for Spond.
-- user_integrations stores the provider connection row and encrypted OAuth token payload.
-- integration_items stores normalized, provider-scoped cached items such as today's Teams meetings.

comment on table public.user_integrations is 'Per-user external app connections. Reused by Spond and Teams; provider identifies the integration.';
comment on column public.user_integrations.encrypted_credentials is 'Encrypted provider credential payload (Spond credentials or Microsoft OAuth tokens).';
comment on column public.user_integrations.external_account_label is 'Human-readable provider account label such as email or display name.';
comment on table public.integration_items is 'Cached provider items for frame rendering, including Spond items and Teams calendar meetings.';
comment on column public.integration_items.body is 'Optional provider item detail. For Teams this stores the display-safe location, never the join URL.';
comment on column public.integration_items.raw is 'Normalized provider payload safe for server-side reuse; Teams payload excludes meeting join links.';

create index if not exists integration_items_user_provider_starts_idx
  on public.integration_items (user_id, provider, starts_at)
  where starts_at is not null;
