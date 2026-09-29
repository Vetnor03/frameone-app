-- Treat capitalization and accidental surrounding spaces as the same email,
-- including for future non-API/admin imports. The API also normalizes email.
create unique index if not exists pilot_applications_email_normalized_unique_idx
  on public.pilot_applications (lower(btrim(email)));
