alter table if exists public.reminders
  add column if not exists tag text;
