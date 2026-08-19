alter table public.user_surf_experiences
  add column if not exists surf_model_version text;

comment on column public.user_surf_experiences.surf_model_version is
  'Deterministic surf scorer version used when the experience conditions were captured.';

create index if not exists user_surf_experiences_spot_logged_at_idx
  on public.user_surf_experiences (spot_id, logged_at desc);
