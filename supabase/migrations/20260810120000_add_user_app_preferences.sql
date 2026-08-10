create table if not exists public.user_app_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  app_theme text not null default 'light'
    constraint user_app_preferences_app_theme_check check (app_theme in ('light', 'dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_app_preferences enable row level security;

drop policy if exists "Users can manage own app preferences" on public.user_app_preferences;
create policy "Users can manage own app preferences"
  on public.user_app_preferences
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists trg_user_app_preferences_updated_at on public.user_app_preferences;
create trigger trg_user_app_preferences_updated_at
  before update on public.user_app_preferences
  for each row execute function public.set_timestamp_updated_at();

grant select, insert, update, delete on public.user_app_preferences to authenticated;
