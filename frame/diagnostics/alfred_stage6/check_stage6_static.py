#!/usr/bin/env python3
"""Static safety and isolation checks for the Alfred Stage 6 diagnostic."""

from pathlib import Path
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SKETCH = HERE / "Alfred_Stage6_Battery_WiFi_Stress_Test.ino"
EXAMPLE = HERE / "AlfredStage6Secrets.example.h"
errors: list[str] = []


def require(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


source = SKETCH.read_text(encoding="utf-8")
compact = re.sub(r"\s+", "", source)
require("#defineALFRED_STAGE6_STRESS_TEST_ARMED0" in compact, "safety arm must default to 0")

setup_match = re.search(r"void\s+setup\s*\(\s*\)\s*\{(.*?)\n\}", source, re.S)
require(setup_match is not None, "setup() not found")
if setup_match:
    setup = setup_match.group(1)
    operations = re.findall(r"\b(?:pinMode|digitalWrite|Serial\.begin|WiFi\.(?:onEvent|mode|begin))\s*\([^;]*\);", setup)
    require(len(operations) >= 2 and re.sub(r"\s+", "", operations[0]) == "pinMode(12,OUTPUT);",
            "first setup hardware operation must be pinMode(12, OUTPUT)")
    require(len(operations) >= 2 and re.sub(r"\s+", "", operations[1]) == "digitalWrite(12,LOW);",
            "second setup hardware operation must be digitalWrite(12, LOW)")
    low = setup.find("digitalWrite(12, LOW);")
    require(0 <= low < setup.find("Serial.begin"), "GPIO12 LOW must precede Serial.begin")
    require(0 <= low < setup.find("WiFi.mode"), "GPIO12 LOW must precede Wi-Fi initialization")

require(not re.search(r"digitalWrite\s*\(\s*(?:12|kEpdPowerPin)\s*,\s*HIGH", source), "GPIO12 is driven HIGH")
require("void enforceEpdPowerSafety()" in source and source.count("digitalWrite(kEpdPowerPin, LOW);") >= 2,
        "active operation must continuously reassert GPIO12 LOW")
require("constexpr uint8_t kBqPgoodPin = 17;" in source, "GPIO17 must be named as BQ_PGOOD_N")
require(re.search(r"pinMode\s*\(\s*kBqPgoodPin\s*,\s*INPUT\s*\)", source) is not None,
        "BQ_PGOOD_N GPIO17 must be configured INPUT without a pull resistor")
require(not re.search(r"pinMode\s*\(\s*(?:17|kBqPgoodPin)\s*,\s*(?:OUTPUT|INPUT_PULL)", source),
        "GPIO17 must never be OUTPUT or use an internal pull resistor")
for pin in (4, 5, 6, 7, 10, 11):
    require(not re.search(rf"\b(?:pinMode|digitalWrite|analogWrite|analogRead)\s*\(\s*{pin}\b", source),
            f"protected GPIO{pin} is altered")

for pattern, label in (
    (r"#\s*include\s*[<\"]SPI(?:\.h)?[>\"]|\bSPI\.", "SPI"),
    (r"GxEPD2", "GxEPD2"), (r"#\s*include\s*[<\"]Wire(?:\.h)?[>\"]|\bWire\.", "I2C"),
    (r"MAX17048", "MAX17048"), (r"\bPreferences\b", "Preferences"),
    (r"\bnvs_", "NVS"), (r"\bEEPROM\b", "EEPROM"),
    (r"\b(?:SPIFFS|LittleFS|FFat|FATFS|File)\b", "filesystem"),
    (r"\b(?:Bluetooth|BLEDevice|NimBLE)\b", "Bluetooth"),
    (r"\b(?:ESP\.restart|esp_restart)\s*\(", "automatic reboot"),
):
    require(not re.search(pattern, source, re.I), f"forbidden {label} use found")

example = EXAMPLE.read_text(encoding="utf-8")
require('#define ALFRED_WIFI_SSID "replace-me"' in example, "example SSID is not replace-me")
require('#define ALFRED_WIFI_PASSWORD "replace-me"' in example, "example password is not replace-me")
require('#include "AlfredStage6Secrets.h"' in source, "local secrets header is not included")
ignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
require("frame/diagnostics/alfred_stage6/AlfredStage6Secrets.h" in ignore, "local secrets file is not ignored")

production = (ROOT / "frame/src/device/DeviceIdentity.cpp").read_text(encoding="utf-8")
markers = ("uint64_t mac = ESP.getEfuseMac();", "uint32_t hi = (uint32_t)(mac >> 24);",
           "uint32_t lo = (uint32_t)(mac & 0xFFFFFF);", '"frm_%06lX%06lX"',
           "(unsigned long)(hi & 0xFFFFFF)", "(unsigned long)lo")
for marker in markers:
    require(marker in production and marker in source, f"production device-ID marker differs: {marker}")
require('deviceId == "frm_88AC499FC114"' in source, "expected Alfred device ID is not checked")

callback = re.search(r"void\s+onWiFiEvent\s*\([^)]*\)\s*\{(.*?)\n\}", source, re.S)
require(callback is not None, "Wi-Fi callback missing")
if callback:
    body = callback.group(1)
    require("portENTER_CRITICAL" in body and "portEXIT_CRITICAL" in body, "callback state is not thread-safe")
    for forbidden in ("WiFi.reconnect", "Serial.", "hostByName", "scanNetworks"):
        require(forbidden not in body, f"callback contains forbidden operation: {forbidden}")
require("portMUX_TYPE" in source and "portMUX_INITIALIZER_UNLOCKED" in source, "event mutex missing")
require("kReconnectIntervalMs = 5000" in source and "now - lastReconnectMs >= kReconnectIntervalMs" in source,
        "five-second reconnect rate limit missing")
require("kReconnectAttemptTimeoutMs" in source and "setAssociating(true)" in source and
        "!isAssociating()" in source, "protected reconnect-in-progress tracking missing")
require(re.search(r"phase == Phase::STRESS.*?WiFi\.reconnect\(\)", source, re.S) is not None,
        "main-task reconnect logic missing")
require("kStressDurationMs = 60000" in source and "now - liveResult.startMs >= kStressDurationMs" in source,
        "exact 60-second stress boundary missing")
require("liveResult.endMs = millis();" in source and
        "liveResult.durationMs = liveResult.endMs - liveResult.startMs;" in source,
        "freeze must record actual millis() duration")
require("liveResult.startMs + kStressDurationMs" not in source and
        "liveResult.durationMs = kStressDurationMs" not in source, "frozen duration is fabricated")
require("if (frozen) return;" in source and "frozenResult = liveResult;" in source,
        "one-way frozen result guard missing")
require("batteryOnlyVerified" in source and "liveResult.batteryOnlyVerified" in source and
        re.search(r"liveResult\.pass\s*=.*?liveResult\.batteryOnlyVerified", source, re.S) is not None,
        "PASS must require frozen battery-only verification")
require("liveResult.pgoodInitialHigh" in source and "liveResult.pgoodFinalHigh" in source and
        "liveResult.usbPowerSeenDuringStress" in source, "Phase 1 PGOOD evidence is incomplete")
require(not re.search(r"phase == Phase::REPORT.*?(?:digitalRead\s*\(\s*kBqPgoodPin|liveResult\.pgood)", source, re.S),
        "report mode must not sample GPIO17 or modify frozen PGOOD evidence")
report_branch = re.search(r"phase == Phase::REPORT(.*?)delay\(10\)", source, re.S)
require(report_branch is not None and not re.search(r"hostByName|scanNetworks|WiFi\.reconnect", report_branch.group(1)),
        "report mode restarts stress work")
require('WiFi.hostByName("re-mind.no"' in source, "required unauthenticated DNS workload missing")
persist_at = source.find("WiFi.persistent(false);")
require(persist_at >= 0 and persist_at < source.find("WiFi.mode(") and persist_at < source.find("WiFi.begin("),
        "WiFi.persistent(false) must precede Wi-Fi mode and connection initialization")
scan_guard = re.search(r"if \(!scanRunning && WiFi\.status\(\) == WL_CONNECTED && !isAssociating\(\).*?WiFi\.scanNetworks", source, re.S)
require(scan_guard is not None, "scan start must require connected and not associating")
require(not re.search(r"HTTPClient|https?://|Authorization|Bearer", source, re.I), "authenticated/API network call found")
require("USB connection occurred after the test" not in source,
        "report makes an unverified USB insertion claim")
require("RTC_DATA_ATTR" in source and "RtcState::ACTIVE" in source and "unexpectedReset = true" in source,
        "RTC-only active-reset detection missing")

tracked = subprocess.run(["git", "ls-files"], cwd=ROOT, check=True, capture_output=True, text=True).stdout.splitlines()
require(not any(path.endswith("AlfredStage6Secrets.h") for path in tracked), "real/local credentials file is tracked")
for path in tracked:
    if path.endswith((".ino", ".h")):
        text = (ROOT / path).read_text(encoding="utf-8")
        for value in re.findall(r'#define\s+ALFRED_WIFI_(?:SSID|PASSWORD)\s+"([^"]+)"', text):
            require(value == "replace-me", f"possible real credential in {path}")

changed = set(subprocess.run(["git", "diff", "--name-only", "HEAD"], cwd=ROOT, check=True,
                             capture_output=True, text=True).stdout.splitlines())
changed.update(subprocess.run(["git", "diff", "--name-only", "--cached"], cwd=ROOT, check=True,
                              capture_output=True, text=True).stdout.splitlines())
unexpected = sorted(p for p in changed if p != ".gitignore" and not p.startswith("frame/diagnostics/alfred_stage6/"))
require(not unexpected, "production firmware or another diagnostic changed: " + ", ".join(unexpected))

if errors:
    print("Alfred Stage 6 static check FAILED:")
    for error in errors:
        print(f"  - {error}")
    sys.exit(1)
print("Alfred Stage 6 static check PASSED")
