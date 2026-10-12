# RE:MIND Events V2 – nationwide pilot

## State

This is a feature branch / draft PR. Do not merge into production until source credentials,
data shape and integration tests are confirmed.

### Available foundation
- Kartverket Stedsnavn API for nationwide place search (no app secret needed).
- Search preferences persist latitude, longitude, Kartverket SSR ID, place label and radius (10/25/50/100 km).
- Ticketmaster Discovery API source adapter, server-side, up to 90-day horizon.
- Frame-integration items continue to use the legacy provider identifier `edge-of-norway` internally only for compatibility with existing app/frame filtering. Upstream HTML scraping is disabled on this branch.
- Event URL is available as a tickets/info link in app calendar.
- Cache requests on 6-hour windows; 429 backoff (6 hours); keep old cached events when fetch fails.
- Source normalization and deduplication groundwork for other providers.

### Source status

| Source | Status | Prerequisite |
|---|---|---|
| Ticketmaster | Implemented in code, not activated | Ticketmaster developer API key |
| Tikkio Public Discovery API | Planned, not implemented | Official API endpoint docs and access details |
| Billetto Public Event Search | Planned, not implemented | API key pair/authorization; verify payload/terms |
| Friskus | Planned, not implemented | Confirmed public RSS URLs per participating locality, location metadata |
| TicketCo | Planned, not implemented | Provider agreement / organizer data access |

Do not imply that all providers are live or that Ticketmaster covers *every* Norwegian event.

### User steps to turn on Ticketmaster
1. Visit https://developer.ticketmaster.com/ and register a developer account.
2. Copy the default app's **Consumer Key** (Ticketmaster Discovery API key).
3. Add a **sensitive/secret** production (or isolated preview first) environment variable:
   `TICKETMASTER_DISCOVERY_API_KEY`.
4. Deploy the preview again to load the new environment variable. Keep the key out of GitHub and chat.
5. Test an actual local source import, click through tickets/info and inspect Supabase items and calendar/frame results.
6. Once validated, merge PR and deploy.

### Test commands
```sh
npm run typecheck
node --test tests/nationwide-events.test.mjs tests/local-events-places.test.mjs tests/local-events-connect-resilience.test.mjs
node scripts/events-kartverket-smoke.mjs
```

The repository-wide full test suite has pre-existing failures; use the project stable gate separately.

### Operational caveats
- Scheduled production sync is already configured via `/api/cron/waste-sync` (daily Vercel cron), which calls the Events synchronizer too.
- Currently the synchronizer fetches once per connected frame, though stable Next.js caching shares identical location/radius/time-bucket requests; central national cache/registry is a future scalability improvement.
- Do not treat a saved connection as successful if its `syncPending` / `syncError` indicates upstream failure.
- Respect Ticketmaster's rate limits, linking policy and commercial-use terms.
- No firmware flash required for app/backend-only changes.
