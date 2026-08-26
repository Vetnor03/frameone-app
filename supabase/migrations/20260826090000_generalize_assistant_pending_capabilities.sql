alter table public.assistant_pending_actions
  drop constraint if exists assistant_pending_actions_action_check;

alter table public.assistant_pending_actions
  add constraint assistant_pending_actions_action_check
  check (
    action in ('create_reminder', 'log_surf_experience')
    or action like 'capability:%'
  );
