-- Disable AI Assistant initiated physical-frame refresh requests.
--
-- The earlier migration has already been applied in deployed environments, so it
-- must remain in migration history. This forward migration removes the live
-- trigger and helper functions without touching Watch data, Assistant content,
-- frame layouts, reminders, Local Events, or normal device refresh behavior.

-- Remove the table trigger first because it depends on the trigger function.
drop trigger if exists trg_ai_assistant_update_read_state_refresh
on public.monitoring_updates;

-- Remove the trigger function and the service-only refresh RPC.
drop function if exists public.ai_assistant_update_read_state_refresh_trigger();
drop function if exists public.request_ai_assistant_frame_content_refresh(uuid, text);
