# Weather Design vNext — physical approval lock

Weather is physically approved and locked as of 2026-11-06.

- Hardware: RE:MIND V4, 800×480 e-paper
- Typography: Fraunces + DM Sans
- Geometry QA: all 16 sizes in the 4×4 system
- Final physical iteration: Weather R5
- Hero temperature carries the unit (for example 8°C); secondary min/max values use degree-only notation
- Wind fact is value + direction only (for example 6 m/s SV)
- The main divider has semantic meaning: primary day above, future days below

## Smart behavior preserved

- A validated tomorrow forecast becomes primary only after 20:00 local time.
- Tomorrow-primary mode is explicitly marked **I MORGEN**.
- When tomorrow becomes primary, the future strip starts at the day after tomorrow so tomorrow is not duplicated.
- The existing backend Good-to-know / insight pipeline remains.
- The existing Thursday-evening / Friday noteworthy-weekend highlight remains.
- The existing stale-cache/date validation for tomorrow remains unchanged.

Legacy adaptive Weather remains only as a fail-safe if the editorial renderer rejects an unexpected geometry/data state.
