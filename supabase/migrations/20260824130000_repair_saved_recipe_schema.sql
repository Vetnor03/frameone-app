-- The recipe foundation used CREATE TABLE IF NOT EXISTS. If a project already
-- had these tables, that statement did not add newer columns to them. Repair
-- those installations explicitly before recreating the device-scoped access
-- rules that depend on grocery_recipes.device_id.

alter table public.grocery_recipes
  add column if not exists device_id text,
  add column if not exists source_url text,
  add column if not exists base_servings numeric;

alter table public.grocery_recipe_ingredients
  add column if not exists quantity numeric,
  add column if not exists unit text,
  add column if not exists sort_order integer not null default 0;

alter table public.grocery_items
  add column if not exists amount numeric,
  add column if not exists unit text;

-- Use non-unique repair indexes so legacy duplicate rows cannot prevent this
-- production repair from applying. Clean installs retain the narrower unique
-- indexes created by the foundation migration as well.
create index if not exists grocery_recipes_device_id_idx
  on public.grocery_recipes (device_id);

create index if not exists grocery_recipe_ingredients_recipe_id_idx
  on public.grocery_recipe_ingredients (recipe_id);

alter table public.grocery_recipes enable row level security;
alter table public.grocery_recipe_ingredients enable row level security;

drop policy if exists "Members can read grocery recipes" on public.grocery_recipes;
create policy "Members can read grocery recipes"
on public.grocery_recipes for select
using (
  device_id is null
  or exists (
    select 1 from public.device_members dm
    where dm.device_id = grocery_recipes.device_id
      and dm.user_id = auth.uid()
  )
);

drop policy if exists "Members can insert own grocery recipes" on public.grocery_recipes;
create policy "Members can insert own grocery recipes"
on public.grocery_recipes for insert
with check (
  device_id is not null
  and exists (
    select 1 from public.device_members dm
    where dm.device_id = grocery_recipes.device_id
      and dm.user_id = auth.uid()
  )
);

drop policy if exists "Members can update own grocery recipes" on public.grocery_recipes;
create policy "Members can update own grocery recipes"
on public.grocery_recipes for update
using (
  device_id is not null
  and exists (
    select 1 from public.device_members dm
    where dm.device_id = grocery_recipes.device_id
      and dm.user_id = auth.uid()
  )
)
with check (
  device_id is not null
  and exists (
    select 1 from public.device_members dm
    where dm.device_id = grocery_recipes.device_id
      and dm.user_id = auth.uid()
  )
);

drop policy if exists "Members can delete own grocery recipes" on public.grocery_recipes;
create policy "Members can delete own grocery recipes"
on public.grocery_recipes for delete
using (
  device_id is not null
  and exists (
    select 1 from public.device_members dm
    where dm.device_id = grocery_recipes.device_id
      and dm.user_id = auth.uid()
  )
);

drop policy if exists "Members can read grocery recipe ingredients" on public.grocery_recipe_ingredients;
create policy "Members can read grocery recipe ingredients"
on public.grocery_recipe_ingredients for select
using (exists (
  select 1
  from public.grocery_recipes gr
  where gr.id = grocery_recipe_ingredients.recipe_id
    and (
      gr.device_id is null
      or exists (
        select 1 from public.device_members dm
        where dm.device_id = gr.device_id
          and dm.user_id = auth.uid()
      )
    )
));

drop policy if exists "Members can modify own grocery recipe ingredients" on public.grocery_recipe_ingredients;
create policy "Members can modify own grocery recipe ingredients"
on public.grocery_recipe_ingredients for all
using (exists (
  select 1
  from public.grocery_recipes gr
  join public.device_members dm on dm.device_id = gr.device_id
  where gr.id = grocery_recipe_ingredients.recipe_id
    and gr.device_id is not null
    and dm.user_id = auth.uid()
))
with check (exists (
  select 1
  from public.grocery_recipes gr
  join public.device_members dm on dm.device_id = gr.device_id
  where gr.id = grocery_recipe_ingredients.recipe_id
    and gr.device_id is not null
    and dm.user_id = auth.uid()
));

grant select, insert, update, delete on public.grocery_recipes to authenticated;
grant select, insert, update, delete on public.grocery_recipe_ingredients to authenticated;

-- Ask PostgREST to expose the repaired columns immediately after commit.
notify pgrst, 'reload schema';
