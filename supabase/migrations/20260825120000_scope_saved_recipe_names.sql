-- Generic recipes are identified by device_id IS NULL. Saved recipes belong to
-- a device (and are private to its members through the existing RLS policies).
-- Remove legacy global name uniqueness without rewriting or deleting any rows.
alter table public.grocery_recipes
  drop constraint if exists grocery_recipes_name_key;

drop index if exists public.grocery_recipes_global_name_locale_idx;

-- Keep generic seed names unique among generic recipes, while saved names are
-- unique only inside a device. These indexes do not conflict with one another.
create unique index if not exists grocery_recipes_global_name_locale_idx
  on public.grocery_recipes (lower(name), locale)
  where device_id is null;

create unique index if not exists grocery_recipes_device_name_locale_idx
  on public.grocery_recipes (device_id, lower(name), locale)
  where device_id is not null;

-- Save or replace one device-owned recipe and all of its ingredients in a
-- single transaction. RLS on both tables remains authoritative because this is
-- SECURITY INVOKER. The partial device index makes concurrent duplicate saves
-- settle on the existing row rather than exposing a constraint error.
create or replace function public.save_grocery_recipe_with_ingredients(
  p_device_id text,
  p_name text,
  p_locale text,
  p_source_url text,
  p_base_servings numeric,
  p_ingredients jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  saved_id uuid;
begin
  if nullif(btrim(p_name), '') is null then
    raise exception 'recipe_name_required';
  end if;
  if nullif(btrim(p_device_id), '') is null then
    raise exception 'recipe_device_required';
  end if;
  if jsonb_typeof(p_ingredients) <> 'array' or jsonb_array_length(p_ingredients) = 0 then
    raise exception 'recipe_ingredients_required';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_ingredients) as item(name text)
    where nullif(btrim(item.name), '') is null
  ) then
    raise exception 'ingredient_name_required';
  end if;

  select id into saved_id
  from public.grocery_recipes
  where device_id = p_device_id
    and lower(name) = lower(btrim(p_name))
    and locale = coalesce(nullif(btrim(p_locale), ''), 'en')
  for update;

  if saved_id is null then
    begin
      insert into public.grocery_recipes
        (device_id, name, locale, source_url, base_servings)
      values
        (p_device_id, btrim(p_name), coalesce(nullif(btrim(p_locale), ''), 'en'),
         nullif(btrim(p_source_url), ''), p_base_servings)
      returning id into saved_id;
    exception when unique_violation then
      select id into saved_id
      from public.grocery_recipes
      where device_id = p_device_id
        and lower(name) = lower(btrim(p_name))
        and locale = coalesce(nullif(btrim(p_locale), ''), 'en')
      for update;
    end;
  end if;

  update public.grocery_recipes
  set name = btrim(p_name),
      source_url = nullif(btrim(p_source_url), ''),
      base_servings = p_base_servings,
      is_active = true
  where id = saved_id;

  if not found then
    raise exception 'recipe_not_found_or_forbidden';
  end if;

  delete from public.grocery_recipe_ingredients where recipe_id = saved_id;
  insert into public.grocery_recipe_ingredients
    (recipe_id, name, quantity, unit, category, sort_order)
  select saved_id, btrim(item.name), item.quantity, nullif(btrim(item.unit), ''),
         coalesce(nullif(btrim(item.category), ''), 'other'), item.sort_order
  from jsonb_to_recordset(p_ingredients) as item(
    name text, quantity numeric, unit text, category text, sort_order integer
  )
  order by item.sort_order;

  return saved_id;
end;
$$;

revoke all on function public.save_grocery_recipe_with_ingredients(text, text, text, text, numeric, jsonb) from public;
grant execute on function public.save_grocery_recipe_with_ingredients(text, text, text, text, numeric, jsonb) to authenticated;

notify pgrst, 'reload schema';
