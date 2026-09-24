-- Low-risk security hardening: remove anonymous Data API access while
-- preserving authenticated and service-role behavior. RLS is intentionally
-- left unchanged in this migration.

revoke all privileges on table public.device_members from anon;
revoke all privileges on table public.grocery_running_low from anon;
revoke all privileges on table public.grocery_recipe_suggestions from anon;

revoke execute on function public.add_grocery_items_canonical(text,jsonb,uuid) from public, anon;
revoke execute on function public.bump_direct_frame_content() from public, anon;
revoke execute on function public.bump_integration_frame_content() from public, anon;
revoke execute on function public.bump_user_surf_frame_content() from public, anon;
revoke execute on function public.claim_pair_code(text) from public, anon;
revoke execute on function public.complete_initial_device_onboarding(text,jsonb,jsonb,jsonb) from public, anon;
revoke execute on function public.consume_assistant_request(text,integer) from public, anon;
revoke execute on function public.create_member_pair_code(text) from public, anon;
revoke execute on function public.device_pair_status(text) from public, anon;
revoke execute on function public.ensure_device_token(text) from public, anon;
revoke execute on function public.get_accessible_frame_names() from public, anon;
revoke execute on function public.mark_assistant_tip_shown(integer) from public, anon;
revoke execute on function public.mark_grocery_item_probably_out(text,text) from public, anon;
revoke execute on function public.record_grocery_purchase(text,text,integer,text) from public, anon;
revoke execute on function public.record_grocery_purchase(text,text,numeric,text,uuid) from public, anon;
revoke execute on function public.rename_owned_frame(text,text) from public, anon;
revoke execute on function public.set_device_token(text) from public, anon;
revoke execute on function public.start_pairing(text) from public, anon;
revoke execute on function public.upsert_device_settings(text,jsonb) from public, anon;
