# Pilot end control

Prepared only: no device is selected by default. Requires both this backend and
this firmware to be deployed before it can be used. Older firmware ignores the
new field and will not enter the pilot-ended state.

## End selected pilots

Set the server-only environment variable `PILOT_ENDED_DEVICE_IDS` to a comma-separated
list of exact internal device IDs (`frm_...`), and redeploy the backend so the new
value takes effect. This is an operator control, not a tester-facing setting.
There is no wildcard or automatic expiry. Leave the variable empty until the
pilot should actually end. Select all five pilot IDs to end the whole pilot.

The authenticated `/api/device/update-state` response includes `pilot_ended`.
Online frames discover it through their existing HTTPS probe cadence (including
MQTT safety probes). Power Saver frames check at their next normal wake. Offline
frames cannot receive the instruction until they reconnect; existing offline
shelf-locked frames need a physical USB wake. This is not an instant delivery
or a delivery acknowledgement mechanism.

On receipt, the frame latches the ended state in NVS, invalidates the cached
physical dashboard layout, draws once:

- RE:MIND
- Pilot test ended
- Thank you for helping shape RE:MIND

It then shuts off Wi-Fi and uses shelf deep sleep, with no timer wake. The
closing screen survives unplugging, power loss and resets. No Wi-Fi credentials,
account pairing or dashboard settings are erased. Charging still works.

## Reactivate a returned frame

Remove its ID from the environment variable and redeploy. Reconnect USB (or reset
while USB powered). An ended frame makes one bounded saved-Wi-Fi connection and
an authenticated state request. Only explicit `pilot_ended: false` clears its
local end latch. Failure, missing fields and an old backend leave it asleep.

On battery it does not contact the backend. Clearing the remote setting alone
cannot wake a sleeping frame. On reactivation, a persisted redraw flag forces a
full dashboard render and is only cleared after successful rendering.

## Verification before distributing firmware

Automated tests cover exact-ID selection, auth placement, strict boolean parsing,
latch ordering, shelf sleep and resume redraw wiring. Compile the standard Alfred
firmware and test on one physical frame before rolling out:

1. Start with an empty control; confirm ordinary updates and Power Saver.
2. Select one test ID; confirm only that frame shows the closing screen.
3. Confirm Wi-Fi off, no periodic wake and expected shelf current.
4. Unplug/replug, reset, and interrupt power during the initial closing draw.
5. Remove the ID; verify USB reactivation and a complete dashboard redraw even
   with unchanged content. Simulate unavailable Wi-Fi/backend during recovery.
6. Verify a queued end command is picked up after an offline frame reconnects.

No physical-device verification or current measurement is implied by source tests.
