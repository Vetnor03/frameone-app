-- Meal idea source data for groceries frames/mirror views.
-- Suggestions are optional per-device rows; the app can also score global recipes
-- against grocery_item_history / recent checked grocery_items when no suggestions
-- have been precomputed.

create table if not exists public.grocery_recipes (
  id uuid primary key default gen_random_uuid(),
  device_id text,
  name text not null,
  locale text not null default 'en',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grocery_recipes_name_not_empty check (char_length(btrim(name)) > 0)
);

create table if not exists public.grocery_recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.grocery_recipes(id) on delete cascade,
  name text not null,
  category text not null default 'other',
  is_optional boolean not null default false,
  created_at timestamptz not null default now(),
  constraint grocery_recipe_ingredients_name_not_empty check (char_length(btrim(name)) > 0),
  constraint grocery_recipe_ingredients_category_valid check (category in ('fruit_veg','bread','dairy','cold_cuts','meat_fish','frozen','dry_goods','spices','toiletries','snacks','drinks','household','other'))
);

create table if not exists public.grocery_recipe_suggestions (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  recipe_id uuid references public.grocery_recipes(id) on delete set null,
  name text not null,
  missing text[] not null default '{}',
  score numeric(10,2) not null default 0,
  reason text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint grocery_recipe_suggestions_name_not_empty check (char_length(btrim(name)) > 0)
);

create unique index if not exists grocery_recipes_global_name_locale_idx
  on public.grocery_recipes (lower(name), locale)
  where device_id is null;

create unique index if not exists grocery_recipes_device_name_locale_idx
  on public.grocery_recipes (device_id, lower(name), locale)
  where device_id is not null;

create unique index if not exists grocery_recipe_ingredients_recipe_name_idx
  on public.grocery_recipe_ingredients (recipe_id, lower(name));

create index if not exists grocery_recipe_suggestions_device_score_idx
  on public.grocery_recipe_suggestions (device_id, score desc, updated_at desc);

create or replace function public.set_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_grocery_recipes_updated_at on public.grocery_recipes;
create trigger trg_set_grocery_recipes_updated_at
before update on public.grocery_recipes
for each row execute function public.set_timestamp_updated_at();

drop trigger if exists trg_set_grocery_recipe_suggestions_updated_at on public.grocery_recipe_suggestions;
create trigger trg_set_grocery_recipe_suggestions_updated_at
before update on public.grocery_recipe_suggestions
for each row execute function public.set_timestamp_updated_at();

alter table public.grocery_recipes enable row level security;
alter table public.grocery_recipe_ingredients enable row level security;
alter table public.grocery_recipe_suggestions enable row level security;

drop policy if exists "Members can read grocery recipes" on public.grocery_recipes;
create policy "Members can read grocery recipes"
on public.grocery_recipes
for select
using (
  device_id is null
  or exists (
    select 1
    from public.device_members dm
    where dm.device_id = grocery_recipes.device_id
      and dm.user_id = auth.uid()
  )
);

drop policy if exists "Members can insert own grocery recipes" on public.grocery_recipes;
create policy "Members can insert own grocery recipes"
on public.grocery_recipes
for insert
with check (
  device_id is not null
  and exists (
    select 1
    from public.device_members dm
    where dm.device_id = grocery_recipes.device_id
      and dm.user_id = auth.uid()
  )
);

drop policy if exists "Members can update own grocery recipes" on public.grocery_recipes;
create policy "Members can update own grocery recipes"
on public.grocery_recipes
for update
using (
  device_id is not null
  and exists (
    select 1
    from public.device_members dm
    where dm.device_id = grocery_recipes.device_id
      and dm.user_id = auth.uid()
  )
)
with check (
  device_id is not null
  and exists (
    select 1
    from public.device_members dm
    where dm.device_id = grocery_recipes.device_id
      and dm.user_id = auth.uid()
  )
);

drop policy if exists "Members can delete own grocery recipes" on public.grocery_recipes;
create policy "Members can delete own grocery recipes"
on public.grocery_recipes
for delete
using (
  device_id is not null
  and exists (
    select 1
    from public.device_members dm
    where dm.device_id = grocery_recipes.device_id
      and dm.user_id = auth.uid()
  )
);

drop policy if exists "Members can read grocery recipe ingredients" on public.grocery_recipe_ingredients;
create policy "Members can read grocery recipe ingredients"
on public.grocery_recipe_ingredients
for select
using (exists (
  select 1
  from public.grocery_recipes gr
  where gr.id = grocery_recipe_ingredients.recipe_id
    and (
      gr.device_id is null
      or exists (
        select 1
        from public.device_members dm
        where dm.device_id = gr.device_id
          and dm.user_id = auth.uid()
      )
    )
));

drop policy if exists "Members can modify own grocery recipe ingredients" on public.grocery_recipe_ingredients;
create policy "Members can modify own grocery recipe ingredients"
on public.grocery_recipe_ingredients
for all
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

drop policy if exists "Members can read grocery recipe suggestions" on public.grocery_recipe_suggestions;
create policy "Members can read grocery recipe suggestions"
on public.grocery_recipe_suggestions
for select
using (exists (
  select 1
  from public.device_members dm
  where dm.device_id = grocery_recipe_suggestions.device_id
    and dm.user_id = auth.uid()
));

drop policy if exists "Members can insert grocery recipe suggestions" on public.grocery_recipe_suggestions;
create policy "Members can insert grocery recipe suggestions"
on public.grocery_recipe_suggestions
for insert
with check (exists (
  select 1
  from public.device_members dm
  where dm.device_id = grocery_recipe_suggestions.device_id
    and dm.user_id = auth.uid()
));

