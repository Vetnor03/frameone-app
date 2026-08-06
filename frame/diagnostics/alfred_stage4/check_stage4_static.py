#!/usr/bin/env python3
"""Static safety checks for the standalone Alfred Stage 4 diagnostic."""

from pathlib import Path
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SKETCH = HERE / "Alfred_Stage4_Deep_Sleep_Test.ino"
errors: list[str] = []


def require(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


source = SKETCH.read_text(encoding="utf-8")
compact = re.sub(r"\s+", "", source)

require(re.search(r"^#define\s+ALFRED_STAGE4_SLEEP_TEST_ARMED\s+0\s*$", source, re.M) is not None,
        "the sleep-test arm must default to 0")

setup_match = re.search(r"void\s+setup\s*\(\s*\)\s*\{(.*?)\n\}", source, re.S)
require(setup_match is not None, "setup() was not found")
if setup_match:
    setup = setup_match.group(1)
    operations = re.findall(r"\b(?:pinMode|digitalWrite|Serial\.begin)\s*\([^;]*\);", setup)
    require(len(operations) >= 3, "setup() startup operations are missing")
    if len(operations) >= 2:
        require(re.sub(r"\s+", "", operations[0]) == "pinMode(12,OUTPUT);",
                "the first setup() hardware operation must make GPIO12 OUTPUT")
        require(re.sub(r"\s+", "", operations[1]) == "digitalWrite(12,LOW);",
                "the second setup() hardware operation must force GPIO12 LOW")
    low_at = setup.find("digitalWrite(12, LOW);")
    require(low_at >= 0 and low_at < setup.find("Serial.begin"),
            "GPIO12 must be forced LOW before Serial.begin")

require(not re.search(r"digitalWrite\s*\(\s*(?:12|kEpdPowerPin)\s*,\s*HIGH\s*\)", source),
        "GPIO12 must never be driven HIGH")
require("void forceEpdPowerLow()" in source and "void loop() {\n  forceEpdPowerLow();" in source,
        "GPIO12 LOW must be reasserted during awake operation")

sleep_match = re.search(r"void\s+enterTimerDeepSleep\s*\(\s*\)\s*\{(.*?)\n\}", source, re.S)
require(sleep_match is not None, "deep-sleep helper was not found")
if sleep_match:
    sleep = sleep_match.group(1)
    required_order = ["forceEpdPowerLow();", "if (!epdPowerIsLow())",
                      "esp_sleep_enable_timer_wakeup(kTimerWakeUs);",
                      "if (timerWakeResult != ESP_OK)",
                      "gpio_hold_en(kEpdPowerPin);", "if (holdEnableResult != ESP_OK)",
                      "gpio_deep_sleep_hold_en();",
                      "esp_deep_sleep_start();"]
    positions = [sleep.find(marker) for marker in required_order]
    require(all(position >= 0 for position in positions) and positions == sorted(positions),
            "GPIO12 must be checked LOW and held in the correct order before deep sleep")
    require("const esp_err_t timerWakeResult =" in sleep and
            "esp_err_to_name(timerWakeResult)" in sleep,
            "timer-wakeup configuration result must be captured, checked, and named")
    require("const esp_err_t holdEnableResult =" in sleep and
            "esp_err_to_name(holdEnableResult)" in sleep,
            "GPIO hold-enable result must be captured, checked, and named")
    timer_failure = re.search(
        r"if\s*\(timerWakeResult\s*!=\s*ESP_OK\)\s*\{(.*?)\n  \}", sleep, re.S)
    hold_failure = re.search(
        r"if\s*\(holdEnableResult\s*!=\s*ESP_OK\)\s*\{(.*?)\n  \}", sleep, re.S)
    require(timer_failure is not None and "safeIdle = true;" in timer_failure.group(1) and
            "return;" in timer_failure.group(1),
            "timer-wakeup failure must enter safe idle and return before deep sleep")
    require(hold_failure is not None and "safeIdle = true;" in hold_failure.group(1) and
            "return;" in hold_failure.group(1) and
            "esp_sleep_disable_wakeup_source(ESP_SLEEP_WAKEUP_TIMER);" in hold_failure.group(1),
            "hold-enable failure must disable timer wake, enter safe idle, and return")

release_match = re.search(r"bool\s+releaseEpdPowerHoldSafely\s*\(\s*\)\s*\{(.*?)\n\}", source, re.S)
require(release_match is not None, "GPIO hold release helper was not found")
if release_match:
    release = release_match.group(1)
    require(release.count("forceEpdPowerLow();") >= 2,
            "GPIO12 must be LOW before and after releasing its hold")
    require("gpio_deep_sleep_hold_dis();" in release and
            "holdReleaseResult = gpio_hold_dis(kEpdPowerPin);" in release,
            "both deep-sleep and per-pin GPIO holds must be released after wake")
    release_order = [release.find(marker) for marker in
                     ("forceEpdPowerLow();", "gpio_deep_sleep_hold_dis();",
                      "holdReleaseResult = gpio_hold_dis(kEpdPowerPin);",
                      "forceEpdPowerLow();", "digitalRead(12) == LOW")]
    # Find the second LOW assertion rather than reusing the first occurrence.
    release_order[3] = release.find("forceEpdPowerLow();", release_order[0] + 1)
    require(all(position >= 0 for position in release_order) and
            release_order == sorted(release_order),
            "hold release must preserve the safe LOW/global/per-pin/LOW/read order")
    require("holdReleaseResult != ESP_OK" in release,
            "GPIO hold-release result must be checked")
require("releaseEpdPowerHoldSafely();" in setup_match.group(1) if setup_match else False,
        "setup() must safely release the retained GPIO12 hold after wake")

require("constexpr uint32_t kRequiredTimerWakes = 3;" in source,
        "exactly three successful timer wakes must be required")
require("rtcTimerWakeCounter == kRequiredTimerWakes" in source,
        "PASS must require equality with the three-wake threshold")
require(source.count("FINAL PASS: three timer deep-sleep wake cycles completed") == 1,
        "the required FINAL PASS message must occur exactly once")
require(re.search(r"RTC_DATA_ATTR\s+uint32_t\s+rtcTimerWakeCounter\s*=\s*0\s*;", source) is not None,
        "the timer-wake counter must use RTC_DATA_ATTR")
rtc_declarations = re.findall(r"RTC_DATA_ATTR\s+[^;]+;", source)
require(len(rtc_declarations) == 1 and "rtcTimerWakeCounter" in rtc_declarations[0],
        "RTC_DATA_ATTR may only be used for the wake counter")

forbidden = (
    r"#\s*include[^\n]*(?:WiFi|Bluetooth|BLE|SPI|GxEPD2|Preferences|EEPROM)",
    r"\b(?:WiFi|Bluetooth|BLEDevice|NimBLE|SPI\.begin|GxEPD2|Preferences|nvs_|"
    r"EEPROM|SPIFFS|LittleFS|FFat|FATFS)\b",
)
for pattern in forbidden:
    require(re.search(pattern, source, re.I) is None,
            "a forbidden radio, display, bus, or persistent-storage API is present")

for pin in (4, 5, 6, 7, 10, 11):
    require(re.search(rf"\b(?:pinMode|digitalWrite|analogWrite|gpio_set_(?:level|direction))"
                      rf"\s*\(\s*(?:GPIO_NUM_)?{pin}\b", source) is None,
            f"protected GPIO{pin} must not be altered")

require("#if !ALFRED_STAGE4_SLEEP_TEST_ARMED" in source and
        "SAFE IDLE: sleep test is unarmed; deep sleep is disabled" in source,
        "the unarmed build must explicitly remain in safe idle")
require("delay(3000)" not in compact, "serial wait must not be an unconditional delay")
require("millis()-serialStart<3000" in compact,
        "native USB Serial must be given up to three seconds after boot")
wait_match = re.search(
    r"void\s+waitWithEpdPowerLow\s*\(unsigned long durationMs\)\s*\{(.*?)\n\}", source, re.S)
require(wait_match is not None and "while (millis() - waitStart < durationMs)" in wait_match.group(1)
        and "forceEpdPowerLow();" in wait_match.group(1),
        "awake waits must repeatedly force GPIO12 LOW")
require("waitWithEpdPowerLow(5000);" in source and "waitWithEpdPowerLow(10000);" in source,
        "both armed awake waits must use the GPIO12-safe wait helper")
require("delay(5000);" not in source and "delay(10000);" not in source,
        "raw armed awake delays are forbidden")

changed = set(subprocess.run(
    ["git", "diff", "--name-only", "HEAD"], cwd=ROOT,
    check=True, capture_output=True, text=True).stdout.splitlines())
changed.update(subprocess.run(
    ["git", "diff", "--name-only", "--cached"], cwd=ROOT,
    check=True, capture_output=True, text=True).stdout.splitlines())
allowed_prefix = "frame/diagnostics/alfred_stage4/"
unexpected = sorted(path for path in changed if not path.startswith(allowed_prefix))
require(not unexpected, "production files or other diagnostics modified: " + ", ".join(unexpected))

if errors:
    print("Alfred Stage 4 static check FAILED:")
    for error in errors:
        print(f"  - {error}")
    sys.exit(1)

print("Alfred Stage 4 static check PASSED")
