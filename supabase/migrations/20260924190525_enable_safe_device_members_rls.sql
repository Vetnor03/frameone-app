-- Enable device_members RLS without recursive membership policies.
-- The helper functions run as postgres and read device_members directly,
-- while exposing only boolean membership/ownership checks to authenticated users.

create schema if not exists private;
revoke all on schema private from public;

create or replace function private.is_device_member(p_device_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.device_members dm
    where dm.device_id = p_device_id
      and dm.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_device_owner(p_device_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.device_members dm
    where dm.device_id = p_device_id
      and dm.user_id = (select auth.uid())
      and dm.role = 'owner'
  );
$$;

revoke all on function private.is_device_member(text) from public;
revoke all on function private.is_device_owner(text) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_device_member(text) to authenticated;
grant execute on function private.is_device_owner(text) to authenticated;

drop policy if exists "device_members: read own rows" on public.device_members;
drop policy if exists "read memberships for my devices" on public.device_members;
drop policy if exists "owner can add members" on public.device_members;
drop policy if exists "owner can change roles (no owner promotion)" on public.device_members;
drop policy if exists "remove member (owner or self)" on public.device_members;

create policy "members can read memberships for their devices"
on public.device_members for select
to authenticated
using (private.is_device_member(device_id));

create policy "owners can add non-owner members"
on public.device_members for insert
to authenticated
with check (
  private.is_device_owner(device_id)
  and role <> 'owner'
);

create policy "owners can update non-owner memberships"
on public.device_members for update
to authenticated
using (private.is_device_owner(device_id))
with check (
  private.is_device_owner(device_id)
  and role <> 'owner'
);

create policy "owners or self can remove memberships"
on public.device_members for delete
to authenticated
using (
  user_id = (select auth.uid())
  or private.is_device_owner(device_id)
);

alter table public.device_members enable row level security;
