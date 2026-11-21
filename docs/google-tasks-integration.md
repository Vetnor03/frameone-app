# Google Tasks → RE:MIND Reminders (approval-gated)

Google Tasks uses the same Google OAuth web client and redirect URI already configured for Google Calendar: `https://re-mind.no/api/integrations/google-calendar/callback`. The two providers have **independent consent requests, cookies, encrypted refresh-token records, and disconnect operations**. Google Calendar continues requesting only its two previously configured read-only calendar scopes. No separate client ID, OAuth redirect, new database migration, or firmware module is needed.

## Before production approval

- Google Tasks API has been enabled in the existing Google Cloud project and `https://www.googleapis.com/auth/tasks.readonly` has been added to Data Access. This is a **sensitive scope awaiting approval**.
- By default, the Google Tasks Connect entry is **Under evaluation** and not connectable. Production OAuth requests for the new scope are blocked.
- For a controlled verification demo, set the server-only environment variable `GOOGLE_TASKS_TEST_USER_IDS` to a comma-separated list of specific Supabase Auth user UUIDs. Never add this to a `NEXT_PUBLIC_` variable. Redeploy the test/preview environment. Only listed users can start OAuth, sync tasks, and see Connect enabled.
- Keep `GOOGLE_TASKS_PUBLIC_ENABLED` unset/false. Set it to `true` **only after Google approves the new scope**. Existing Calendar consent flow is unchanged.

## Behavior and limitations

- Connect → Google Tasks → Google OAuth consent (Tasks **read-only** scope only) → server sync → Reminders source **Google Tasks** and connected frames.
- Google Tasks API provides task due **date** only, not the precise scheduled time. All dated tasks appear as **all-day** Reminders; do not infer or display a 00:00 or shifted clock time. Undated tasks are not projected into the date-based Reminders calendar.
- Completed and deleted tasks are excluded; completion/removal causes their cached items to disappear on the next sync. Use paginated reads and delta updates without unnecessary e-paper wakeups. Upstream errors preserve the last good cache.
- Existing `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`, and `INTEGRATION_CREDENTIALS_KEY` are reused. Tokens are encrypted in `user_integrations`; normalized task rows live in `integration_items`.
- OAuth is scoped to individual RE:MIND users and the displayed frame's saved integration selection. Test on a preview account first; switching Google permissions in the existing project's consent screen does not magically extend previous refresh tokens.

## Google verification

1. Prepare a deployed test version and authorize the test account using the new scope. Keep the normal production user population unaffected.
2. Google Cloud → Google Auth Platform → Verification Center (or Overview → Prepare for Verification) and submit the **added sensitive scope** for review. Provide the scope justification already entered in Data Access plus live privacy policy and terms links.
3. Record a short **end-to-end video**: sign into RE:MIND → Connect → Google Tasks → Google consent showing Tasks read-only permission → an example dated task in Google Tasks → task in RE:MIND Reminders with the Google Tasks filter → frame/Mirror View (if available) → disconnect.
4. Supply Google's reviewers with a working demo account and accessible login instructions. Respond to reviewer email requests.
5. When the scope is approved, enable `GOOGLE_TASKS_PUBLIC_ENABLED=true` and redeploy. Do not enable publicly before approval; unapproved scopes can trigger warnings for real users.

Run `node --test tests/google-tasks-integration.test.mjs` and the existing Google Calendar and integration catalogue regression tests. No change to Calendar's requested permissions is required.
