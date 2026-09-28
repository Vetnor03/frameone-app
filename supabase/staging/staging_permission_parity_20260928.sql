-- Staging ONLY. Generated from read-only production catalog effective grants on 2026-09-28.
-- Reconciles copied schema ACLs; does not include customer data or device secrets.
-- DO NOT apply automatically to production. Production's grants are only the reference.
-- The old default privileges still require a separate reviewed hardening strategy.

REVOKE ALL ON FUNCTION public.ai_monitoring_subscription_enabled(p_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_monitoring_subscription_enabled(p_user_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.ensure_device_token(p_device_id text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_device_token(p_device_id text) TO service_role;

REVOKE ALL ON FUNCTION public.enqueue_due_monitoring_watches(max_count integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_due_monitoring_watches(max_count integer) TO service_role;

REVOKE ALL ON FUNCTION public.register_monitoring_watch_sources(p_watch_id uuid, p_discovered jsonb, p_selected jsonb, p_original_request text, p_max_active integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_monitoring_watch_sources(p_watch_id uuid, p_discovered jsonb, p_selected jsonb, p_original_request text, p_max_active integer) TO service_role;

REVOKE ALL ON FUNCTION public.normalize_monitoring_source_url(p_url text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_monitoring_source_url(p_url text) TO service_role;

REVOKE ALL ON FUNCTION public.claim_monitoring_queue(max_count integer, worker_id text, stale_after_minutes integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_monitoring_queue(max_count integer, worker_id text, stale_after_minutes integer) TO service_role;

REVOKE ALL ON FUNCTION public.prune_monitoring_runs(retention_days integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_monitoring_runs(retention_days integer) TO service_role;

REVOKE ALL ON FUNCTION public.temp_refresh_audit_cleanup() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.temp_refresh_audit_cleanup() TO service_role;

REVOKE ALL ON FUNCTION public.ai_assistant_clean_request(input text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_assistant_clean_request(input text) TO service_role;

REVOKE ALL ON FUNCTION public.ai_assistant_title(input text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_assistant_title(input text) TO service_role;

REVOKE ALL ON FUNCTION public.mark_assistant_tip_shown(p_tip integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_assistant_tip_shown(p_tip integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_assistant_tip_shown(p_tip integer) TO service_role;

REVOKE ALL ON FUNCTION public.record_product_analytics_event(p_event_name text, p_session_id text, p_client_id text, p_frame_device_id text, p_surface text, p_source text, p_metadata jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_product_analytics_event(p_event_name text, p_session_id text, p_client_id text, p_frame_device_id text, p_surface text, p_source text, p_metadata jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_product_analytics_event(p_event_name text, p_session_id text, p_client_id text, p_frame_device_id text, p_surface text, p_source text, p_metadata jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.mark_grocery_item_probably_out(device_id text, item_name text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_grocery_item_probably_out(device_id text, item_name text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_grocery_item_probably_out(device_id text, item_name text) TO service_role;

REVOKE ALL ON FUNCTION public.enqueue_due_monitoring_source_probes(max_count integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_due_monitoring_source_probes(max_count integer) TO service_role;

REVOKE ALL ON FUNCTION public.is_stable_grounded_detail(s monitoring_watch_sources) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_stable_grounded_detail(s monitoring_watch_sources) TO service_role;

REVOKE ALL ON FUNCTION public.is_guarded_strong_source(s monitoring_watch_sources) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_guarded_strong_source(s monitoring_watch_sources) TO service_role;

REVOKE ALL ON FUNCTION public.generate_pair_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_pair_code() TO service_role;

REVOKE ALL ON FUNCTION public.hash_device_token(p_token text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hash_device_token(p_token text) TO anon;
GRANT EXECUTE ON FUNCTION public.hash_device_token(p_token text) TO service_role;

REVOKE ALL ON FUNCTION public.get_monitoring_watch_schedule_eligibility(p_watch_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_monitoring_watch_schedule_eligibility(p_watch_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.infer_monitoring_country_code(p_request text, p_structured jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.infer_monitoring_country_code(p_request text, p_structured jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.enqueue_ai_assistant_interpretation(p_watch_id uuid, p_owner_user_id uuid, p_request_snapshot text, p_run_after timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_ai_assistant_interpretation(p_watch_id uuid, p_owner_user_id uuid, p_request_snapshot text, p_run_after timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.claim_ai_assistant_interpretation_queue(max_count integer, worker_id text, stale_after_minutes integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ai_assistant_interpretation_queue(max_count integer, worker_id text, stale_after_minutes integer) TO service_role;

REVOKE ALL ON FUNCTION public.monitoring_source_geography_relevance(p_url text, p_domain text, p_country_code text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.monitoring_source_geography_relevance(p_url text, p_domain text, p_country_code text) TO service_role;

REVOKE ALL ON FUNCTION public.apply_ai_assistant_interpretation(p_watch_id uuid, p_owner_user_id uuid, p_request_snapshot text, p_title text, p_normalized_goal text, p_trigger_description text, p_search_guidance jsonb, p_frequency_minutes integer, p_completion_condition text, p_preferred_language text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_ai_assistant_interpretation(p_watch_id uuid, p_owner_user_id uuid, p_request_snapshot text, p_title text, p_normalized_goal text, p_trigger_description text, p_search_guidance jsonb, p_frequency_minutes integer, p_completion_condition text, p_preferred_language text) TO service_role;

REVOKE ALL ON FUNCTION public.reserve_paid_monitoring_run(p_watch_id uuid, p_provider text, p_model text, p_default_daily_limit integer, p_default_monthly_limit integer, p_global_daily_limit integer, p_global_monthly_limit integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_paid_monitoring_run(p_watch_id uuid, p_provider text, p_model text, p_default_daily_limit integer, p_default_monthly_limit integer, p_global_daily_limit integer, p_global_monthly_limit integer) TO service_role;

REVOKE ALL ON FUNCTION public.touch_monitoring_watch_checked_at(p_watch_id uuid, p_checked_at timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_monitoring_watch_checked_at(p_watch_id uuid, p_checked_at timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.claim_pair_code(p_code text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pair_code(p_code text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pair_code(p_code text) TO service_role;

REVOKE ALL ON FUNCTION public.get_frame_config(p_device_id text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_frame_config(p_device_id text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_frame_config(p_device_id text) TO service_role;

REVOKE ALL ON FUNCTION public.set_device_token(p_device_id text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_device_token(p_device_id text) TO service_role;

REVOKE ALL ON FUNCTION public.upsert_device_settings(p_device_id text, p_settings jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_device_settings(p_device_id text, p_settings jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_device_settings(p_device_id text, p_settings jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.get_monitoring_paid_usage(p_owner_user_id uuid, p_default_daily_limit integer, p_default_monthly_limit integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_monitoring_paid_usage(p_owner_user_id uuid, p_default_daily_limit integer, p_default_monthly_limit integer) TO service_role;

REVOKE ALL ON FUNCTION public.queue_monitoring_update_push(p_monitoring_update_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_monitoring_update_push(p_monitoring_update_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.set_ai_assistant_watch_frame_visibility(p_watch_id uuid, p_frame_id text, p_show_on_frame boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_ai_assistant_watch_frame_visibility(p_watch_id uuid, p_frame_id text, p_show_on_frame boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_ai_assistant_watch_frame_visibility(p_watch_id uuid, p_frame_id text, p_show_on_frame boolean) TO service_role;

REVOKE ALL ON FUNCTION public.service_unregister_push_subscription(p_user_id uuid, p_endpoint text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_unregister_push_subscription(p_user_id uuid, p_endpoint text) TO service_role;

REVOKE ALL ON FUNCTION public.verify_device_auth(p_device_id text, p_device_token text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_device_auth(p_device_id text, p_device_token text) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_device_auth(p_device_id text, p_device_token text) TO service_role;

REVOKE ALL ON FUNCTION public.pause_ai_assistant_watch(p_watch_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pause_ai_assistant_watch(p_watch_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pause_ai_assistant_watch(p_watch_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_ai_subscription_entitlements(p_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_subscription_entitlements(p_user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_subscription_entitlements(p_user_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.claim_monitoring_source_probe_queue(max_count integer, worker_id uuid, stale_after_minutes integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_monitoring_source_probe_queue(max_count integer, worker_id uuid, stale_after_minutes integer) TO service_role;

REVOKE ALL ON FUNCTION public.prune_monitoring_source_probes(retention_days integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_monitoring_source_probes(retention_days integer) TO service_role;

REVOKE ALL ON FUNCTION public.enqueue_due_guarded_monitoring_watches(max_count integer, p_allowlisted_owners uuid[], p_discovery_hours integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_due_guarded_monitoring_watches(max_count integer, p_allowlisted_owners uuid[], p_discovery_hours integer) TO service_role;

REVOKE ALL ON FUNCTION public.record_guarded_source_change(p_watch_id uuid, p_source_id uuid, p_probe_id uuid, p_reason text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_guarded_source_change(p_watch_id uuid, p_source_id uuid, p_probe_id uuid, p_reason text) TO service_role;

REVOKE ALL ON FUNCTION public.enqueue_monitoring_safety_fallback(p_watch_id uuid, p_source_id uuid, p_probe_id uuid, p_reason text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_monitoring_safety_fallback(p_watch_id uuid, p_source_id uuid, p_probe_id uuid, p_reason text) TO service_role;

REVOKE ALL ON FUNCTION public.consume_monitoring_source_signal(p_watch_id uuid, p_run_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_monitoring_source_signal(p_watch_id uuid, p_run_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.monitoring_country_intent(p_request text, p_structured jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.monitoring_country_intent(p_request text, p_structured jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.monitoring_source_objects(p_urls jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.monitoring_source_objects(p_urls jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.heartbeat_device_app_activity(p_device_id text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_device_app_activity(p_device_id text) TO service_role;

REVOKE ALL ON FUNCTION public.ack_device_display_revision(p_device_id text, p_displayed_revision bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ack_device_display_revision(p_device_id text, p_displayed_revision bigint) TO service_role;

REVOKE ALL ON FUNCTION public.preview_ai_subscription_plan(p_plan text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.preview_ai_subscription_plan(p_plan text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_ai_subscription_plan(p_plan text) TO service_role;

REVOKE ALL ON FUNCTION public.service_register_push_subscription(p_user_id uuid, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_register_push_subscription(p_user_id uuid, p_endpoint text, p_p256dh text, p_auth text, p_user_agent text) TO service_role;

REVOKE ALL ON FUNCTION public.claim_monitoring_update_push_deliveries(p_monitoring_update_id uuid, max_count integer, max_attempts integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_monitoring_update_push_deliveries(p_monitoring_update_id uuid, max_count integer, max_attempts integer) TO service_role;

REVOKE ALL ON FUNCTION public.get_guarded_watch_decision(p_watch_id uuid, p_owner_allowlisted boolean, p_discovery_hours integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_guarded_watch_decision(p_watch_id uuid, p_owner_allowlisted boolean, p_discovery_hours integer) TO service_role;

REVOKE ALL ON FUNCTION public.complete_monitoring_openai_call(p_call_id uuid, p_status text, p_usage jsonb, p_error_message text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_monitoring_openai_call(p_call_id uuid, p_status text, p_usage jsonb, p_error_message text) TO service_role;

REVOKE ALL ON FUNCTION public.create_ai_assistant_watch(p_original_request text, p_frame_id text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_ai_assistant_watch(p_original_request text, p_frame_id text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_ai_assistant_watch(p_original_request text, p_frame_id text) TO service_role;

REVOKE ALL ON FUNCTION public.set_ai_assistant_watch_instant(p_watch_id uuid, p_is_instant boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_ai_assistant_watch_instant(p_watch_id uuid, p_is_instant boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_ai_assistant_watch_instant(p_watch_id uuid, p_is_instant boolean) TO service_role;

REVOKE ALL ON FUNCTION public.is_monitoring_source_geographically_relevant(s monitoring_watch_sources, w monitoring_watches) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_monitoring_source_geographically_relevant(s monitoring_watch_sources, w monitoring_watches) TO service_role;

REVOKE ALL ON FUNCTION public.rerank_monitoring_watch_sources(p_watch_id uuid, p_max_active integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rerank_monitoring_watch_sources(p_watch_id uuid, p_max_active integer) TO service_role;

REVOKE ALL ON FUNCTION public.backfill_monitoring_watch_sources(p_watch_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_monitoring_watch_sources(p_watch_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.claim_monitoring_shared_run(p_canonical_search_id uuid, p_provider text, p_model text, p_cache_max_age_minutes integer, p_stale_after_minutes integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_monitoring_shared_run(p_canonical_search_id uuid, p_provider text, p_model text, p_cache_max_age_minutes integer, p_stale_after_minutes integer) TO service_role;

REVOKE ALL ON FUNCTION public.complete_monitoring_shared_run(p_shared_run_id uuid, p_status text, p_result jsonb, p_response_id text, p_raw_result jsonb, p_usage jsonb, p_error_message text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_monitoring_shared_run(p_shared_run_id uuid, p_status text, p_result jsonb, p_response_id text, p_raw_result jsonb, p_usage jsonb, p_error_message text) TO service_role;

REVOKE ALL ON FUNCTION public.renormalize_monitoring_watch_sources(p_watch_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renormalize_monitoring_watch_sources(p_watch_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.refresh_monitoring_canonical_active_count(p_canonical_search_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_monitoring_canonical_active_count(p_canonical_search_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.update_ai_assistant_watch_request(p_watch_id uuid, p_original_request text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_ai_assistant_watch_request(p_watch_id uuid, p_original_request text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_ai_assistant_watch_request(p_watch_id uuid, p_original_request text) TO service_role;

REVOKE ALL ON FUNCTION public.resume_ai_assistant_watch(p_watch_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resume_ai_assistant_watch(p_watch_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_ai_assistant_watch(p_watch_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.delete_ai_assistant_watch(p_watch_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_ai_assistant_watch(p_watch_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_ai_assistant_watch(p_watch_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.start_pairing(p_device_id text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_pairing(p_device_id text) TO service_role;

REVOKE ALL ON FUNCTION public.reserve_monitoring_openai_call(p_watch_id uuid, p_call_type text, p_model text, p_charge_user boolean, p_default_daily_limit integer, p_default_monthly_limit integer, p_global_daily_limit integer, p_global_monthly_limit integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_monitoring_openai_call(p_watch_id uuid, p_call_type text, p_model text, p_charge_user boolean, p_default_daily_limit integer, p_default_monthly_limit integer, p_global_daily_limit integer, p_global_monthly_limit integer) TO service_role;

REVOKE ALL ON FUNCTION public.apply_ai_assistant_interpretation(p_watch_id uuid, p_owner_user_id uuid, p_request_snapshot text, p_title text, p_normalized_goal text, p_trigger_description text, p_search_guidance jsonb, p_frequency_minutes integer, p_completion_condition text, p_preferred_language text, p_monitoring_class text, p_urgent_until timestamp with time zone, p_canonical_key text, p_canonical_intent jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_ai_assistant_interpretation(p_watch_id uuid, p_owner_user_id uuid, p_request_snapshot text, p_title text, p_normalized_goal text, p_trigger_description text, p_search_guidance jsonb, p_frequency_minutes integer, p_completion_condition text, p_preferred_language text, p_monitoring_class text, p_urgent_until timestamp with time zone, p_canonical_key text, p_canonical_intent jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.ensure_monitoring_canonical_search(p_canonical_key text, p_canonical_intent jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_monitoring_canonical_search(p_canonical_key text, p_canonical_intent jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.request_device_display_revision(p_device_id text, p_request_id text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_device_display_revision(p_device_id text, p_request_id text) TO service_role;

REVOKE ALL ON FUNCTION public.add_grocery_items_canonical(p_device_id text, p_items jsonb, p_request_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.add_grocery_items_canonical(p_device_id text, p_items jsonb, p_request_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_grocery_items_canonical(p_device_id text, p_items jsonb, p_request_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.consume_assistant_request(p_kind text, p_limit integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_assistant_request(p_kind text, p_limit integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consume_assistant_request(p_kind text, p_limit integer) TO service_role;

REVOKE ALL ON FUNCTION public.get_accessible_frame_names() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_accessible_frame_names() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_accessible_frame_names() TO service_role;

REVOKE ALL ON FUNCTION public.rename_owned_frame(p_device_id text, p_display_name text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rename_owned_frame(p_device_id text, p_display_name text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rename_owned_frame(p_device_id text, p_display_name text) TO service_role;

REVOKE ALL ON FUNCTION public.complete_initial_device_onboarding(p_device_id text, p_settings jsonb, p_starter_reminders jsonb, p_starter_countdowns jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_initial_device_onboarding(p_device_id text, p_settings jsonb, p_starter_reminders jsonb, p_starter_countdowns jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_initial_device_onboarding(p_device_id text, p_settings jsonb, p_starter_reminders jsonb, p_starter_countdowns jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.bump_frame_content_revision(p_device_id text, p_modules text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_frame_content_revision(p_device_id text, p_modules text[]) TO service_role;

REVOKE ALL ON FUNCTION public.bump_direct_frame_content() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_direct_frame_content() TO service_role;

REVOKE ALL ON FUNCTION public.bump_integration_frame_content() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_integration_frame_content() TO service_role;

REVOKE ALL ON FUNCTION public.bump_user_surf_frame_content() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_user_surf_frame_content() TO service_role;

REVOKE ALL ON FUNCTION public.reserve_openai_background_call(p_feature text, p_model text, p_daily_limit integer, p_monthly_limit integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_openai_background_call(p_feature text, p_model text, p_daily_limit integer, p_monthly_limit integer) TO service_role;

REVOKE ALL ON FUNCTION public.record_grocery_purchase(device_id text, item_name text, qty integer, category text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_grocery_purchase(device_id text, item_name text, qty integer, category text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_grocery_purchase(device_id text, item_name text, qty integer, category text) TO service_role;

REVOKE ALL ON FUNCTION public.create_member_pair_code(p_device_id text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_member_pair_code(p_device_id text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_member_pair_code(p_device_id text) TO service_role;

REVOKE ALL ON FUNCTION public.device_pair_status(p_device_id text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.device_pair_status(p_device_id text) TO service_role;

REVOKE ALL ON FUNCTION public.record_grocery_purchase(p_device_id text, p_item_name text, p_qty numeric, p_category text, p_completed_by uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_grocery_purchase(p_device_id text, p_item_name text, p_qty numeric, p_category text, p_completed_by uuid) TO service_role;

REVOKE ALL ON TABLE public.ai_subscription_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.ai_subscription_accounts TO service_role;

REVOKE ALL ON TABLE public.product_analytics_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.product_analytics_events TO service_role;

REVOKE ALL ON TABLE public.assistant_capability_gaps FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.assistant_capability_gaps TO service_role;

REVOKE ALL ON TABLE public.device_members FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.device_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.device_members TO service_role;

REVOKE ALL ON TABLE public.temp_refresh_audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.temp_refresh_audit_logs TO service_role;

REVOKE ALL ON TABLE public.ai_assistant_interpretation_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.ai_assistant_interpretation_queue TO service_role;

REVOKE ALL ON TABLE public.grocery_running_low FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.grocery_running_low TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.grocery_running_low TO service_role;

REVOKE ALL ON TABLE public.grocery_recipe_suggestions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.grocery_recipe_suggestions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.grocery_recipe_suggestions TO service_role;

REVOKE ALL ON TABLE public.monitoring_source_probe_queue FROM PUBLIC, anon, authenticated;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.monitoring_source_probe_queue TO anon;
GRANT TRUNCATE, REFERENCES, TRIGGER ON TABLE public.monitoring_source_probe_queue TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.monitoring_source_probe_queue TO service_role;

REVOKE ALL ON TABLE public.monitoring_source_change_signals FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.monitoring_source_change_signals TO service_role;

REVOKE ALL ON TABLE public.monitoring_source_probes FROM PUBLIC, anon, authenticated;
GRANT SELECT, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.monitoring_source_probes TO anon;
GRANT SELECT, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.monitoring_source_probes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.monitoring_source_probes TO service_role;

REVOKE ALL ON TABLE public.assistant_pending_actions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.assistant_pending_actions TO service_role;

REVOKE ALL ON TABLE public.frame_content_title_cache FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.frame_content_title_cache TO service_role;

REVOKE ALL ON TABLE public.monitoring_two_stage_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.monitoring_two_stage_audit TO service_role;

REVOKE ALL ON TABLE public.monitoring_updates FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.monitoring_updates TO anon;
GRANT SELECT, INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.monitoring_updates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.monitoring_updates TO service_role;

REVOKE ALL ON TABLE public.assistant_request_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.assistant_request_limits TO service_role;

REVOKE ALL ON TABLE public.device_update_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.device_update_state TO service_role;

REVOKE ALL ON TABLE public.grocery_add_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.grocery_add_requests TO service_role;

REVOKE ALL ON TABLE public.monitoring_usage_limits FROM PUBLIC, anon, authenticated;
GRANT SELECT, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.monitoring_usage_limits TO anon;
GRANT SELECT, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.monitoring_usage_limits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.monitoring_usage_limits TO service_role;

REVOKE ALL ON TABLE public.monitoring_watch_sources FROM PUBLIC, anon, authenticated;
GRANT SELECT, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.monitoring_watch_sources TO anon;
GRANT SELECT, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.monitoring_watch_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.monitoring_watch_sources TO service_role;

REVOKE ALL ON TABLE public.monitoring_openai_calls FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.monitoring_openai_calls TO service_role;

REVOKE ALL ON TABLE public.monitoring_watches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.monitoring_watches TO anon;
GRANT SELECT, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.monitoring_watches TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.monitoring_watches TO service_role;

REVOKE ALL ON TABLE public.monitoring_canonical_searches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.monitoring_canonical_searches TO service_role;

REVOKE ALL ON TABLE public.monitoring_shared_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.monitoring_shared_runs TO service_role;

REVOKE ALL ON TABLE public.user_onboarding_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.user_onboarding_state TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.user_onboarding_state TO service_role;

REVOKE ALL ON TABLE public.openai_usage_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.openai_usage_events TO service_role;

REVOKE ALL ON TABLE public.newsletter_subscribers FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.newsletter_subscribers TO service_role;

REVOKE ALL ON TABLE public.shop_frame_interest FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.shop_frame_interest TO service_role;

REVOKE ALL ON TABLE public.frame_content_revisions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.frame_content_revisions TO service_role;

REVOKE ALL ON TABLE public.frame_content_revision_changes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.frame_content_revision_changes TO service_role;

REVOKE ALL ON TABLE public.weather_ai_insight_cache FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.weather_ai_insight_cache TO service_role;

REVOKE ALL ON TABLE public.pilot_orders FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.pilot_orders TO service_role;

REVOKE ALL ON TABLE public.device_update_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.device_update_requests TO service_role;

REVOKE ALL ON TABLE public.surf_frame_result_cache FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.surf_frame_result_cache TO service_role;
