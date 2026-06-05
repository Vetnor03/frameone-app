# Spond integration manual test checklist

This integration is an unofficial/experimental Spond connection based on the community Python package API shape. Do not treat it as official OAuth.

## Checklist

1. Wrong login
   - Open Connect Apps → Spond → Connect.
   - Enter an invalid Spond email/phone and password.
   - Confirm the UI shows a friendly failure message and no raw Spond API response.
2. Correct login
   - Open Connect Apps → Spond → Connect.
   - Enter valid Spond credentials.
   - Confirm the modal closes, the connected badge appears, and the account/profile label is shown.
3. Connected status
   - Reload the app and open Connect Apps.
   - Confirm Spond still shows connected without exposing credentials.
4. Messages/events sync
   - Trigger `POST /api/integrations/spond/sync` with the signed-in user's bearer token.
   - Confirm upcoming events are written to `integration_items` with provider `spond`. Posts/chats may be stored for future use, but they must not be returned by reminder endpoints.
5. Frame payload includes Spond items
   - Call `/api/device/reminders?device_id=<device_id>` for a device shared with the connected user.
   - Confirm only Spond event rows appear in the `items` array with `source: "spond"` and no firmware changes are required.
6. Disconnect clears credentials and synced data
   - Click Disconnect for Spond.
   - Confirm status becomes disconnected, encrypted credentials are cleared, and synced Spond items are removed.
