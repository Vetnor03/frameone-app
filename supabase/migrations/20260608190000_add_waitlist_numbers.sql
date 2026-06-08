create sequence if not exists public.waitlist_number_seq start 1;

alter table public.waitlist_signups
  add column if not exists waitlist_number integer;

alter sequence public.waitlist_number_seq owned by public.waitlist_signups.waitlist_number;

alter table public.waitlist_signups
  alter column waitlist_number set default nextval('public.waitlist_number_seq');

with numbered_signups as (
  select
    id,
    coalesce((select max(waitlist_number) from public.waitlist_signups), 0)
      + row_number() over (order by created_at, id)::integer as next_waitlist_number
  from public.waitlist_signups
  where waitlist_number is null
)
update public.waitlist_signups
set waitlist_number = numbered_signups.next_waitlist_number
from numbered_signups
where public.waitlist_signups.id = numbered_signups.id;

select setval(
  'public.waitlist_number_seq',
  coalesce((select max(waitlist_number) from public.waitlist_signups), 1),
  (select max(waitlist_number) is not null from public.waitlist_signups)
);

alter table public.waitlist_signups
  alter column waitlist_number set not null;

create unique index if not exists waitlist_signups_waitlist_number_key
  on public.waitlist_signups (waitlist_number);
