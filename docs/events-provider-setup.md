# RE:MIND Events V2 — provider setup

The Events calendar aggregates provider events within the user's chosen location/radius. Ticketmaster is active. Four additional adapters are available only when real provider endpoints and any necessary permissions have been configured. An adapter existing in the source code does NOT make its provider active.

## Sources

- Ticketmaster: TICKETMASTER_DISCOVERY_API_KEY (existing).
- Tikkio: TIKKIO_DISCOVERY_FEED_URL, optional TIKKIO_DISCOVERY_AUTH_HEADER / TIKKIO_DISCOVERY_AUTH_VALUE. Obtain the exact Public Discovery API URL and auth scheme from Tikkio. Terms: https://help.tikkio.com/en/articles/16999952-tikkio-public-discovery-api-terms-conditions
- Billetto: BILLETTO_PUBLIC_EVENTS_URL, optional BILLETTO_PUBLIC_EVENTS_AUTH_HEADER / BILLETTO_PUBLIC_EVENTS_AUTH_VALUE. Obtain Norwegian public event publisher endpoint and required key pair from Billetto; do not assume Danish/Swedish endpoints apply. https://support.billetto.com/no/hc/billetto-offentlig-api-for-dine-eventer-og-billetter
- TicketCo: TICKETCO_EVENTS_FEED_URL, optional TICKETCO_EVENTS_AUTH_HEADER / TICKETCO_EVENTS_AUTH_VALUE. Token generally accesses an individual organizer's events and must be authorized by the organizer. https://ticketco.io/en/support/accessing-and-testing-the-ticketco-public-api
- Friskus: FRISKUS_RSS_FEEDS_JSON — a JSON array of up to twelve real public activity RSS URLs exported from the Friskus calendar. https://hjelp.friskus.com/article/109-integrasjon-rss-iframe-og-tv-visning

Put all keys and endpoints in Vercel under frameone-app as server-side Secrets. Never commit tokens. Configure Preview and verify live data/schema before enabling Production.

## Friskus feed JSON

Shape: [ { "url": "https://stavanger.friskus.com/<REAL-RSS-PATH>" } ]. This is a placeholder, not a working RSS endpoint. Actual RSS item event dates and WGS84 coordinates are required. RSS pubDate is a publication timestamp, not an event start.

Do not add a municipality center latitude/longitude to a municipality-wide feed: this would falsely include faraway events inside small user radii. An optional feed coordinate should only describe a feed limited to one exact physical location.

## JSON feeds

Adapters accept event arrays in events, items, results, or data and entries with: a name/title, actual start date, valid HTTPS event URL, and WGS84 latitude/longitude. Verify each provider's documented response and add a source-specific mapping if necessary. Endpoints are allowlisted by provider hostname; redirects are blocked to prevent leaking credentials.

## Isolation and retention

Each source is fetched independently. A failed source cannot prevent Ticketmaster results, and an unconfigured/failed provider is excluded from cleanup of previously stored integration_items. Sources with zero events but valid responses are supported. Items retain source-specific ticket links for the app; no firmware changes are needed.

## Verification

After real credentials are supplied: inspect API response and timestamps; test 10/25/50/100 km filters; test duplicates; test missing, empty, malformed and rate-limited responses; ensure provider URLs open the correct event page. Do not advertise an unconfigured provider as an active source.