alter table public.reminders
  add column if not exists repeat_weekdays smallint[];

alter table public.reminders
  drop constraint if exists reminders_repeat_weekdays_valid;

alter table public.reminders
  add constraint reminders_repeat_weekdays_valid
  check (
    repeat_weekdays is null
    or (
      cardinality(repeat_weekdays) between 1 and 7
      and repeat_weekdays <@ array[1,2,3,4,5,6,7]::smallint[]
    )
  );
