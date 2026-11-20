# Todoist → RE:MIND Reminders (read-only)

## Status
Implementation in a feature branch. Requires Todoist OAuth application credentials before live login can be tested. Uses Todoist **unified API v1** (not retired /rest/v2 or /sync/v9).

The existing Reminders module displays dated Todoist tasks. Todoist is a **Connect** provider, not a separate module. The provider is marked **Experimental** while piloting.

## Setup (server only)
1. Create a Todoist OAuth integration in the [Todoist App Management Console](https://app.todoist.com/app/settings/integrations/developer) with read-only permissions.
2. Register one exact redirect URI for each environment (separate credentials recommended):
   - `https://re-mind.no/api/integrations/todoist/callback` for production, if this is the actual app origin
   - `https://<actual-staging-domain>/api/integrations/todoist/callback` for staging
3. Configure secret server environment variables for the applicable Vercel environment:
   - `TODOIST_CLIENT_ID`
   - `TODOIST_CLIENT_SECRET`
   - `TODOIST_REDIRECT_URI` (exact registered callback)
   - Reuse existing `INTEGRATION_CREDENTIALS_KEY`
4. Redeploy. Use Connect → Todoist and grant `data:read`; verify status and Reminders on a pilot account. Do not expose secrets in `NEXT_PUBLIC_*` variables.

## Behavior
- Every consenting account authorizes Todoist via OAuth with browser-bound 15-minute encrypted state; tokens are stored encrypted server-side.
- Active tasks are loaded from `GET https://api.todoist.com/api/v1/tasks` using bounded cursor pagination. Only tasks that actually have a due date/time become reminders. Undated tasks are **not assigned artificial dates**.
- Completed/deleted tasks disappear at the next successful sync. Recurring tasks follow Todoist's new due date. RE:MIND never edits, completes or deletes a Todoist task.
- Date-only tasks are all-day reminders and retain their Todoist date across time zones; time-specific tasks retain their actual time. A timed task does not disappear merely because its due minute passed.
- Only a frame that opted in to the Todoist integration fetches it for the physical display; source filtering is available in the Reminders app.
- Server synchronization is limited to stale connections (15-minute TTL), with failed provider calls returning cached data where possible. Integration deltas avoid unnecessary frame refreshes. No direct calls from frames to Todoist.
- Disconnect revokes the Todoist access token best-effort, clears local credentials and cache, and disables Todoist on the selected frame.

## Known constraints and acceptance
- Read-only MVP: no Groceries mapping, no local completion button, no selection of Todoist projects, and no displaying undated tasks.
- No real Todoist account consent has been tested in this branch, so do not claim the OAuth flow has been verified end-to-end.
- Manual acceptance: sign in → authorise → returned Connect status → source filter present → dated task displayed in the app and on an opted-in frame → complete task in Todoist → refresh and verify removal → disconnect and verify local data removed → reconnect.
- Verify refresh token rotation for a newly registered Todoist client, and note the read permission.
- Use client-side availability status to show setup pending until Todoist credentials are configured.

API: https://developer.todoist.com/api/v1/
