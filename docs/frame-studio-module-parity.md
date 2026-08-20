# Frame Studio module parity audit

The physical C++ renderers are authoritative. This audit was completed by comparing every current firmware size branch with Mirror View and the deterministic one-bit Studio renderer. Canvas primitives intentionally approximate GFX font rasterization and firmware artwork while preserving each object footprint. No unsupported geometry was added.

| Module | Size | Firmware renderer | Mirror renderer | Studio renderer | Result |
|---|---|---|---|---|---|
| Date | SMALL | `ModuleDate.cpp::SMALL` | `HomePageClient.tsx` Small / Full route | `drawDate` SMALL branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Date | MEDIUM | `ModuleDate.cpp::MEDIUM` | `HomePageClient.tsx` Medium / Full route | `drawDate` MEDIUM branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Date | LARGE | `ModuleDate.cpp::LARGE` | `HomePageClient.tsx` Large / Full route | `drawDate` LARGE branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Date | XL | `ModuleDate.cpp::XL` | `HomePageClient.tsx` Xl / Full route | `drawDate` XL branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Reminders | SMALL | `ModuleReminders.cpp::SMALL` | `HomePageClient.tsx` Small / Full route | `drawReminders` SMALL branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Reminders | MEDIUM | `ModuleReminders.cpp::MEDIUM` | `HomePageClient.tsx` Medium / Full route | `drawReminders` MEDIUM branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Reminders | LARGE | `ModuleReminders.cpp::LARGE` | `HomePageClient.tsx` Large / Full route | `drawReminders` LARGE branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Reminders | XL | `ModuleReminders.cpp::XL` | `HomePageClient.tsx` Xl / Full route | `drawReminders` XL branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Weather | SMALL | `ModuleWeather.cpp::SMALL` | `HomePageClient.tsx` Small / Full route | `drawWeather` SMALL branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Weather | MEDIUM | `ModuleWeather.cpp::MEDIUM` | `HomePageClient.tsx` Medium / Full route | `drawWeather` MEDIUM branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Weather | LARGE | `ModuleWeather.cpp::LARGE` | `HomePageClient.tsx` Large / Full route | `drawWeather` LARGE branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Weather | XL | `ModuleWeather.cpp::XL` | `HomePageClient.tsx` Xl / Full route | `drawWeather` XL branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Countdown | SMALL | `ModuleCountdown.cpp::SMALL` | `HomePageClient.tsx` Small / Full route | `drawCountdown` SMALL branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Countdown | MEDIUM | `ModuleCountdown.cpp::MEDIUM` | `HomePageClient.tsx` Medium / Full route | `drawCountdown` MEDIUM branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Countdown | LARGE | `ModuleCountdown.cpp::LARGE` | `HomePageClient.tsx` Large / Full route | `drawCountdown` LARGE branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Countdown | XL | `ModuleCountdown.cpp::XL` | `HomePageClient.tsx` Xl / Full route | `drawCountdown` XL branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Surf | SMALL | `ModuleSurf.cpp::SMALL` | `HomePageClient.tsx` Small / Full route | `drawSurf` SMALL branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Surf | MEDIUM | `ModuleSurf.cpp::MEDIUM` | `HomePageClient.tsx` Medium / Full route | `drawSurf` MEDIUM branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Surf | LARGE | `ModuleSurf.cpp::LARGE` | `HomePageClient.tsx` Large / Full route | `drawSurf` LARGE branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Surf | XL | `ModuleSurf.cpp::XL` | `HomePageClient.tsx` Xl / Full route | `drawSurf` XL branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Soccer | SMALL | `ModuleSoccer.cpp::SMALL` | `HomePageClient.tsx` Small / Full route | `drawSoccer` SMALL branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Soccer | MEDIUM | `ModuleSoccer.cpp::MEDIUM` | `HomePageClient.tsx` Medium / Full route | `drawSoccer` MEDIUM branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Soccer | LARGE | `ModuleSoccer.cpp::LARGE` | `HomePageClient.tsx` Large / Full route | `drawSoccer` LARGE branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Soccer | XL | `ModuleSoccer.cpp::XL` | `HomePageClient.tsx` Xl / Full route | `drawSoccer` XL branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Stocks | SMALL | `ModuleStocks.cpp::SMALL` | `HomePageClient.tsx` Small / Full route | `drawStocks` SMALL branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Stocks | MEDIUM | `ModuleStocks.cpp::MEDIUM` | `HomePageClient.tsx` Medium / Full route | `drawStocks` MEDIUM branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Stocks | LARGE | `ModuleStocks.cpp::LARGE` | `HomePageClient.tsx` Large / Full route | `drawStocks` LARGE branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Stocks | XL | `ModuleStocks.cpp::XL` | `HomePageClient.tsx` Xl / Full route | `drawStocks` XL branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Groceries | SMALL | `ModuleGroceries.cpp::SMALL` | `HomePageClient.tsx` Small / Full route | `drawGroceries` SMALL branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Groceries | MEDIUM | `ModuleGroceries.cpp::MEDIUM` | `HomePageClient.tsx` Medium / Full route | `drawGroceries` MEDIUM branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Groceries | LARGE | `ModuleGroceries.cpp::LARGE` | `HomePageClient.tsx` Large / Full route | `drawGroceries` LARGE branch | PARITY (browser fonts/artistic primitives approximate GFX) |
| Groceries | XL | `ModuleGroceries.cpp::XL` | `HomePageClient.tsx` Xl / Full route | `drawGroceries` XL branch | PARITY (browser fonts/artistic primitives approximate GFX) |

## Contract notes

- Supported geometry remains exclusively `4×1 → SMALL`, `2×2 → MEDIUM`, `4×2 → LARGE`, and `4×4 → XL`.
- Unsupported custom shapes continue to render `UNSUPPORTED — NEEDS NEW VARIANT`.
- Weather and surf artwork, calendar marks, chart traces, table markers, and grocery bullets use deterministic Canvas primitives and survive one-bit quantization.
- Mirror View required no corrections in this pass; its dedicated size routes already preserve the firmware hierarchy.
