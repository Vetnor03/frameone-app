# ESP32 physical-frame build and memory report

## Reproducible build profile

`frame/platformio.ini` pins PlatformIO Espressif32 `6.6.0` (Arduino-ESP32 `2.0.17`), ArduinoJson `6.21.5`, and GxEPD2 `1.6.4`; discovers the sketch and every nested source file; supplies the short-include paths used by the firmware; selects an OTA-capable dual-app partition; and emits a linker map.

From the repository root:

```sh
pio run -d frame
pio run -d frame -t size
xtensa-esp32-elf-size -A frame/.pio/build/frame_esp32/firmware.elf
xtensa-esp32-elf-nm -S --size-sort --radix=d frame/.pio/build/frame_esp32/firmware.elf | tail -40
```

Preserve these artifacts from `frame/.pio/build/frame_esp32/`: `firmware.bin`, `firmware.elf`, and `firmware.map`.

## Hardware facts verified from source

- ESP32 Arduino APIs are used (`WiFi`, `Preferences`, ESP sleep and heap APIs).
- Panel type is `GxEPD2_750_T7` (800 × 480).
- E-paper control pins are CS 5, DC 17, RST 16 and BUSY 4. Comments identify the conventional SPI SCK 18/MOSI 23 wiring.
- Battery ADC is GPIO35 and power sense defaults to GPIO39.
- OTA requires a dual application partition and sufficient free sketch space.

## Values requiring manual confirmation

The repository contains no schematic, board manifest, prior binary/map, or production build metadata. Consequently these values are explicit **candidate assumptions**, not silently asserted facts:

| Value in candidate profile | Required confirmation |
| --- | --- |
| `esp32dev` / classic ESP32 | Exact module/board and CPU/flash mode |
| 4 MB flash | Read module marking or bootloader flash report |
| `min_spiffs.csv` dual-app OTA | Compare production partition table and maximum published binary |
| GPIO/SPI mapping above | Compare schematic for every hardware revision |
| Power-sense polarity | Measure GPIO39 on USB and battery |

Do not publish from this profile until all five checks pass. If production differs, update `platformio.ini`, rebuild, and repeat hardware verification.

## Memory audit and expected allocation changes

| Path | Before | After |
| --- | --- | --- |
| Reminder change check | 16,384-byte stack JSON + serialized items copy | direct FNV-1a over body; 4,096-byte response cap |
| Reminder fetch | 20-item cache; 8,192-byte body/doc; 9-field DTO | 10-item cache; 4,096-byte body cap; 6,144-byte filtered heap doc; six-field DTO |
| Surf | one or two 24,576-byte stack docs; body excerpts logged | 16,384-byte filtered heap doc; 32,768-byte body cap; selection doc destroyed before winner doc |
| Countdown | 16,384-byte stack doc; complete body log | 12,288-byte filtered heap doc; 8,192-byte body cap; byte-count log |
| Frame config | 8,192-byte stack doc | 12,288-byte bounded heap doc; 12,288-byte body cap; full supported schema retained |
| Weather | unbounded body; 24,576-byte heap doc | 32,768-byte body cap; filtered 24,576-byte heap doc |
| Soccer | unbounded body, full error body, 12/16 KB retry allocations | 24,576-byte cap; one filtered 16,384-byte heap doc |
| Stocks | body-sized allocation | 16,384-byte cap; filtered fixed 12,288-byte heap doc |

The Countdown endpoint/cache remains at 20 because the renderer rotates across the cached event set; reducing it would change visible rotation. Module layouts, selection logic, refresh intervals, reminder grouping/order, Surf scoring/fuel/daypart logic, and Countdown rotation were not changed.

`NetClient` still materializes the complete HTTP response in a `String`. Call-site caps prevent oversized payloads from being parsed, but they cannot stop the initial body allocation. A follow-up should add an opt-in bounded/streaming API without changing current callers, validate `Content-Length` before reads, and migrate modules individually.

## Font duplication determination

The custom font headers define non-`extern` namespace-scope `const` bitmap/glyph objects and are included by multiple module translation units. In C++, those objects have internal linkage, so each including translation unit can emit its own copy. A successful ELF/map inspection is required to determine whether this toolchain merges identical constants; no build artifact is present to prove that it does. If the map shows duplicates, move definitions into one `.cpp` and expose `extern` declarations from headers in a separate, behavior-neutral change.

## Build/size result for this change

No `pio` or `arduino-cli` executable is installed in the supplied environment, and no previous ELF/map is present. Therefore flash, `.data`, `.bss`, available RAM, largest linked symbols/assets, definitive font deduplication, and before/after binary comparison remain **not measured**. Per release policy, `FW_VER` remains `v2.5.2`; bump to `v2.5.3` only after the confirmed production profile builds successfully. OTA artifact publication remains manual after that build and physical verification.
