-- One-time pre-launch cleanup: after deleting test waitlist rows, reset the
-- sequence so the next real signup receives waitlist_number 1.
select setval('public.waitlist_number_seq', 1, false)
where not exists (select 1 from public.waitlist_signups);
