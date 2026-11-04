alter table public.pilot_confirmations
  add column if not exists participation_acknowledged_at timestamptz;

update public.pilot_confirmations
set participation_acknowledged_at = confirmed_at
where participation_acknowledged_at is null;

alter table public.pilot_confirmations
  alter column participation_acknowledged_at set not null;

comment on column public.pilot_confirmations.participation_acknowledged_at
  is 'Timestamp when the selected pilot explicitly accepted participation in the pilot.';
