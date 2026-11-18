# Bønnetid (IRN) — Experimental

Bønnetid appears **last among connectable integrations**, immediately before apps under evaluation. A user selects an official city from IRN's provider list, and the connection is shared at account level. After connection, the button becomes **Disconnect**; **Change city** remains available.

Prayer times appear under a **Bønn / Prayer** source filter in Reminders, and as ordinary dated events on the physical frame when enabled for that frame. They are stored in `integration_items`, **not** in user-created `reminders` (the personal 20-item limit is unaffected). Only future times are displayed, and disconnect removes every stored Bønnetid event.

## Deployment prerequisite

IRN's Zebra API requires a licensed `Api-Token`. Configure server-side `BONNETID_API_TOKEN` in the deployment environment **only after authorization from IRN**. Never expose it in `NEXT_PUBLIC_` variables, frontend assets, source control, screenshots or logs.

* Official API: https://api.bonnetid.no/
* City list: `GET /meta/locations/`
* Monthly timetable: `GET /meta/prayertimes/{location_id}/{year}/{month}/`
* Daily fallback: `GET /prayertimes/{location_id}/{year}/{month}/{day}/?asr=2`

This integration intentionally **fails closed** when token is missing or data cannot be verified. It must not invent times, select a location automatically, or use a third-party prayer calculation with potentially different results. Connection only succeeds once official times have been fetched and stored.

Times are normalized as Norway-local wall clock and converted to instants using `Europe/Oslo` (DST-aware); the default Asr selection is the 2× shadow field where supplied. Upstream responses are not yet validated against a licensed production account; confirm schema, method and rate limits with IRN before promoting from Experimental.

Server refresh is debounced to 12 hours and can be triggered by an active Reminders tab or deferred physical-frame refresh. The initial cache covers ten calendar days. No end-user credentials are requested.
