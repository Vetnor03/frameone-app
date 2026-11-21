# Calendar Link (ICS/webcal) — pilot implementation

RE:MIND Connect → **Calendar Link** lets a user select Apple/iCloud, Outlook,
Hoopit, or Other, open the provider's official instructions, paste a calendar
subscription URL, and tap Connect. The server checks and imports events before\nshowing Connected. Up to five feeds
per account are supported. Events go into the existing Reminders source
filter and physical frame; no new frame module.

## Setup
- No new provider OAuth credentials needed. Uses existing Supabase
  `user_integrations`, `integration_items`, and
  `INTEGRATION_CREDENTIALS_KEY` (or existing legacy fallback).
- Compatible with `webcal://`, `webcals://`, and HTTPS URLs pointing
  to an iCalendar VCALENDAR resource.
- Apple/iCloud **Public Calendar** links are publicly readable to anybody
  holding the URL. Do not recommend for sensitive private calendars.
- No Apple login, app-specific password, URL extraction, or scraping.

## Security and limitations
- Private subscription tokens are encrypted in `user_integrations`; APIs
  expose labels and opaque feed IDs only, never the URL.
- SSRF: HTTPS only, no credentials, custom ports, fragments, literal IP
  hosts, or internal/reserved DNS answers. The actual socket uses the same
  validated public IPv4 address (no check/use DNS rebinding). Redirect
  hops are validated independently. No IPv6-only hosts in the pilot.
- 8-second per-hop request timeout, 1 MiB response cap, up to three redirects,
  5 feeds/user, 1600 upcoming events/feed, 5000 cached events/user, and
  bounded recurrence iteration. Failed sync preserves the last good cache.
- `ical.js` handles RFC5545 RRULE/RDATE/EXDATE and RECURRENCE-ID overrides,
  with iCloud VTIMEZONE and IANA TZID fallback. Import horizon:
  past day + 120 days. All-day dates remain dates.
- Periodic sync is stale-based (30 minutes) and delta-only to avoid
  unnecessary e-paper wakeups. Opening Reminders triggers sync if stale;
  frame fetch schedules a refresh **after** returning cached content.
- Google, Teams, Todoist and other integration tokens remain untouched.
- Calendar details stay out of external AI title optimization.
- A subscription is read-only; an ordinary single-event `.ics` download
  will not update automatically at the source.

## Verification
`npm ci && npm run typecheck && npm test && npm run build`
- Test with an Apple public link, Outlook published ICS, Hoopit subscription,
  and multi-calendar account; open Reminders and validate frame updates.
- Test recurring exceptions / cancellation / DST, no-op sync, remove one
  feed, remove last feed, invalid URL, private IP and redirect attempts.
- Check Connect ordering and both Norwegian/English copy, onboarding and
  loaded frame settings before production rollout.
- Do not declare external provider subscriptions functional until a real
  authenticated tester validates the feed URLs and Vercel deployment.
