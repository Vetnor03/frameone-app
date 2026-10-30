# RE Design vNext — V4 physical acceptance and rollback gate

**Status: BLOCKED / NO FLASH.** Parent [#1429](../../issues/1429), Date [#1435](../../issues/1435), and original full-editorial aperture blocker [#1482](../../issues/1482). This checklist does not alter release settings, merge any draft PR, deploy OTA or approve a device.

## What is established by source and native host capture

- Complete ESP32-S3 logical e-paper drawing canvas: **800 × 480 px**; 4×4 user layout with 200×120 logical cells.
- Generated phase-0 mechanical estimate: **visible aperture x=58, y=39, width=680, height=436**. This was **not physically calibrated** on the actual new V4 frame during the design sprint.
- All original-C++ Date full-editorial/compact C++ test captures can have zero ink *outside the estimated aperture*. That is an important **host** bound, not a physical alignment measurement. Do not report e-paper contrast/antialiasing or physical legibility as tested.
- Original Fraunces / DM Sans and an optional original 1-bit plant are used in opt-in Date paths. News and Surf remain unchanged by the Date PR series.
- Even a green build of a new firmware binary is NOT an archived, known-working rollback baseline.

## Gate A — physical opening and 1–2 metre legibility (OWNER ACTION)

1. Confirm the actual V4 hardware profile, display orientation, frame alignment and matte opening. If the mounted opening differs from x=58/y=39/w=680/h=436, correct the **measured policy** first; do not fiddle with per-layout magic offsets.
2. Generate the exact logical-panel overlay (review only, **does not display on an e-paper frame**):

   `python frame/tools/generate_date_aperture_reference.py --output /tmp/date-aperture.svg`

   It contains red opening bounds, corner fiducials and dotted 4×4 grid. Compare coordinates with a real panel/photo only when an independently safe display-test path exists.
3. Physical photo evidence requires an actual frame, a known-good recovery baseline **and user approval to flash**. Check top/bottom/right/left edges; a desk measurement of the matte itself is not proof of screen pixel alignment. Record measured visible pixel bounds (x/y/w/h), board revision and image orientation. **Do not invent any physical offset from a screenshot alone.**
4. After a safe device test is separately approved, check Date layouts 1×1, 1×2, 2×2, 2×4, 3×4 and 4×4; at least Light + Dark, long Norwegian month/weekday text, October/November, Dec→Jan year rollover and optional holiday rows. At 1–2 metres, the date hierarchy should have real contrast and no hidden factual ink. Do not approve merely because the host C++ frames look sharp.
5. Record outcomes and links to original photos in #1435 and the design sign-off. Close #1482 only after actual full-editorial and neighbor-module checks.

## Gate B — known-good, restorable firmware (OWNER ACTION)

**A GitHub Actions compiled BIN does not qualify automatically.** The uploaded library/search history includes old Arduino build logs, but no verified *previously booted and recoverable* 2.7.3 (or other confirmed stable) full merged image and SHA256 was established.

Required PRIVATE evidence:

- Exact V4 ESP32-S3-WROOM-1-N16R8 / 16 MiB flash identity and physical USB/BOOT accessibility; retain board-specific serial logs and flash settings.
- An actual **full merged flash image** read from an owner-confirmed working board, or an independently proven backup. If only an app image exists, the complete compatible bootloader, partition table and app layout must be recovered separately — this offline checker deliberately will **not** approve app-only.
- Its SHA256, file length, version *observed on the working device*, backup date, boot photo/serial log reference, documented recovery method and date of a genuinely successful restore rehearsal.
- Full-device readback may include **Wi-Fi credentials, tokens and personal data**. Treat it as confidential: store encrypted/locally, never commit it, never attach it to an issue/PR, and do not upload it to a public CI artifact. No device erasure is required for this offline check.
- If the actual on-device firmware version differs from 2.7.3, use the **verified actual version**; do not rename a binary to make it appear known-good.

Make a private manifest outside the repo, with the example fields shown below. Do NOT mark an evidence field true until the evidence exists.

```json
{
  "hardware": {
    "module": "ESP32-S3-WROOM-1-N16R8",
    "flash_size_bytes": 16777216
  },
  "image": {
    "kind": "esp32s3-full-merged",
    "local_path": "C:/PRIVATE/BACKUPS/verified_alfred_merged.bin",
    "offset": "0x0",
    "length_bytes": 16777216,
    "sha256": "REPLACE_WITH_ACTUAL_64_HEX_DIGEST",
    "working_version": "VERSION_ACTUALLY_OBSERVED_WHEN_BOOTED"
  },
  "evidence": {
    "booted_on_matching_v4": false,
    "working_boot_date": "YYYY-MM-DD",
    "working_boot_record": "PRIVATE serial boot log or photo reference",
    "restore_rehearsed": false,
    "restore_rehearsal_date": "YYYY-MM-DD",
    "restore_rehearsal_record": "PRIVATE test notes reference"
  }
}
```

Validate existing local files *without connecting to a board*:

`python frame/tools/verify_firmware_recovery.py --manifest C:/PRIVATE/BACKUPS/recovery-manifest.json`

It checks a 16 MiB backup, ESP image magic at bootloader/app addresses, partition-table magic at 0x8000, the exact SHA256 and whether **manual** evidence fields have been populated truthfully. It cannot authenticate the truth of an attestation or prove that recovery works. It only prints **METADATA CHECK PASSED** after all supplied preconditions match. It never writes or flashes anything.

## Release decision

- [ ] Exact physical aperture measured on a V4 frame and matches the policy, or policy updated and all relevant Date QA rerun.
- [ ] Original Date+News pixel boundaries and full two-month information proved after any policy edit.
- [ ] Owner-verified previous known-good FULL backup, SHA256, boot evidence and rehearsal. Recovery verified on matching hardware/partitions.
- [ ] Physical 1–2m review of all required Date modes, Light/Dark/long text/rollover.
- [ ] Explicit user approval for **which exact** experimental firmware revision to flash.
- [ ] Normal firmware remains default, Surf unchanged, no surprise OTA or deployment.

**Until every gate is met: FLASH = NEI, MERGE = NEI, OTA = NEI.**
