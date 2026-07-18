-- Allow authenticated server routes to unregister only the current browser endpoint on logout.

create or replace function public.service_unregister_push_subscription(
  p_user_id uuid,
  p_endpoint text
)
returns boolean language plpgsql security definer set search_path = public as $$
declare changed_count integer;
begin
  if p_user_id is null then
    raise exception 'missing_user_id' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(p_endpoint, ''))) = 0 then
    raise exception 'invalid_endpoint' using errcode = '22023';
  end if;

  update public.user_push_subscriptions
  set enabled = false,
      last_error = 'user_logged_out_device',
      updated_at = now()
  where user_id = p_user_id
    and endpoint = p_endpoint;

  get diagnostics changed_count = row_count;
  return changed_count > 0;
end; $$;

revoke execute on function public.service_unregister_push_subscription(uuid,text) from public, anon, authenticated;
grant execute on function public.service_unregister_push_subscription(uuid,text) to service_role;
