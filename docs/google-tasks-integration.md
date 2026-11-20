# Google Tasks → RE:MIND Connect

Google Tasks is a read-only Connect integration. Tasks with due dates appear in the existing **Reminders** page, under the **Google Tasks** source filter, and on frames that have enabled Google Tasks. Undated and completed tasks do not appear. Existing Reminders functionality is unchanged.

## One-time production setup

1. In the Google Cloud project used by RE:MIND, **enable Google Tasks API**.
2. Add the read-only scope `https://www.googleapis.com/auth/tasks.readonly` to Google Auth Platform → Data Access. Review verification requirements and list pilot users as test users if the OAuth app is still in Testing.
3. For the OAuth web client, add **https://re-mind.no/api/integrations/google-tasks/callback** as an authorized redirect URI.
4. Set server-only Vercel environment variable `GOOGLE_TASKS_REDIRECT_URI=https://re-mind.no/api/integrations/google-tasks/callback`. The integration reuses `GOOGLE_CALENDAR_CLIENT_ID` and `GOOGLE_CALENDAR_CLIENT_SECRET` by default, or can use `GOOGLE_TASKS_CLIENT_ID` and `GOOGLE_TASKS_CLIENT_SECRET` for an independent client. It also uses `INTEGRATION_CREDENTIALS_KEY` for encrypted tokens. Do not use `NEXT_PUBLIC_` for secrets.
5. Redeploy and test Connect → Google Tasks → consent → Reminders source → physical frame → disconnect. No firmware change is needed.

## Data handling

- OAuth authorization code + PKCE S256; time-bound encrypted state with one-time browser nonce, isolated callback cookie.
- Request only `tasks.readonly`, not calendar or write scopes.
- Fetch task lists and their task pages from Google API; excludes completed/deleted tasks.
- Due dates are date-only in Google Tasks API. They are displayed as all-day reminders, not with an artificial 00:00 or UTC time. Undated tasks are omitted because the calendar/reminder display requires a date.
- Token storage is encrypted; cached task records are reconciled using changed-item deltas to avoid unnecessary frame wakeups.
- Initial sync on connect; refresh at most once every 15 minutes per user (unless token recovery is needed), and asynchronously for frames.
- Disconnect removes connection credentials and Google Tasks cached records from RE:MIND; it does not delete Google Tasks at Google.
- External API errors do not wipe the last successful task snapshot.

Google OAuth clients in Testing mode can issue short-lived (e.g., seven-day) refresh tokens. Additional Google verification may be necessary before broad access.
