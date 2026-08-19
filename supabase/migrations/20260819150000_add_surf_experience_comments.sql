alter table public.user_surf_experiences
  add column if not exists comment text null,
  add column if not exists comment_ai_analysis jsonb null,
  add column if not exists comment_ai_version text null,
  add column if not exists comment_ai_model text null,
  add column if not exists comment_ai_processed_at timestamptz null;

alter table public.user_surf_experiences
  drop constraint if exists user_surf_experiences_comment_length,
  add constraint user_surf_experiences_comment_length
    check (comment is null or char_length(comment) <= 500);

comment on column public.user_surf_experiences.comment_ai_analysis is
  'Strict structured surf observations extracted from the owner comment; never a score or adjustment.';
