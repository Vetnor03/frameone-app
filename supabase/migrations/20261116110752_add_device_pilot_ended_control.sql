-- Operator control; existing and newly registered frames remain active.
alter table public.devices
  add column if not exists pilot_ended boolean not null default false;
comment on column public.devices.pilot_ended is
  'Operator-only: true displays Pilot test ended and enters shelf sleep. Set false and reconnect USB to reactivate.';

-- Owners already have a row UPDATE policy. Preserve their existing column
-- privileges while excluding this new operator-only control. A column REVOKE
-- alone would not override the existing table-wide INSERT/UPDATE grants.
do $$
declare
  app_role text;
  operation text;
  existing_columns text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum)
  into existing_columns
  from pg_attribute
  where attrelid = 'public.devices'::regclass
    and attnum > 0 and not attisdropped and attname <> 'pilot_ended';

  foreach app_role in array array['anon', 'authenticated'] loop
    foreach operation in array array['INSERT', 'UPDATE'] loop
      if has_table_privilege(app_role, 'public.devices', operation) then
        execute format('revoke %s on public.devices from %I', operation, app_role);
        execute format('grant %s (%s) on public.devices to %I', operation, existing_columns, app_role);
      end if;
    end loop;
  end loop;
end;
$$;
revoke insert (pilot_ended), update (pilot_ended) on public.devices from anon, authenticated;
