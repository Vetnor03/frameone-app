alter table public.user_app_preferences
  add column if not exists show_ai_assistant boolean not null default true,
  add column if not exists proactive_assistant_tips boolean not null default true,
  add column if not exists assistant_tips_shown integer[] not null default '{}';

