alter table public.reminders
  add column if not exists end_date date null,
  add column if not exists end_time time null;
