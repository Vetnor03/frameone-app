-- Green is part of the five photographed pilot matte choices.
-- Preserve older pilot selections so existing records continue to validate.
alter table public.pilot_orders
  drop constraint if exists pilot_orders_matte_id_check;

alter table public.pilot_orders
  add constraint pilot_orders_matte_id_check
  check (matte_id in (
    'beige', 'solid-black', 'new-castle', 'sanguine', 'green',
    'midnight-blue-velour', 'silver-birch'
  ));