drop policy if exists "Members can update grocery recipe suggestions" on public.grocery_recipe_suggestions;
create policy "Members can update grocery recipe suggestions"
on public.grocery_recipe_suggestions
for update
using (exists (
  select 1
  from public.device_members dm
  where dm.device_id = grocery_recipe_suggestions.device_id
    and dm.user_id = auth.uid()
))
with check (exists (
  select 1
  from public.device_members dm
  where dm.device_id = grocery_recipe_suggestions.device_id
    and dm.user_id = auth.uid()
));

drop policy if exists "Members can delete grocery recipe suggestions" on public.grocery_recipe_suggestions;
create policy "Members can delete grocery recipe suggestions"
on public.grocery_recipe_suggestions
for delete
using (exists (
  select 1
  from public.device_members dm
  where dm.device_id = grocery_recipe_suggestions.device_id
    and dm.user_id = auth.uid()
));

grant select on public.grocery_recipes to authenticated;
grant select on public.grocery_recipe_ingredients to authenticated;
grant select, insert, update, delete on public.grocery_recipe_suggestions to authenticated;

with seed_recipes(name, locale) as (
  values
    ('Pasta with tomato sauce', 'en'),
    ('Chicken rice bowl', 'en'),
    ('Taco dinner', 'en'),
    ('Salmon potatoes', 'en'),
    ('Omelette', 'en'),
    ('Yoghurt bowl', 'en'),
    ('Fried rice', 'en'),
    ('Soup and bread', 'en'),
    ('Pasta med tomatsaus', 'no'),
    ('Taco middag', 'no'),
    ('Laks med poteter', 'no'),
    ('Omelett', 'no')
)
insert into public.grocery_recipes (name, locale)
select sr.name, sr.locale
from seed_recipes sr
where not exists (
  select 1
  from public.grocery_recipes gr
  where gr.device_id is null
    and lower(gr.name) = lower(sr.name)
    and gr.locale = sr.locale
);

with seed_ingredients(recipe_name, locale, ingredient_name, category) as (
  values
    ('Pasta with tomato sauce', 'en', 'pasta', 'dry_goods'),
    ('Pasta with tomato sauce', 'en', 'tomato', 'fruit_veg'),
    ('Pasta with tomato sauce', 'en', 'cheese', 'dairy'),
    ('Chicken rice bowl', 'en', 'chicken', 'meat_fish'),
    ('Chicken rice bowl', 'en', 'rice', 'dry_goods'),
    ('Chicken rice bowl', 'en', 'vegetables', 'fruit_veg'),
    ('Taco dinner', 'en', 'tortilla', 'bread'),
    ('Taco dinner', 'en', 'minced meat', 'meat_fish'),
    ('Taco dinner', 'en', 'cheese', 'dairy'),
    ('Taco dinner', 'en', 'tomato', 'fruit_veg'),
    ('Salmon potatoes', 'en', 'salmon', 'meat_fish'),
    ('Salmon potatoes', 'en', 'potatoes', 'fruit_veg'),
    ('Salmon potatoes', 'en', 'broccoli', 'fruit_veg'),
    ('Omelette', 'en', 'eggs', 'dairy'),
    ('Omelette', 'en', 'cheese', 'dairy'),
    ('Omelette', 'en', 'ham', 'cold_cuts'),
    ('Yoghurt bowl', 'en', 'yoghurt', 'dairy'),
    ('Yoghurt bowl', 'en', 'banana', 'fruit_veg'),
    ('Yoghurt bowl', 'en', 'banan', 'fruit_veg'),
    ('Fried rice', 'en', 'rice', 'dry_goods'),
    ('Fried rice', 'en', 'eggs', 'dairy'),
    ('Fried rice', 'en', 'vegetables', 'fruit_veg'),
    ('Soup and bread', 'en', 'soup', 'dry_goods'),
    ('Soup and bread', 'en', 'bread', 'bread'),
    ('Pasta med tomatsaus', 'no', 'pasta', 'dry_goods'),
    ('Pasta med tomatsaus', 'no', 'tomat', 'fruit_veg'),
    ('Pasta med tomatsaus', 'no', 'ost', 'dairy'),
    ('Taco middag', 'no', 'tortilla', 'bread'),
    ('Taco middag', 'no', 'kjøttdeig', 'meat_fish'),
    ('Taco middag', 'no', 'ost', 'dairy'),
    ('Taco middag', 'no', 'tomat', 'fruit_veg'),
    ('Laks med poteter', 'no', 'laks', 'meat_fish'),
    ('Laks med poteter', 'no', 'poteter', 'fruit_veg'),
    ('Laks med poteter', 'no', 'brokkoli', 'fruit_veg'),
    ('Omelett', 'no', 'egg', 'dairy'),
    ('Omelett', 'no', 'ost', 'dairy'),
    ('Omelett', 'no', 'skinke', 'cold_cuts')
), resolved as (
  select gr.id as recipe_id, si.ingredient_name, si.category
  from seed_ingredients si
  join public.grocery_recipes gr
    on gr.device_id is null
   and lower(gr.name) = lower(si.recipe_name)
   and gr.locale = si.locale
)
insert into public.grocery_recipe_ingredients (recipe_id, name, category)
select r.recipe_id, r.ingredient_name, r.category
from resolved r
where not exists (
  select 1
  from public.grocery_recipe_ingredients gri
  where gri.recipe_id = r.recipe_id
    and lower(gri.name) = lower(r.ingredient_name)
);
