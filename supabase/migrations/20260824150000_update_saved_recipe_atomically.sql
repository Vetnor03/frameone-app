-- Replace an existing saved recipe and its complete ingredient list in one
-- transaction. Any exception rolls the statement back, so a failed ingredient
-- write cannot leave the recipe with a partially replaced or empty list.
create or replace function public.update_grocery_recipe_with_ingredients(
  p_recipe_id uuid,
  p_name text,
  p_source_url text,
  p_base_servings numeric,
  p_ingredients jsonb
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if nullif(btrim(p_name), '') is null then
    raise exception 'recipe_name_required';
  end if;

  if jsonb_typeof(p_ingredients) <> 'array' or jsonb_array_length(p_ingredients) = 0 then
    raise exception 'recipe_ingredients_required';
  end if;

  update public.grocery_recipes
  set name = btrim(p_name),
      source_url = nullif(btrim(p_source_url), ''),
      base_servings = p_base_servings
  where id = p_recipe_id;

  if not found then
    raise exception 'recipe_not_found_or_forbidden';
  end if;

  delete from public.grocery_recipe_ingredients
  where recipe_id = p_recipe_id;

  insert into public.grocery_recipe_ingredients
    (recipe_id, name, quantity, unit, category, sort_order)
  select
    p_recipe_id,
    btrim(item.name),
    item.quantity,
    nullif(btrim(item.unit), ''),
    coalesce(nullif(btrim(item.category), ''), 'other'),
    item.sort_order
  from jsonb_to_recordset(p_ingredients) as item(
    name text,
    quantity numeric,
    unit text,
    category text,
    sort_order integer
  )
  order by item.sort_order;

  if exists (
    select 1
    from jsonb_to_recordset(p_ingredients) as item(name text)
    where nullif(btrim(item.name), '') is null
  ) then
    raise exception 'ingredient_name_required';
  end if;
end;
$$;

revoke all on function public.update_grocery_recipe_with_ingredients(uuid, text, text, numeric, jsonb) from public;
grant execute on function public.update_grocery_recipe_with_ingredients(uuid, text, text, numeric, jsonb) to authenticated;

notify pgrst, 'reload schema';
