alter table public.grocery_recipes
  add column if not exists source_url text,
  add column if not exists base_servings numeric;

alter table public.grocery_recipe_ingredients
  add column if not exists quantity numeric,
  add column if not exists unit text,
  add column if not exists sort_order integer not null default 0;

grant insert, update, delete on public.grocery_recipes to authenticated;
grant insert, update, delete on public.grocery_recipe_ingredients to authenticated;
