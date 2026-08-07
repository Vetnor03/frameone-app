#!/usr/bin/env python3
"""Static safety checks for the standalone Alfred Stage 5 diagnostic."""

from pathlib import Path
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SKETCH = HERE / "Alfred_Stage5_Sleep_Current_Test.ino"
errors: list[str] = []


def require(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


source = SKETCH.read_text(encoding="utf-8")
compact = re.sub(r"\s+", "", source)

require(re.search(r"^#define\s+ALFRED_STAGE5_CURRENT_TEST_ARMED\s+0\s*$", source, re.M) is not None,
        "the current-test arm must default to 0")

setup_match = re.search(r"void\s+setup\s*\(\s*\)\s*\{(.*?)\n\}", source, re.S)
require(setup_match is not None, "setup() was not found")
if setup_match:
    setup = setup_match.group(1)
    operations = re.findall(r"\b(?:pinMode|digitalWrite|Serial\.begin)\s*\([^;]*\);", setup)
    require(len(operations) >= 3, "setup() startup operations are missing")
    if len(operations) >= 2:
        require(re.sub(r"\s+", "", operations[0]) == "pinMode(12,OUTPUT);",
                "first setup hardware operation must configure GPIO12 OUTPUT")
        require(re.sub(r"\s+", "", operations[1]) == "digitalWrite(12,LOW);",
                "second setup hardware operation must drive GPIO12 LOW")
    require(setup.find("digitalWrite(12, LOW);") < setup.find("Serial.begin"),
            "GPIO12 LOW must precede Serial.begin")

require(not re.search(r"(?:digitalWrite|gpio_set_level)\s*\(\s*(?:12|kEpdPowerPin)\s*,\s*(?:HIGH|1)\s*\)", source),
        "GPIO12 must never be driven HIGH")
require("#if !ALFRED_STAGE5_CURRENT_TEST_ARMED" in source and
        "SAFE IDLE: current test is unarmed" in source,
        "unarmed firmware must explicitly enter safe idle")
require("constexpr unsigned long kSafeIdleIntervalMs = 5000;" in source and
        "millis() - lastSafeIdleReportMs >= kSafeIdleIntervalMs" in source,
        "safe-idle status must be emitted every five seconds")

sleep_match = re.search(r"void\s+enterIndefiniteDeepSleep\s*\(\s*\)\s*\{(.*?)\n\}", source, re.S)
require(sleep_match is not None, "indefinite deep-sleep helper was not found")
if sleep_match:
    sleep = sleep_match.group(1)
    ordered = ["for (int pin : kEpaperSignalPins)", "pinMode(pin, INPUT);",
               "gpio_get_level(kEpdPowerPin)",
               "esp_sleep_disable_wakeup_source(ESP_SLEEP_WAKEUP_ALL)",
               "gpio_hold_en(kEpdPowerPin)", "gpio_deep_sleep_hold_en();",
               "ENTERING INDEFINITE DEEP SLEEP FOR CURRENT MEASUREMENT",
               "Serial.flush();", "esp_deep_sleep_start();",
               "FAIL: deep sleep returned unexpectedly"]
    positions = [sleep.find(item) for item in ordered]
    require(all(position >= 0 for position in positions) and positions == sorted(positions),
            "input, wake-disable, hold, flush, sleep, and return-failure order is unsafe")
    require("if (wakeDisableResult == ESP_OK)" in sleep and
            "else if (wakeDisableResult == ESP_ERR_INVALID_STATE)" in sleep and
            "PASS, wake sources disabled" in sleep and
            "PASS, no wake sources were active" in sleep,
            "wake-disable must accept and clearly report OK and the safe no-source state")
    wake_failure = re.search(
        r"else\s*\{\s*reportEspResult\(\"Disable all wake sources: FAIL\".*?return;\s*\}",
        sleep, re.S)
    require(wake_failure is not None and "safeIdle = true;" in wake_failure.group(0),
            "wake-disable errors other than INVALID_STATE must be fatal and cancel sleep")
    require("if (holdResult != ESP_OK)" in sleep,
            "GPIO-hold return value must be checked")

require("constexpr int kEpaperSignalPins[] = {4, 5, 6, 7, 10, 11};" in source,
        "all disconnected e-paper signal pins must be listed")
release_match = re.search(
    r"bool\s+releaseRetainedHoldSafely\s*\(\s*\)\s*\{(.*?)\n\}", source, re.S)
require(release_match is not None, "retained GPIO12 hold-release helper was not found")
if release_match:
    release = release_match.group(1)
    markers = ["forceEpdPowerLow();", "gpio_deep_sleep_hold_dis();",
               "gpio_hold_dis(kEpdPowerPin);", "forceEpdPowerLow();",
               "gpio_get_level(kEpdPowerPin) == 0"]
    release_positions = [release.find(marker) for marker in markers]
    release_positions[3] = release.find(markers[3], release_positions[0] + 1)
    require(all(position >= 0 for position in release_positions) and
            release_positions == sorted(release_positions),
            "hold release must use the Stage 4 global-disable/per-pin-disable order")
    require("const esp_err_t pinHoldResult = gpio_hold_dis(kEpdPowerPin);" in release and
            "pinHoldResult != ESP_OK" in release,
            "per-pin hold-release result must be captured and checked")
require("waitWithEpdPowerLow(10000);" in source and
        "while (millis() - startMs < durationMs)" in source,
        "armed delay must repeatedly force GPIO12 LOW for ten seconds")

require("esp_sleep_enable_" not in source, "no wake source may be enabled")
require("esp_sleep_enable_timer_wakeup" not in source and "timer_wakeup" not in source.lower(),
        "no timer wake may be configured")
require("ESP_SLEEP_WAKEUP_ALL" in source, "all wake sources must be disabled")

for label, pattern in {
    "network connection/operation": r"\b(?:WiFi\.|HTTPClient|WiFiClient|WebServer|esp_wifi_(?:connect|start|init))\b",
    "SPI/display": r"#\s*include[^\n]*(?:SPI|GxEPD)|\b(?:SPI\.|GxEPD2)\b",
    "persistent storage": r"\b(?:Preferences|EEPROM|SPIFFS|LittleFS|FFat|FATFS|nvs_)\b",
    "I2C/MAX17048": r"\b(?:Wire\.|TwoWire|MAX17048)\b",
    "OTA": r"\b(?:ArduinoOTA|Update\.|esp_ota_)\b",
}.items():
    require(re.search(pattern, source, re.I) is None, f"forbidden {label} use is present")

for call, result in (("esp_wifi_stop()", "wifiStopResult"),
                     ("esp_wifi_deinit()", "wifiDeinitResult"),
                     ("esp_sleep_pd_config", "rtcPeriphResult")):
    require(call in source and f"{result} != ESP_OK" in source,
            f"{call} result must be captured and checked")
require("esp_bt_controller_disable()" in source and "btDisableResult != ESP_OK" in source and
        "esp_bt_controller_deinit()" in source and "btDeinitResult != ESP_OK" in source,
        "Bluetooth disable/deinit results must be checked")

changed = set(subprocess.run(["git", "diff", "--name-only", "HEAD"], cwd=ROOT,
                             check=True, capture_output=True, text=True).stdout.splitlines())
changed.update(subprocess.run(["git", "diff", "--name-only", "--cached"], cwd=ROOT,
                              check=True, capture_output=True, text=True).stdout.splitlines())
changed.update(subprocess.run(["git", "ls-files", "--others", "--exclude-standard"], cwd=ROOT,
                              check=True, capture_output=True, text=True).stdout.splitlines())
unexpected = sorted(path for path in changed
                    if not path.startswith("frame/diagnostics/alfred_stage5/"))
require(not unexpected, "production or other diagnostic files modified: " + ", ".join(unexpected))

if errors:
    print("Alfred Stage 5 static check FAILED:")
    for error in errors:
        print(f"  - {error}")
    sys.exit(1)

print("Alfred Stage 5 static check PASSED")
