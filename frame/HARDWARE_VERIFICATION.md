# Physical-frame firmware verification (v2.5.3 candidate)

Do not publish OTA until the board, 4 MB flash assumption, partition table, and GPIO wiring in `BUILD.md` are confirmed. Capture serial output and reset reason for every case. Logs must contain only HTTP status, response byte count, free heap, largest free 8-bit block, task stack high-water mark, JSON result, and parsed item count—never content, titles, tokens, sensitive URLs, or bodies.

## Preparation

1. Build and flash by USB with the confirmed PlatformIO environment; save `firmware.elf`, `firmware.map`, `firmware.bin`, and the size report.
2. Erase or record persisted signatures, then pair the frame. Enable serial capture at the sketch-configured baud.
3. For each test, record heap/block/stack metrics before fetch, after body receipt, after parse, and after render. Confirm no reset, watchdog, allocation failure, or declining largest block over 20 refreshes.

## Module matrix

- **Reminders only:** configure 0, 1, and 10 reminders including overdue/today/future and timed/untimed entries. Verify ordering, date grouping, rotation and empty/error states. Repeat 20 forced refreshes.
- **Countdown only:** configure 20 events including pinned, today, future, and past entries. Verify the existing rotation sequence and every cell size. Repeat 20 refreshes.
- **Normal Surf:** exercise all cell sizes, dayparts and five-day view; compare score, dice/experience indication, weather and wave/wind values with the current production firmware.
- **Today's Best Surf:** test with fuel penalty off, then on with a home location. Confirm winner selection, winner-detail data, dayparts/daily data, and that the largest heap block recovers between the two requests.
- **Weather:** exercise all cell sizes and five forecast days, including precipitation/wind insight. Repeat 20 refreshes.
- **Soccer:** verify next/last match, table window, standing, scorer and all cell sizes. Repeat 20 refreshes.
- **Stocks:** verify quote, baseline, selected chart range/series and all cell sizes. Repeat 20 refreshes.
- **Mixed layout:** configure Reminders + Surf + Weather without changing layout rules. Repeat 20 full cycles and ensure cache contents never cross modules or instances.

## Wake/update matrix

- **Normal wake:** wake from the configured timer and confirm the normal fetch/render/sleep cadence.
- **Quick change-check wake:** wake without changed signatures; confirm no full display initialization or refresh. Then alter one reminder and confirm exactly one normal refresh.
- **Forced full refresh:** trigger the existing periodic/firmware force path; confirm unchanged layout and a complete display refresh.
- **OTA update:** from the previous signed/published firmware, fetch the candidate manifest, download, verify, install and reboot. Confirm the OTA partition can hold the binary, rollback/recovery remains possible, version persistence is updated, and one forced redraw occurs. OTA artifact publication remains a separate manual release step.
