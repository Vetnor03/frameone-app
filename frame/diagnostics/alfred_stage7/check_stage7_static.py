#!/usr/bin/env python3
"""Static safety/isolation checks for the standalone Alfred Stage 7 diagnostic."""

from pathlib import Path
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SKETCH = HERE / "Alfred_Stage7_Power_Path_Test.ino"
EXAMPLE = HERE / "AlfredStage7Secrets.example.h"
errors: list[str] = []


def require(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


source = SKETCH.read_text(encoding="utf-8")
compact = re.sub(r"\s+", "", source)
require("#defineALFRED_STAGE7_POWER_PATH_TEST_ARMED0" in compact, "arm must default to 0")

setup_match = re.search(r"void\s+setup\s*\(\s*\)\s*\{(.*?)\n\}", source, re.S)
require(setup_match is not None, "setup() missing")
if setup_match:
    setup = setup_match.group(1)
    operations = re.findall(r"\b(?:pinMode|digitalWrite|Serial\.begin|WiFi\.(?:persistent|onEvent|mode|begin))\s*\([^;]*\);", setup)
    require(len(operations) >= 2 and re.sub(r"\s+", "", operations[0]) == "pinMode(12,OUTPUT);",
            "first setup hardware operation must be pinMode(12, OUTPUT)")
    require(len(operations) >= 2 and re.sub(r"\s+", "", operations[1]) == "digitalWrite(12,LOW);",
            "second setup hardware operation must be digitalWrite(12, LOW)")
    require(re.search(r"pinMode\s*\(\s*17\s*,\s*INPUT\s*\)", setup) is not None, "GPIO17 must be INPUT")
    require(re.search(r"pinMode\s*\(\s*18\s*,\s*INPUT\s*\)", setup) is not None, "GPIO18 must be INPUT")
    low = setup.find("digitalWrite(12, LOW);")
    require(0 <= low < setup.find("Serial.begin"), "GPIO12 LOW must precede Serial")
    require(0 <= low < setup.find("WiFi.persistent"), "GPIO12 LOW must precede Wi-Fi")

require(not re.search(r"digitalWrite\s*\(\s*(?:12|kEpdPowerPin)\s*,\s*HIGH", source), "GPIO12 is driven HIGH")
require(source.count("digitalWrite(kEpdPowerPin, LOW);") >= 2, "GPIO12 LOW is not continuously reasserted")
for pin, name in ((17, "kPgoodPin"), (18, "kChargePin")):
    require(not re.search(rf"pinMode\s*\(\s*(?:{pin}|{name})\s*,\s*(?:OUTPUT|INPUT_PULL\w*)", source),
            f"GPIO{pin} is not input-only")
for pin in (4, 5, 6, 7, 10, 11):
    require(not re.search(rf"\b(?:pinMode|digitalWrite|analogWrite|analogRead)\s*\(\s*{pin}\b", source),
            f"protected GPIO{pin} is altered")

for pattern, label in (
    (r"#\s*include\s*[<\"]SPI(?:\.h)?[>\"]|\bSPI\.", "SPI"),
    (r"GxEPD|display", "display library"),
    (r"#\s*include\s*[<\"]Wire(?:\.h)?[>\"]|\bWire\.", "I2C"),
    (r"MAX17048", "MAX17048"), (r"\bPreferences\b|\bnvs_", "NVS"),
    (r"\bEEPROM\b", "EEPROM"), (r"\b(?:SPIFFS|LittleFS|FFat|FATFS|File)\b", "filesystem"),
    (r"\b(?:Bluetooth|BLEDevice|NimBLE)\b", "Bluetooth"),
    (r"\b(?:ESP\.restart|esp_restart)\s*\(", "automatic reboot"),
):
    require(not re.search(pattern, source, re.I), f"forbidden {label} use found")

persist = source.find("WiFi.persistent(false);")
require(persist >= 0 and persist < source.find("WiFi.mode(") and persist < source.find("WiFi.begin("),
        "WiFi.persistent(false) must precede mode/begin")
callback = re.search(r"void\s+onWiFiEvent\s*\([^)]*\)\s*\{(.*?)\n\}", source, re.S)
require(callback is not None, "Wi-Fi callback missing")
if callback:
    body = callback.group(1)
    require("portENTER_CRITICAL" in body and "portEXIT_CRITICAL" in body, "callback is not mutex protected")
    require(not re.search(r"WiFi\.(?:reconnect|begin)|Serial\.", body), "callback performs unsafe work")
require("WiFi.setSleep(false);" in source, "armed STA load must disable Wi-Fi sleep")
require("RTC_NOINIT_ATTR RtcRecord rtc;" in source and
        not re.search(r"RTC_NOINIT_ATTR\s+RtcRecord\s+rtc\s*=", source),
        "reset/history record must use no-init RTC retention without an initializer")
require("history[kHistorySize]" in source and "kHistorySize = 48" in source,
        "at least 32 transitions must be retained in RTC RAM")
require("rtc.unexpectedReset = true" in source and "rtc.running" in source, "RTC reset detection missing")
require(not re.search(r"(?:Preferences|EEPROM|nvs_|File).*unexpectedReset", source, re.I | re.S),
        "reset detection appears to use flash")
magic_check = source.find("bool retainedMagicFound = rtc.magic == kRtcMagic;")
first_other_use = source.find("rtc.running", magic_check)
require(magic_check >= 0 and first_other_use > magic_check and
        source.find("memset(&rtc, 0, sizeof(rtc));", magic_check) > magic_check and
        "retainedMagicFound && rtc.count <= kHistorySize && rtc.next < kHistorySize" in source,
        "magic must be checked before retained contents are trusted")
require("associationInProgress" in source and
        re.search(r"portENTER_CRITICAL.*?associationInProgress.*?portEXIT_CRITICAL", source, re.S),
        "reconnect-in-progress state must be protected")
require(re.search(r"if \(wifiEvents\.reconnectNeeded && !wifiEvents\.associationInProgress.*?"
                  r"wifiEvents\.associationInProgress = true;.*?wifiEvents\.reconnectNeeded = false;", source, re.S),
        "reconnect eligibility and in-progress claim must be atomic")
require("bool accepted = WiFi.reconnect();" in source and "if (!accepted)" in source,
        "WiFi.reconnect return value must be checked")
require("kReconnectAttemptTimeoutMs = 15000" in source and
        "now - reconnectAttemptStartedMs >= kReconnectAttemptTimeoutMs" in source,
        "reconnect attempt timeout missing")
require("++rtc.sourceGeneration;" in source and
        "rtc.wifiRecoveredGeneration == rtc.sourceGeneration" in source,
        "unexpected reset can falsely report Wi-Fi recovery from volatile counters")
require("bool currentConnectionHasValidIp;" in source and
        "currentConnectionHasValidIp = false;" in source and
        "currentConnectionHasValidIp = true;" in source,
        "main loop must invalidate DISCONNECTED and validate only a consumed GOT_IP")
require("disconnectedSequence > gotIpSequence" in source,
        "coalesced DISCONNECTED/GOT_IP events must be resolved in event order")
require(re.search(r"if \(currentConnectionHasValidIp && WiFi\.status\(\) == WL_CONNECTED\)\s*\{\s*"
                  r"rtc\.wifiRecoveredGeneration = rtc\.sourceGeneration;", source),
        "a continuously connected, already-valid Wi-Fi session must satisfy a source transition")
require(not re.search(r"bool\s+currentConnectionHasValidIp\s*=\s*true", source) and
        source.find("currentConnectionHasValidIp = true;") > source.find("if (gotIp)"),
        "fresh boot must not claim recovery before a consumed GOT_IP")
require(re.search(r"currentConnectionHasValidIp && WiFi\.status\(\) == WL_CONNECTED &&\s*"
                  r"rtc\.wifiRecoveredGeneration == rtc\.sourceGeneration", source),
        "report must require current valid IP, connected status, and generation equality")
timeout = re.search(r"portENTER_CRITICAL\(&wifiMux\);\s*// Re-check live state.*?"
                    r"if \(wifiEvents\.associationInProgress &&.*?kReconnectAttemptTimeoutMs", source, re.S)
require(timeout is not None, "timeout must re-check live association state under wifiMux")
reconnect_call = source.find("bool accepted = WiFi.reconnect();")
exit_before_call = source.rfind("portEXIT_CRITICAL(&wifiMux);", 0, reconnect_call)
enter_before_call = source.rfind("portENTER_CRITICAL(&wifiMux);", 0, reconnect_call)
require(reconnect_call >= 0 and exit_before_call > enter_before_call,
        "WiFi.reconnect must execute outside wifiMux")
require("wifiEvents.stateVersion == claimedStateVersion" in source and
        "any newer callback state wins" in source,
        "failed reconnect must not overwrite a newer GOT_IP callback")
require("rtc.count <= kHistorySize" in source and "rtc.next < kHistorySize" in source and
        source.find("rtc.count <= kHistorySize") < source.find("retainedHistoryEntriesAtBoot ="),
        "retained ring bounds must be validated before history is trusted")
begin_at = source.find("WiFi.begin(")
initial_timer_at = source.rfind("reconnectAttemptStartedMs = millis();", 0, begin_at)
require(begin_at >= 0 and initial_timer_at >= 0 and initial_timer_at < begin_at,
        "initial WiFi.begin association must initialize its timeout timestamp")
require("Retained RTC record found at this boot" in source and
        "Transition history entries retained at boot" in source and
        "retainedHistoryEntriesAtBoot" in source and
        "Transition history preserved" not in source,
        "history report must distinguish retained-at-boot from current magic validity")

example = EXAMPLE.read_text(encoding="utf-8")
require('#define ALFRED_WIFI_SSID "replace-me"' in example, "SSID template mismatch")
require('#define ALFRED_WIFI_PASSWORD "replace-me"' in example, "password template mismatch")
require('#include "AlfredStage7Secrets.h"' in source, "ignored local secrets header is not included")
ignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
require("frame/diagnostics/alfred_stage7/AlfredStage7Secrets.h" in ignore, "local secrets header is not ignored")

tracked = subprocess.run(["git", "ls-files"], cwd=ROOT, check=True, capture_output=True, text=True).stdout.splitlines()
require(not any(path.endswith("AlfredStage7Secrets.h") for path in tracked), "local secrets header is tracked")
changed = set(subprocess.run(["git", "diff", "--name-only", "HEAD"], cwd=ROOT, check=True,
                             capture_output=True, text=True).stdout.splitlines())
changed.update(subprocess.run(["git", "ls-files", "--others", "--exclude-standard"], cwd=ROOT, check=True,
                              capture_output=True, text=True).stdout.splitlines())
allowed = {".gitignore"}
unexpected = sorted(path for path in changed if path not in allowed and not path.startswith("frame/diagnostics/alfred_stage7/"))
require(not unexpected, "production or other diagnostic files modified: " + ", ".join(unexpected))

if errors:
    print("Alfred Stage 7 static check FAILED:")
    for error in errors:
        print(f"  - {error}")
    sys.exit(1)
print("Alfred Stage 7 static check PASSED")
