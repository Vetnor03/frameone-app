# Re-mind app-only battery UI task package

## 1) Strong Codex prompt/script (paste this into a new Codex chat)

```text
You are working in the `frameone-app` repository for the Re-mind project.

Task: add battery status to the **app UI only** (no firmware/backend scope expansion) in a clean, minimal, Apple-like style.

## Existing context you should assume is true
- Firmware + backend already send/store battery data.
- `device_status` already includes:
  - `battery_percent`
  - `battery_voltage`
- `app/api/device/status/route.ts` already returns:
  - `battery_percent`
  - `battery_voltage`

## UX goal
Show battery status in **My Frames / Settings** as a small metadata detail near existing frame identity metadata (device id / firmware version), not as a large separate card.

Desired feel example:
`frm_xxx   v2.3.9   [battery icon] 65%`

## Design constraints
- Monochrome only (no colors).
- Very minimal and polished.
- Keep spacing/typography aligned with current Settings/My Frames language.
- Avoid adding heavy UI.
- Battery should be present but low visual weight.

## Data + architecture constraints
- Reuse existing fetches/types/state where possible.
- Keep changes focused to app-side only.
- Graceful fallback if battery data is missing.
- Voltage can remain in API/types/state without mandatory display unless there is a very natural place.

## Required workflow
1. Create and use a new branch (do not commit to `main`).
2. Inspect relevant files before changing code.
3. Implement the cleanest architecture-fitting solution.
4. Run relevant checks (lint/test/build as applicable).
5. Commit changes.
6. Open a PR with a clear summary.
7. Do not auto-merge.

## What you must discover and decide
- Which app files render My Frames/Settings/frame list.
- Exact best placement for battery metadata.
- Whether existing status fetch/type flow can be reused cleanly.
- Whether to add a tiny reusable monochrome battery icon component.

## Concrete implementation guidance
- In `app/HomePageClient.tsx`, inspect the My Frames section and member/status loading logic.
- Extend the frame row type/state to carry battery percent (and voltage if useful for future use).
- Update the status fetch (`device_status` select fields) used for My Frames list to include battery fields.
- Render compact battery metadata inline next to existing metadata.
- Add a tiny icon component only if it reduces duplication and keeps styling clean.
- Ensure null/unknown battery values render gracefully (e.g., hide battery cluster or show `—`).

## Deliverables expected in your final response
- Summary of changed files and rationale.
- Test/check commands and outcomes.
- PR title/body.
- Screenshot if any perceptible UI change was made.
```

## 2) Exact implementation plan

1. **Branch + baseline**
   - Create a feature branch (for example `feat/app-battery-status`).
   - Confirm clean git status before edits.

2. **Inspect current rendering + data flow**
   - Inspect `app/HomePageClient.tsx` for:
     - `MemberRow` type.
     - `MyFramesSection` rendering (where `device_id` + `current_version` are shown).
     - Frame reload/add queries against `device_status`.
   - Inspect `app/api/device/status/route.ts` to verify battery fields already present in the response.

3. **Model update in app state**
   - Extend `MemberRow` with:
     - `battery_percent?: number | null`
     - `battery_voltage?: number | null` (optional, future-safe)
   - Keep typing nullable to align with missing/stale telemetry.

4. **Fetch update (app-side only)**
   - In the existing `supabase.from('device_status')` selects used by My Frames reload/add paths, include `battery_percent` (and optionally `battery_voltage`).
   - Merge these into `MemberRow` alongside `current_version`.
   - Avoid introducing a second battery-specific fetch when current list-fetch is enough.

5. **UI placement + minimal component**
   - In each frame list item, keep current structure and append battery metadata in the same metadata line as firmware version (or immediately adjacent).
   - If useful, add a tiny in-file `BatteryGlyph` component:
     - stroke-only, monochrome, small (roughly text-xs visual weight), no fill colors.
   - Render pattern: icon + `NN%` when value exists.
   - Fallback behavior when missing: omit battery cluster or display subtle placeholder `—`.

6. **Polish and consistency pass**
   - Verify typography, tracking, spacing, opacity match existing My Frames design language.
   - Ensure selected vs non-selected row color behavior is unchanged except inheriting text color.

7. **Validation**
   - Run relevant checks (at minimum lint and build if available in project scripts).
   - Fix any type/style issues.

8. **Commit + PR**
   - Commit with focused message.
   - Open PR with a concise summary:
     - app-only scope
     - battery metadata location
     - graceful fallback
     - no backend/firmware/schema change

## 3) SQL/API change assessment

- **SQL changes needed:** **No**.
  - Battery fields already exist in `device_status` (`battery_percent`, `battery_voltage`).
- **API changes needed:** **No** (for this scoped UI work).
  - `app/api/device/status/route.ts` already returns both battery fields.
- **Only app-side query/type/render updates are needed** to surface battery metadata in My Frames.
