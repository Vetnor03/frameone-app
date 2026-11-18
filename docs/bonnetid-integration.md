# Bønnetid (IRN) — Experimental

Bønnetid appears **last among connectable integrations**, immediately before apps under evaluation. A user selects an official city from IRN's provider list and an explicit Asr shadow method (**1x or 2x**), and the connection is shared at account level. After connection, the button becomes **Disconnect**; **Change city** remains available.

Prayer times appear under a **Bønn / Prayer** source filter in Reminders, and as ordinary dated events on the physical frame when enabled for that frame. They are stored in `integration_items`, **not** in user-created `reminders` (the personal 20-item limit is unaffected). Only future times are displayed, with app time filtering updated at minute boundaries. Sunrise (IRN's `shuruq_sunrise`) is included when returned by the official API. Maghrib is used for sunset unless IRN returns a distinct sunset field. Disconnect removes every stored Bønnetid event.

## Deployment prerequisite

IRN's Zebra API requires a licensed `Api-Token`. Configure server-side `BONNETID_API_TOKEN` in the deployment environment **only after authorization from IRN**. Never expose it in `NEXT_PUBLIC_` variables, frontend assets, source control, screenshots or logs.

* Official API: https://api.bonnetid.no/
* City list: `GET /meta/locations/`
* Monthly timetable: `GET /meta/prayertimes/{location_id}/{year}/{month}/`
* Alternate monthly collection: `GET /prayertimes/{location_id}/{year}/{month}/` (the final segment on the detail endpoint is a record ID, not the day of month)

This integration intentionally **fails closed** when token is missing or data cannot be verified. It must not invent times, select a location automatically, or use a third-party prayer calculation with potentially different results. Connection only succeeds once official times have been fetched and stored.

Times are normalized as Norway-local wall clock and converted to instants using `Europe/Oslo` (DST-aware); the selected Asr method controls both the API query and which of the 1x / 2x fields is used. New connections require an explicit method selection; existing connections continue to default to the previous 2x behavior. Upstream responses are not yet validated against a licensed production account; confirm schema, method and rate limits with IRN before promoting from Experimental.

Server refresh is debounced to 12 hours and can be triggered by an active Reminders tab or deferred physical-frame refresh. The initial cache covers ten calendar days. No end-user credentials are requested.

The physical Reminders integration uses its existing hard reminder-time scheduler. Each prayer event at an exact minute prompts the next scheduled frame wake in both modes, without adding another polling loop. IRN names are retained verbatim and excluded from AI title rewriting.
