create table if not exists public.reminder_completions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  reminder_id uuid not null references public.reminders(id) on delete cascade,
  occurrence_date date not null,
  created_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(reminder_id, occurrence_date)
);

create index if not exists idx_reminder_completions_device_date
  on public.reminder_completions(device_id, occurrence_date);

alter table public.reminder_completions enable row level security;

create policy "Members can read reminder completions"
on public.reminder_completions
for select
using (
  exists (
    select 1
    from public.device_members dm
    where dm.device_id = reminder_completions.device_id
      and dm.user_id = auth.uid()
  )
);

create policy "Members can insert reminder completions"
on public.reminder_completions
for insert
with check (
  exists (
    select 1
    from public.device_members dm
    where dm.device_id = reminder_completions.device_id
      and dm.user_id = auth.uid()
  )
);

create policy "Members can delete reminder completions"
on public.reminder_completions
for delete
using (
  exists (
    select 1
    from public.device_members dm
    where dm.device_id = reminder_completions.device_id
      and dm.user_id = auth.uid()
  )
);
