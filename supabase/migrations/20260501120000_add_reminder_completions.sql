create table if not exists public.reminder_completions (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  reminder_id uuid not null references public.reminders(id) on delete cascade,
  occurrence_date date not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint reminder_completions_unique_occurrence unique (reminder_id, occurrence_date)
);

create index if not exists reminder_completions_device_date_idx
  on public.reminder_completions (device_id, occurrence_date desc);

alter table public.reminder_completions enable row level security;

create policy "Members can read reminder completions"
on public.reminder_completions
for select
using (exists (
  select 1
  from public.device_members dm
  where dm.device_id = reminder_completions.device_id
    and dm.user_id = auth.uid()
));

create policy "Members can insert reminder completions"
on public.reminder_completions
for insert
with check (exists (
  select 1
  from public.device_members dm
  where dm.device_id = reminder_completions.device_id
    and dm.user_id = auth.uid()
));

create policy "Members can delete reminder completions"
on public.reminder_completions
for delete
using (exists (
  select 1
  from public.device_members dm
  where dm.device_id = reminder_completions.device_id
    and dm.user_id = auth.uid()
));
