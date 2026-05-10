-- Week-scoped dinner plans. Existing rows are backfilled to the Monday of their
-- saved dinner date so the app can keep reading the current week without data loss.
do $$
begin
  if to_regclass('public.dinner_plan_days') is not null then
    alter table public.dinner_plan_days
      add column if not exists week_start_date date;

    update public.dinner_plan_days
    set week_start_date = (date::date - (((extract(dow from date::date)::int + 6) % 7))::int)
    where week_start_date is null
      and date is not null;

    create index if not exists dinner_plan_days_device_week_start_idx
      on public.dinner_plan_days (device_id, week_start_date, date);
  end if;
end $$;
