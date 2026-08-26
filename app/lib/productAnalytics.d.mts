export type ProductEvent = 'session_started'|'tab_opened'|'frame_preview_opened'|'assistant_opened'|'assistant_request_completed'|'assistant_request_needs_input'|'assistant_request_unsupported'|'assistant_request_error'|'reminder_created'|'grocery_item_added'|'recipe_created'|'recipe_added_to_groceries'|'dinner_plan_opened'|'surf_opened'|'custom_spot_started'|'custom_spot_completed'|'layout_selected'|'frame_update_requested'|'theme_changed'|'language_changed'|'connection_started'|'connection_completed'|'connection_failed'
export function trackProductEvent(input: { event: ProductEvent; surface?: string; source?: 'manual'|'assistant'; metadata?: Record<string, unknown> }): void
export function initializeProductAnalytics(): () => void
export function isProductEvent(value: unknown): value is ProductEvent
export function safeAnalyticsMetadata(value: unknown): Record<string, string|number|boolean>
export function getAnalyticsSession(storage: Storage, now?: number): { id: string; lastActive: number; started: boolean }
export const ANALYTICS_INACTIVITY_MS: number
