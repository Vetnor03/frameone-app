do $$
begin
  if to_regclass('public.dinner_plan_days') is not null then
    alter table public.dinner_plan_days
      add column if not exists week_start_date date;

    update public.dinner_plan_days
    set week_start_date = (date - ((extract(isodow from date)::int - 1) * interval '1 day'))::date
    where week_start_date is null
      and date is not null;

    create index if not exists dinner_plan_days_device_week_date_idx
      on public.dinner_plan_days (device_id, week_start_date, date);
  end if;
end $$;
