# AlAdhan keyless preview — RE:MIND Connect

Read-only experiment to compare AlAdhan calculated prayer times while waiting for
official IRN access. It is intentionally NOT another connection or IRN data source.

Connect > AlAdhan > TEST opens a modal for any Norwegian city, date, Asr 1x/2x,
calculation method (MWL, Diyanet, UOIF, ISNA, Umm Al-Qura), and adjustment for
high latitude (angle, middle of the night, one seventh). The response displays
Fajr, Sunrise, Dhuhr, Asr, Sunset, Maghrib, Isha, Hijri date and holiday labels.

No API key is needed. The server uses documented timingsByCity, country=NO,
timezone Europe/Oslo, school 0 for Asr 1x / school 1 for Asr 2x. Preview only
accepts API responses matching the requested date/method/school/timezone,
with valid Norwegian coordinates. Provider cache revalidates every 6 hours.

Signed-in users only. No user_integrations, integration_items or reminders
writes. No physical-frame changes, no stored calendar events. Not displayed in
onboarding. An AlAdhan calculation must never be presented as IRN official.

AlAdhan notes times can differ from mosques and local authorities. Compare
times with the IRN timetable and discuss suitable methods with Imran before
making this a connected provider. API without key does not establish commercial
usage rights; confirm rights before releasing.

Docs:
https://islamic.network/api/
https://aladhan.com/prayer-times-api
https://aladhan.com/credits-and-terms


## Connected beta (not just a preview)

Connect > AlAdhan now supports selecting a Norwegian city, Asr 1x or 2x,
calculation method and high-latitude method, then linking the source. A verified
7-day schedule is stored as account-level user_integrations + integration_items
records under **provider=aladhan**, separate from IRN / bonnetid.
The Reminders filter is named AlAdhan, and physical Reminders displays the
upcoming events when enabled for that frame. Existing smart reminder-time
boundaries drive the frame wake without a separate polling mode.

The provider returns Fajr, Sunrise, Dhuhr, Asr, Sunset, Maghrib and Isha.
On initial connection *all days* must be verified before data are written.
Any upstream error leaves the existing timetable untouched. Scheduled sync
occurs no more often than once every 12 hours; daily upstream API requests
use a six-hour shared cache. Disconnect removes only AlAdhan account data.
No fallback to IRN, no guessed times, no client credentials.

This is an **Experimental** integration pending comparison with IRN Norwegian
timetables. The public Islamic Network API does not require a key and publicly
discusses usage and rate limits. Review its usage terms and attribution
for product launch. Note that the Hijri holiday markers in the Preview
are calculated; no holiday calendar is silently imported.
