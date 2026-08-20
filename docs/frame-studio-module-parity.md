# Frame Studio module parity audit

The physical C++ renderers are authoritative. This audit was completed by comparing every current firmware size branch with Mirror View and the deterministic one-bit Studio renderer. Canvas primitives intentionally approximate GFX font rasterization and firmware artwork while preserving each object footprint. No unsupported geometry was added.

| Module | Size | Firmware renderer | Mirror renderer | Studio renderer | Result |
|---|---|---|---|---|---|
| Date | SMALL | `ModuleDate.cpp::SMALL` | `HomePageClient.tsx` Small / Full route | `drawDate` SMALL branch | PARITY — browser font rasterization differs |
| Date | MEDIUM | `ModuleDate.cpp::MEDIUM` | `HomePageClient.tsx` Medium / Full route | `drawDate` MEDIUM branch | PARITY — browser font rasterization differs |
| Date | LARGE | `ModuleDate.cpp::LARGE` | `HomePageClient.tsx` Large / Full route | `drawDate` LARGE branch | PARITY — browser font rasterization differs |
| Date | XL | `ModuleDate.cpp::XL` | `HomePageClient.tsx` Xl / Full route | `drawDate` XL branch | PARITY — browser font rasterization differs |
| Reminders | SMALL | `ModuleReminders.cpp::SMALL` | `HomePageClient.tsx` Small / Full route | `drawReminders` SMALL branch | PARITY — browser font rasterization differs |
| Reminders | MEDIUM | `ModuleReminders.cpp::MEDIUM` | `HomePageClient.tsx` Medium / Full route | `drawReminders` MEDIUM branch | PARITY — browser font rasterization differs |
| Reminders | LARGE | `ModuleReminders.cpp::LARGE` | `HomePageClient.tsx` Large / Full route | `drawReminders` LARGE branch | PARITY — browser font rasterization differs |
| Reminders | XL | `ModuleReminders.cpp::XL` | `HomePageClient.tsx` Xl / Full route | `drawReminders` XL branch | PARITY — browser font rasterization differs |
| Weather | SMALL | `ModuleWeather.cpp::SMALL` | `HomePageClient.tsx` Small / Full route | `drawWeather` SMALL branch | PARITY — deterministic icon placeholder approximates firmware artwork |
| Weather | MEDIUM | `ModuleWeather.cpp::MEDIUM` | `HomePageClient.tsx` Medium / Full route | `drawWeather` MEDIUM branch | PARITY — deterministic icon placeholder approximates firmware artwork |
| Weather | LARGE | `ModuleWeather.cpp::LARGE` | `HomePageClient.tsx` Large / Full route | `drawWeather` LARGE branch | PARITY — deterministic icon placeholder approximates firmware artwork |
| Weather | XL | `ModuleWeather.cpp::XL` | `HomePageClient.tsx` Xl / Full route | `drawWeather` XL branch | PARITY — deterministic icon placeholder approximates firmware artwork |
| Countdown | SMALL | `ModuleCountdown.cpp::SMALL` | `HomePageClient.tsx` Small / Full route | `drawCountdown` SMALL branch | PARITY — browser font rasterization differs |
| Countdown | MEDIUM | `ModuleCountdown.cpp::MEDIUM` | `HomePageClient.tsx` Medium / Full route | `drawCountdown` MEDIUM branch | PARITY — browser font rasterization differs |
| Countdown | LARGE | `ModuleCountdown.cpp::LARGE` | `HomePageClient.tsx` Large / Full route | `drawCountdown` LARGE branch | PARITY — browser font rasterization differs |
| Countdown | XL | `ModuleCountdown.cpp::XL` | `HomePageClient.tsx` Xl / Full route | `drawCountdown` XL branch | PARITY — browser font rasterization differs |
| Surf | SMALL | `ModuleSurf.cpp::SMALL` | `HomePageClient.tsx` Small / Full route | `drawSurf` SMALL branch | PARITY — deterministic icon placeholder approximates firmware artwork |
| Surf | MEDIUM | `ModuleSurf.cpp::MEDIUM` | `HomePageClient.tsx` Medium / Full route | `drawSurf` MEDIUM branch | PARITY — deterministic icon placeholder approximates firmware artwork |
| Surf | LARGE | `ModuleSurf.cpp::LARGE` | `HomePageClient.tsx` Large / Full route | `drawSurf` LARGE branch | PARITY — deterministic icon placeholder approximates firmware artwork |
| Surf | XL | `ModuleSurf.cpp::XL` | `HomePageClient.tsx` Xl / Full route | `drawSurf` XL branch | PARITY — deterministic icon placeholder approximates firmware artwork |
| Soccer | SMALL | `ModuleSoccer.cpp::SMALL` | `HomePageClient.tsx` Small / Full route | `drawSoccer` SMALL branch | PARITY — deterministic icon placeholder approximates firmware artwork |
| Soccer | MEDIUM | `ModuleSoccer.cpp::MEDIUM` | `HomePageClient.tsx` Medium / Full route | `drawSoccer` MEDIUM branch | PARITY — deterministic icon placeholder approximates firmware artwork |
| Soccer | LARGE | `ModuleSoccer.cpp::LARGE` | `HomePageClient.tsx` Large / Full route | `drawSoccer` LARGE branch | PARITY — deterministic icon placeholder approximates firmware artwork |
| Soccer | XL | `ModuleSoccer.cpp::XL` | `HomePageClient.tsx` Xl / Full route | `drawSoccer` XL branch | PARITY — deterministic icon placeholder approximates firmware artwork |
| Stocks | SMALL | `ModuleStocks.cpp::SMALL` | `HomePageClient.tsx` Small / Full route | `drawStocks` SMALL branch | PARITY — deterministic icon placeholder approximates firmware artwork |
| Stocks | MEDIUM | `ModuleStocks.cpp::MEDIUM` | `HomePageClient.tsx` Medium / Full route | `drawStocks` MEDIUM branch | PARITY — deterministic icon placeholder approximates firmware artwork |
| Stocks | LARGE | `ModuleStocks.cpp::LARGE` | `HomePageClient.tsx` Large / Full route | `drawStocks` LARGE branch | PARITY — deterministic icon placeholder approximates firmware artwork |
| Stocks | XL | `ModuleStocks.cpp::XL` | `HomePageClient.tsx` Xl / Full route | `drawStocks` XL branch | PARITY — deterministic icon placeholder approximates firmware artwork |
| Groceries | SMALL | `ModuleGroceries.cpp::SMALL` | `HomePageClient.tsx` Small / Full route | `drawGroceries` SMALL branch | PARITY — browser font rasterization differs |
| Groceries | MEDIUM | `ModuleGroceries.cpp::MEDIUM` | `HomePageClient.tsx` Medium / Full route | `drawGroceries` MEDIUM branch | PARITY — browser font rasterization differs |
| Groceries | LARGE | `ModuleGroceries.cpp::LARGE` | `HomePageClient.tsx` Large / Full route | `drawGroceries` LARGE branch | PARITY — browser font rasterization differs |
| Groceries | XL | `ModuleGroceries.cpp::XL` | `HomePageClient.tsx` Xl / Full route | `drawGroceries` XL branch | PARITY — browser font rasterization differs |

## Contract notes

- Supported geometry remains exclusively `4×1 → SMALL`, `2×2 → MEDIUM`, `4×2 → LARGE`, and `4×4 → XL`.
- Unsupported custom shapes continue to render `UNSUPPORTED — NEEDS NEW VARIANT`.
- Weather and surf artwork, calendar marks, chart traces, table markers, and grocery bullets use deterministic Canvas primitives and survive one-bit quantization.
- Mirror corrections in this pass are deliberately local: `MirrorMediumDateCard` and `MirrorMediumRemindersCard` now use the firmware-fixed white/black badge colors. `MirrorMediumCountdownCard` already used those literal colors.
- Mirror Date calendars already include the white current-day circle and configured holiday dots; Reminder calendars include current-day state and reminder-count dots.
- The 32 results below were checked branch-by-branch against the current C++ size dispatch, not inferred from renderer names.
