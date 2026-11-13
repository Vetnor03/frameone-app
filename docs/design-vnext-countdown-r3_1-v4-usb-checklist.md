# Countdown R3.1 — isolated V4 USB physical review

**Scope:** design validation only. Draft PR #1522, issue #1521. Do not merge, publish OTA, or update pilot devices. This candidate is distinct from the standard firmware, which has the editorial flag **OFF**.

## Before flashing

1. Use only the designated RE:MIND V4 test frame with the verified **ESP32-S3 N16R8 / Alfred V1.2 hardware profile**. Make sure the battery is in a safe, normal state; for USB-only testing use the previously verified USB-only setup.
2. In the development PR branch, run the following from the repository root on Windows, replacing COM5 with the **actual** USB serial port:

   ```powershell
   pio run -d frame -e alfred_v1_2_countdown_r2_preview -t upload --upload-port COM5
   pio device monitor --port COM5 -b 115200
   ```

   The matching CI artifact `countdown-v4-r3_1-usb-test-unflashed` stores the compiled, source-SHA-identified build for traceability. **Do not manually guess flash offsets or erase the whole chip.** Preserve stored NVS, pairing and Wi-Fi. Never use the old 4 MB `frame_esp32` image on V4.

3. Confirm the display boots, renders at full 800×480 and returns to normal operation after full refresh. Check serial logs for display/power errors and that the identity and Wi-Fi pairing are still present.

## 16 geometries to review

Nominal grid spans (actual on-frame `Cell` geometry comes from the 800×480 viewport and border/divider rules):

| Rows \\ Columns | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| 1 row | 1×1 | 2×1 | 3×1 | 4×1 |
| 2 rows | 1×2 | 2×2 | 3×2 | 4×2 |
| 3 rows | 1×3 | 2×3 | 3×3 | 4×3 |
| 4 rows | 1×4 | 2×4 | 3×4 | 4×4 |

Use the existing custom-layout interface to assign Countdown to the selected footprint and fill the remaining cells with supported modules. The production layout validator requires complete 4×4 coverage; do not attempt to send an incomplete custom layout.

Review all sixteen once in Light mode. Review at least the compact 1×1, ribbon 4×1, wide 4×3 and full 4×4 in Dark mode, ideally the full set. Photograph with the real passepartout fitted rather than evaluating only a bare panel.

## Visual pass criteria

- The title and day number must both be visible in 1×1, and must remain distinguishable at 1–3 m where applicable.
- 4×1 keeps its headline centered within its **own** title segment; days stay in their own metric segment.
- Dense 4×3 and 4×4 split views keep title/number/date grouped in the **middle of the left panel**, and the Coming up list balanced vertically on the right.
- Upcoming rows retain source order. One visible row has **no diamond**; two or more visible rows get the small diamonds.
- Long Norwegian titles remain legible without cut-off glyphs; caption/date never collides with the hero.
- Check all four edges against the physical passepartout and any dividers; no clipping, overlapping text, or unintended partial refresh.
- Try one event, multiple upcoming events, Today/zero days, past, and a long event name if real data permits; **do not change backend test data just to fabricate a screenshot**.
- Confirm Date/Weather/Surf/Reminders/News look unchanged in any mixed layout.

## Completion and rollback

Send marked photos (especially 1×1, 4×1, 4×3, 4×4) and any boot/render logs for physical evaluation. Only after explicit physical approval do we cut a clean production integration PR.

If the candidate is unsatisfactory, retain the existing pairing and return to the known-good standard firmware with the `alfred_v1_2` profile from its known-good revision using the normal USB process. **Do not erase all flash.** No unattended OTA or fleet rollout.
