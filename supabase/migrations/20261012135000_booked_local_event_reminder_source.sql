-- Booked public Events become ordinary editable reminders on the selected frame.
-- Leave all pre-existing reminders untouched; only new booked-event reminders use these columns.
alter table public.reminders
  add column if not exists source_event_group_key text,
  add column if not exists source_event_external_id text,
  add column if not exists source_event_url text;

-- Idempotent booking: one active personal reminder per event group on a frame.
-- Completed reminders do not block later bookings of a recurring show.
create unique index if not exists reminders_active_booked_event_group_uidx
  on public.reminders(device_id, source_event_group_key)
  where source_event_group_key is not null and is_done = false;
