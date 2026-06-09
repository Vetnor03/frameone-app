-- One-time pre-launch waitlist cleanup.
--
-- Context: public.waitlist_signups currently contains only internal/test
-- signups. Run this exactly once immediately before public launch to remove
-- those test rows and make the next real signup receive waitlist_number = 1.
--
-- Safety notes:
-- - This touches only public.waitlist_signups and its owned waitlist-number
--   sequence.
-- - It does not touch auth users, accounts, devices, app data, shop data, or
--   any other table.
-- - The verification insert below is written directly to the table, so it does
--   not call the application route and does not send a welcome email.

begin;

lock table public.waitlist_signups in access exclusive mode;

do $$
declare
  deleted_count integer;
  duplicate_count integer;
  sequence_name regclass;
  verification_waitlist_number integer;
begin
  sequence_name := pg_get_serial_sequence('public.waitlist_signups', 'waitlist_number')::regclass;

  if sequence_name is null then
    sequence_name := to_regclass('public.waitlist_number_seq');
  end if;

  if sequence_name is null then
    raise exception 'Could not find the waitlist_number sequence for public.waitlist_signups.waitlist_number';
  end if;

  delete from public.waitlist_signups;
  get diagnostics deleted_count = row_count;

  execute format('select setval(%L::regclass, 1, false)', sequence_name::text);

  insert into public.waitlist_signups (email, name, source)
  values (
    'launch-reset-verification@example.invalid',
    'Launch Reset Verification',
    'pre_launch_reset_verification'
  )
  returning waitlist_number into verification_waitlist_number;

  if verification_waitlist_number <> 1 then
    raise exception 'Waitlist reset verification failed: expected waitlist_number 1, got %',
      verification_waitlist_number;
  end if;

  delete from public.waitlist_signups
  where email = 'launch-reset-verification@example.invalid'
    and source = 'pre_launch_reset_verification';

  execute format('select setval(%L::regclass, 1, false)', sequence_name::text);

  select count(*)
  into duplicate_count
  from (
    select waitlist_number
    from public.waitlist_signups
    group by waitlist_number
    having count(*) > 1
  ) duplicate_waitlist_numbers;

  if duplicate_count <> 0 then
    raise exception 'Waitlist reset verification failed: duplicate waitlist numbers remain';
  end if;

  if exists (select 1 from public.waitlist_signups) then
    raise exception 'Waitlist reset verification failed: public.waitlist_signups is not empty after cleanup';
  end if;

  raise notice 'Deleted % test waitlist signup(s). Reset % so the next signup receives waitlist_number 1.',
    deleted_count,
    sequence_name::text;
end $$;

commit;
