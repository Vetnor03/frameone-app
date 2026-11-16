-- Track private email notifications so undelivered requests can be retried.
alter table public.integration_requests
  add column if not exists notification_sent_at timestamptz;

create index if not exists integration_requests_pending_email_idx
  on public.integration_requests (created_at)
  where notification_sent_at is null;
