# Regression Investigation (2026-05-27)

## Scope
Investigated regressions linked to:
- existing users treated as new users
- add-frame/settings redirect issues
- empty frame/modules load failures
- Safari/PWA session instability
- save/autosave persistence drift or overwrite

Method used: git history and diff inspection only (no Supabase/auth/data mutation).

## Last known-good baseline

**Likely last known-good commit:** `2d44272` (2026-05-25) — "Preserve custom surf spot coordinates for frame and mirror".

Reasoning:
- It predates the first onboarding-flow mutation in this sequence (`0548121`) and predates autosave behavior shifts (`f7171ac`, `9ebf347`).
- The targeted regression clusters all start immediately after this point.

## First likely bad commit

**First likely bad commit:** `0548121` — "Auto-open frame pairing for new users".

Why this is first likely regression source:
- Directly modifies `app/HomePageClient.tsx` onboarding/pairing behavior before later "fix" commits mention false pair-flow redirects.
- Follow-up commits explicitly describe repairing stale pairing state and hydration races (`1050132`, `c163e02`, `70b7fb8`), which is a typical signal that the initial onboarding-flow change introduced global instability.

## Regression timeline (ordered)

| Commit | PR | Key files touched | Behavior likely affected | Risk | Keep/Revert guidance |
|---|---:|---|---|---|---|
| `0548121` | (pre-merge direct) | `app/HomePageClient.tsx` | Auto-open pairing may misclassify existing users as unpaired/new | **High** | **Revert candidate** (or cherry-pick only guarded logic from later fixes) |
| `f7171ac` | (pre-merge direct) | `app/HomePageClient.tsx` | Replaces explicit save UX with auto-save; raises silent persistence-failure risk | High | Re-evaluate; likely partial revert |
| `9ebf347` | (pre-merge direct) | `app/HomePageClient.tsx` | Immediate frame-tab autosave; increases overwrite race potential | High | Re-evaluate; likely partial revert |
| `a571b45` | (pre-merge direct) | `app/HomePageClient.tsx` | Styled add-frame auto-open; may reinforce wrong redirect state | Medium-High | Revert candidate if onboarding state still noisy |
| `00277a3` | (pre-merge direct) | `app/HomePageClient.tsx` | Additional auto-open pairing logic; compounds misclassification risk | **High** | **Revert candidate** |
| `1050132` | PR #424 | `app/HomePageClient.tsx`, auth entry pages | Attempts DB-authoritative bootstrap to fix stale client pairing | Medium | **Keep** (stabilizing fix) |
| `c163e02` | PR #425 | `app/HomePageClient.tsx` | Fixes hydration race causing false pair redirects | Medium | **Keep** |
| `c085eeb` | PR #426 | `app/HomePageClient.tsx` | Storage migration + stale guards; can help but can also reset/reshape state unexpectedly | Medium-High | Keep cautiously; verify migration side effects |
| `44281f2` | PR #428 | `app/HomePageClient.tsx` | Stops onboarding redirect on query failures; reduces false "new user" routing | Low-Medium | Keep |
| `3a5e542` | PR #429 | `app/HomePageClient.tsx` | Safari auth-storage reset; may cure or trigger session churn depending on guard quality | Medium | Keep with focused regression tests |
| `70b7fb8` | PR #437 | `app/HomePageClient.tsx` | Fix stale add-frame redirect post hydration | Low | Keep |
| `45710a9` | PR #439 | `app/HomePageClient.tsx`, `app/api/device/save-settings/route.ts` | Preserves `device_settings` fields on save; targeted persistence protection | Low | Keep |
| `0346ca6` | PR #440 | `app/HomePageClient.tsx` | Autosave reliability/status improvements | Low-Medium | Keep |

## Commits/PRs touching requested risk areas

### `app/HomePageClient.tsx`
Heavy concentration of all onboarding/hydration/autosave/session changes.

### Supabase client initialization
- `app/lib/supabase.ts` shows no recent post-base changes in this branch segment.

### auth/session/middleware
- `app/middleware.ts` shows no recent post-base change in this segment.
- Auth/session behavioral changes were concentrated in `HomePageClient` and login/page bootstrap commits.

### device_members loading + frame-config loading
- Core behavior altered repeatedly in `HomePageClient` commits from `1050132` onward, especially hydration and fallback handling.
- `app/api/device/frame-config/route.ts` touched by surf-spot/config fixes, and later diagnostics.

### device_settings save/load
- `45710a9` explicitly preserves fields in server save route.

### autosave
- Primary pivot commits: `f7171ac`, `9ebf347`, later hardened by `0346ca6`.

### storage migration/localStorage/sessionStorage
- Primary pivot: `c085eeb`; Safari storage reset: `3a5e542`; stale-state cleanup: `9f6e676` and related fixes.

### module config normalization + reminders/groceries/surf/stocks loading
- Multiple `HomePageClient` changes interact with module-load timing and hydration.
- Stocks-specific logic changes (`f50243d`, `02dd38e`, `7a0a259`) are likely local to module behavior, but not the root of global onboarding/session instability.

## Diff cluster most associated with global instability

Most likely destabilizing cluster begins at `0548121` and expands via `f7171ac`, `9ebf347`, `a571b45`, `00277a3` (all in `app/HomePageClient.tsx`):
- onboarding auto-open/pairing state transitions introduced before robust DB-authoritative and hydration guards existed.
- save model moved to more aggressive autosave before server-field-preservation hardening landed.

## Bisect status

True behavioral bisect requires runtime manual test at each step:
1. login
2. confirm frame appears
3. change one setting
4. reopen app and confirm persistence

In this environment, a full manual bisect loop could not be completed end-to-end (no interactive browser/device loop here). However, commit-sequence and follow-up "fix" semantics strongly indicate `0548121` as first likely bad pivot.

## Safest rollback plan

1. Create temporary stabilization branch from `HEAD`.
2. Revert **only** early high-risk onboarding/autosave pivots:
   - `0548121`
   - `00277a3`
   - optionally `a571b45`
   - evaluate reverting `f7171ac` and `9ebf347` together if persistence churn remains.
3. Keep later hardening/fixes:
   - `1050132`, `c163e02`, `44281f2`, `70b7fb8`, `45710a9`, `0346ca6`.
4. Re-test workflow matrix (normal browser + Safari/PWA) before broader rollback.

