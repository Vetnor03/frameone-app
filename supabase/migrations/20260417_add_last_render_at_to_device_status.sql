alter table public.device_status
add column if not exists last_render_at timestamptz;

comment on column public.device_status.last_render_at is
'Timestamp for when the frame last completed an actual screen redraw/render.';
