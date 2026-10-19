# Google Calendar → RE:MIND Connect

Google Calendar uses the existing Connect tab, encrypted user integrations, and Reminders feed. It does not add a frame firmware module. All shown (selected) calendars are imported, up to 20, for a 120-day horizon.

## Configuration required before pilot

1. Create a Google Cloud project, enable Google Calendar API, and configure Google Auth Platform / OAuth consent screen.
2. Create an OAuth client of type Web application. Add the exact authorized redirect URI: https://re-mind.no/api/integrations/google-calendar/callback . If your pilot runs on another domain, use a separate OAuth client with an exact matching redirect URI.
3. Configure three server-side Vercel environment variables for production:
   - GOOGLE_CALENDAR_CLIENT_ID
   - GOOGLE_CALENDAR_CLIENT_SECRET
   - GOOGLE_CALENDAR_REDIRECT_URI=https://re-mind.no/api/integrations/google-calendar/callback
   Do not set these as NEXT_PUBLIC variables. Reuse the existing INTEGRATION_CREDENTIALS_KEY for AES-256-GCM token encryption.
4. While the consent screen is in Testing mode, add pilot testers as authorized test users. Google may expire testing-mode refresh tokens after seven days; public release may require OAuth verification for Calendar data.
5. Redeploy after setting Vercel variables, then test Connect → Google Calendar → authorize → return to Connect → Reminders source → frame rendering → disconnect.
6. After enabling the integration on a frame, request a normal frame update. No ESP32 firmware flash is necessary.

## Scope and behavior

- Read-only OAuth scope: https://www.googleapis.com/auth/calendar.readonly
- Authorization code flow with PKCE S256, authenticated POST, encrypted time-bound state and short-lived HttpOnly SameSite=Lax nonce/verifier cookie.
- Refresh token stored encrypted in public.user_integrations; event cache in public.integration_items.
- Imports visible Google calendars, recurring event instances, all-day events and paginated results.
- Delta-based database updates avoid waking frames for unchanged events.
- Stale-gated background refresh; cached data stays available if Google is temporarily unavailable.
- Disconnect removes stored tokens and events from RE:MIND. Permissions may additionally be revoked in Google Account settings; Google OAuth token revocation is not currently called.

## Planned follow-ups

- User-selectable individual calendars (currently uses calendars selected for display in Google).
- Faster webhook notifications, account health telemetry and additional QA before a broader rollout.
