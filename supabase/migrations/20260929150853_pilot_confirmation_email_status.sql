alter table public.pilot_applications
  add column if not exists confirmation_email_sent_at timestamptz,
  add column if not exists confirmation_email_resend_id text;

comment on column public.pilot_applications.confirmation_email_sent_at
  is 'When Resend accepted the pilot application confirmation email; NULL means not confirmed sent.';
comment on column public.pilot_applications.confirmation_email_resend_id
  is 'Resend message ID for operational tracking. Not exposed to public applicants.';
