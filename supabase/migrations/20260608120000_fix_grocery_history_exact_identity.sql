-- Keep grocery suggestion/history identity limited to trimmed, lower-cased names
-- with repeated whitespace collapsed. Do not fuzzy/partial/contains-match names.

create or replace function public.normalize_grocery_history_key(item_name text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(btrim(coalesce(item_name, ''))), '\s+', ' ', 'g')
$$;

create or replace function public.record_grocery_purchase(
  device_id text,
  item_name text,
  qty integer default 1,
  category text default 'other'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id text := btrim(coalesce($1, ''));
  v_name text := regexp_replace(btrim(coalesce($2, '')), '\s+', ' ', 'g');
  v_name_key text := public.normalize_grocery_history_key($2);
  v_qty integer := greatest(1, coalesce($3, 1));
  v_category text := coalesce(nullif(btrim($4), ''), 'other');
  v_now timestamptz := now();
  v_existing public.grocery_item_history%rowtype;
  v_observed_until timestamptz;
  v_observed_days numeric(8,2);
  v_average_days numeric(8,2);
begin
  if v_device_id = '' or v_name_key = '' then
    return;
  end if;

  if auth.uid() is null or not exists (
    select 1
    from public.device_members dm
    where dm.device_id = v_device_id
      and dm.user_id = auth.uid()
  ) then
    raise exception 'Not authorized';
  end if;

  if v_category not in ('fruit_veg','bread','dairy','cold_cuts','meat_fish','frozen','dry_goods','spices','toiletries','snacks','drinks','household','other') then
    v_category := 'other';
  end if;

  select *
  into v_existing
  from public.grocery_item_history h
  where h.device_id = v_device_id
    and public.normalize_grocery_history_key(h.name) = v_name_key
  order by h.updated_at desc
  limit 1
  for update;

  if found then
    if v_existing.last_purchased_at is not null then
      v_observed_until := case
        when v_existing.last_marked_out_at is not null
          and v_existing.last_marked_out_at > v_existing.last_purchased_at
          and v_existing.last_marked_out_at <= v_now
          then v_existing.last_marked_out_at
        else v_now
      end;

      v_observed_days := least(
        180,
        greatest(1, extract(epoch from (v_observed_until - v_existing.last_purchased_at)) / 86400.0)
      )::numeric(8,2);

      v_average_days := case
        when v_existing.average_days_available is null then v_observed_days
        else round(((v_existing.average_days_available * least(greatest(v_existing.purchase_count, 1), 20)) + v_observed_days) / (least(greatest(v_existing.purchase_count, 1), 20) + 1), 2)
      end;
    end if;

    update public.grocery_item_history
    set
      name = v_name,
      usage_count = greatest(1, usage_count + v_qty),
      purchase_count = greatest(1, purchase_count + 1),
      category = v_category,
      last_used_at = v_now,
      last_purchased_at = v_now,
      last_marked_out_at = null,
      average_days_available = coalesce(v_average_days, average_days_available)
    where id = v_existing.id;
  else
    insert into public.grocery_item_history (
      device_id,
      name,
      usage_count,
      purchase_count,
      category,
      last_used_at,
      last_purchased_at
    ) values (
      v_device_id,
      v_name,
      v_qty,
      1,
      v_category,
      v_now,
      v_now
    );
  end if;
end;
$$;

create or replace function public.mark_grocery_item_probably_out(
  device_id text,
  item_name text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id text := btrim(coalesce($1, ''));
  v_name text := regexp_replace(btrim(coalesce($2, '')), '\s+', ' ', 'g');
  v_name_key text := public.normalize_grocery_history_key($2);
  v_now timestamptz := now();
  v_existing public.grocery_item_history%rowtype;
  v_observed_days numeric(8,2);
  v_average_days numeric(8,2);
begin
  if v_device_id = '' or v_name_key = '' then
    return;
  end if;

  if auth.uid() is null or not exists (
    select 1
    from public.device_members dm
    where dm.device_id = v_device_id
      and dm.user_id = auth.uid()
  ) then
    raise exception 'Not authorized';
  end if;

  select *
  into v_existing
  from public.grocery_item_history h
  where h.device_id = v_device_id
    and public.normalize_grocery_history_key(h.name) = v_name_key
  order by h.updated_at desc
  limit 1
  for update;

  if found then
    if v_existing.last_purchased_at is not null
      and (v_existing.last_marked_out_at is null or v_existing.last_marked_out_at < v_existing.last_purchased_at)
      and v_now > v_existing.last_purchased_at then
      v_observed_days := least(
        180,
        greatest(1, extract(epoch from (v_now - v_existing.last_purchased_at)) / 86400.0)
      )::numeric(8,2);

      v_average_days := case
        when v_existing.average_days_available is null then v_observed_days
        else round(((v_existing.average_days_available * least(greatest(v_existing.purchase_count, 1), 20)) + v_observed_days) / (least(greatest(v_existing.purchase_count, 1), 20) + 1), 2)
      end;
    end if;

    update public.grocery_item_history
    set
      name = v_name,
      last_marked_out_at = v_now,
      average_days_available = coalesce(v_average_days, average_days_available)
    where id = v_existing.id;
  else
    insert into public.grocery_item_history (
      device_id,
      name,
      usage_count,
      category,
      last_used_at,
      last_marked_out_at
    ) values (
      v_device_id,
      v_name,
      1,
      'other',
      v_now,
      v_now
    );
  end if;
end;
$$;

grant execute on function public.normalize_grocery_history_key(text) to authenticated;
grant execute on function public.record_grocery_purchase(text, text, integer, text) to authenticated;
grant execute on function public.mark_grocery_item_probably_out(text, text) to authenticated;
