-- Keep earlier applicants' historical declarations intact. A null value is not consent.
alter table public.pilot_applications
  add column if not exists pilot_contact_acknowledged_at timestamptz;

comment on column public.pilot_applications.pilot_contact_acknowledged_at
  is 'Timestamp of explicit acceptance of pilot-only email follow-up during and after the test (terms version 2026-09-29-v3). NULL for earlier applications; do not infer consent from legacy fields.';
