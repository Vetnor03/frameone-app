-- The recipe foundation used CREATE TABLE IF NOT EXISTS. If a project already
-- had partial versions of these tables, that statement left them partial. Keep
-- this migration self-contained: first create missing tables, then reconcile
-- every column used by the current application on pre-existing tables.

create table if not exists public.grocery_recipes (
  id uuid primary key default gen_random_uuid(),
  device_id text,
  name text not null,
  locale text not null default 'en',
  is_active boolean not null default true,
  source_url text,
  base_servings numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.grocery_recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.grocery_recipes(id) on delete cascade,
  name text not null,
  category text not null default 'other',
  is_optional boolean not null default false,
  quantity numeric,
  unit text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.grocery_recipes
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists device_id text,
  add column if not exists name text,
  add column if not exists locale text default 'en',
  add column if not exists is_active boolean default true,
  add column if not exists source_url text,
  add column if not exists base_servings numeric,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.grocery_recipe_ingredients
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists recipe_id uuid,
  add column if not exists name text,
  add column if not exists category text default 'other',
  add column if not exists is_optional boolean default false,
  add column if not exists quantity numeric,
  add column if not exists unit text,
  add column if not exists sort_order integer default 0,
  add column if not exists created_at timestamptz default now();

-- Defaults do not repair NULLs already present in a legacy column. Backfill
-- those columns before restoring the foundation's required constraints.
update public.grocery_recipes
set id = coalesce(id, gen_random_uuid()),
    locale = coalesce(locale, 'en'),
    is_active = coalesce(is_active, true),
    created_at = coalesce(created_at, now()),
    updated_at = coalesce(updated_at, now())
where id is null or locale is null or is_active is null
   or created_at is null or updated_at is null;

update public.grocery_recipe_ingredients
set id = coalesce(id, gen_random_uuid()),
    category = coalesce(category, 'other'),
    is_optional = coalesce(is_optional, false),
    sort_order = coalesce(sort_order, 0),
    created_at = coalesce(created_at, now())
where id is null or category is null or is_optional is null
   or sort_order is null or created_at is null;

alter table public.grocery_recipes
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column name set not null,
  alter column locale set default 'en',
  alter column locale set not null,
  alter column is_active set default true,
  alter column is_active set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.grocery_recipe_ingredients
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column recipe_id set not null,
  alter column name set not null,
  alter column category set default 'other',
  alter column category set not null,
  alter column is_optional set default false,
  alter column is_optional set not null,
  alter column sort_order set default 0,
  alter column sort_order set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

-- Restore primary keys and the cascading ingredient relationship when a
-- partial legacy table omitted them. NOT VALID keeps orphaned historical rows
-- from blocking deployment while enforcing the FK for all new writes.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.grocery_recipes'::regclass and contype = 'p'
  ) then
    alter table public.grocery_recipes
      add constraint grocery_recipes_pkey primary key (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.grocery_recipe_ingredients'::regclass and contype = 'p'
  ) then
    alter table public.grocery_recipe_ingredients
      add constraint grocery_recipe_ingredients_pkey primary key (id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.grocery_recipe_ingredients'::regclass
      and contype = 'f'
      and confrelid = 'public.grocery_recipes'::regclass
  ) then
    alter table public.grocery_recipe_ingredients
      add constraint grocery_recipe_ingredients_recipe_id_fkey
      foreign key (recipe_id) references public.grocery_recipes(id)
      on delete cascade not valid;
  end if;
end
$$;

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

create index if not exists grocery_recipes_name_locale_repair_idx
  on public.grocery_recipes (lower(name), locale);

create index if not exists grocery_recipe_ingredients_recipe_name_repair_idx
  on public.grocery_recipe_ingredients (recipe_id, lower(name));

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
