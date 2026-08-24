alter table public.grocery_recipes
  add column if not exists source_url text,
  add column if not exists base_servings numeric;

alter table public.grocery_recipe_ingredients
  add column if not exists quantity numeric,
  add column if not exists unit text,
  add column if not exists sort_order integer not null default 0;

grant insert, update, delete on public.grocery_recipes to authenticated;
grant insert, update, delete on public.grocery_recipe_ingredients to authenticated;

-- Recipe amounts stay structured instead of being baked into item names. Normal
-- grocery entry continues to use quantity exactly as before.
alter table public.grocery_items
  add column if not exists amount numeric,
  add column if not exists unit text;
