#!/usr/bin/env python3
"""Static safety checks for the standalone Alfred Stage 3 diagnostic."""

from pathlib import Path
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
SKETCH = HERE / "Alfred_Stage3_WiFi_Test.ino"
EXAMPLE = HERE / "AlfredStage3Secrets.example.h"
errors: list[str] = []


def require(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


source = SKETCH.read_text(encoding="utf-8")
setup_match = re.search(r"void\s+setup\s*\(\s*\)\s*\{(.*?)\n\}", source, re.S)
require(setup_match is not None, "setup() was not found")
if setup_match:
    setup = setup_match.group(1)
    operations = re.findall(r"\b(?:pinMode|digitalWrite|Serial\.begin|WiFi\.begin)\s*\([^;]*\);", setup)
    require(len(operations) >= 2, "setup() hardware operations are missing")
    if len(operations) >= 2:
        require(re.sub(r"\s+", "", operations[0]) == "pinMode(12,OUTPUT);",
                "the first setup() hardware operation must be pinMode(12, OUTPUT)")
        require(re.sub(r"\s+", "", operations[1]) == "digitalWrite(12,LOW);",
                "the second setup() hardware operation must force GPIO12 LOW")
    low_at = setup.find("digitalWrite(12, LOW);")
    require(low_at >= 0 and low_at < setup.find("Serial.begin"),
            "GPIO12 must be LOW before Serial.begin")
    require(low_at >= 0 and low_at < setup.find("WiFi.begin"),
            "GPIO12 must be LOW before WiFi.begin")

require(not re.search(r"digitalWrite\s*\(\s*(?:12|kEpdPowerPin)\s*,\s*HIGH\s*\)", source),
        "GPIO12 must never be driven HIGH")
require("SPI.begin" not in source, "SPI.begin is forbidden")
require(not re.search(r"#\s*include[^\n]*GxEPD2", source, re.I), "GxEPD2 includes are forbidden")
require(not re.search(r"\b(?:Preferences|nvs_|SPIFFS|LittleFS|FFat|FATFS)\b", source),
        "Preferences, NVS, and flash filesystem use are forbidden")
require(not re.search(r"\b(?:Bluetooth|BLEDevice|NimBLE)\b", source), "Bluetooth is forbidden")
for pin in (4, 5, 6, 7, 10, 11):
    require(not re.search(rf"\b(?:pinMode|digitalWrite|analogWrite)\s*\(\s*{pin}\b", source),
            f"protected GPIO{pin} must not be altered")

example = EXAMPLE.read_text(encoding="utf-8")
require('#define ALFRED_WIFI_SSID "replace-me"' in example, "example SSID must be replace-me")
require('#define ALFRED_WIFI_PASSWORD "replace-me"' in example,
        "example password must be replace-me")
require('#include "AlfredStage3Secrets.h"' in source, "sketch must use the local secrets header")

# Keep the standalone implementation aligned with production without including
# DeviceIdentity, whose persistence behavior is intentionally forbidden here.
production_identity = (ROOT / "frame/src/device/DeviceIdentity.cpp").read_text(encoding="utf-8")
algorithm_markers = (
    "uint64_t mac = ESP.getEfuseMac();",
    "uint32_t hi = (uint32_t)(mac >> 24);",
    "uint32_t lo = (uint32_t)(mac & 0xFFFFFF);",
    '"frm_%06lX%06lX"',
    "(unsigned long)(hi & 0xFFFFFF)",
    "(unsigned long)lo",
)
for marker in algorithm_markers:
    require(marker in production_identity and marker in source,
            f"Stage 3 must reuse production device-ID algorithm marker: {marker}")
require(not re.search(r"return\s+(?:String\s*\()?\s*[\"']frm_88AC499FC114", source),
        "Alfred's device ID must not be hardcoded as a return value")
require(re.search(r"(?:esp_err_t|auto)\s+\w+\s*=\s*esp_read_mac\s*\(", source) is not None,
        "esp_read_mac return value must be captured")
require(re.search(r"\bmacResult\s*==\s*ESP_OK\b", source) is not None,
        "esp_read_mac return value must be checked")

callback_match = re.search(
    r"void\s+onWiFiEvent\s*\([^)]*\)\s*\{(.*?)\n\}\n\nvoid\s+processWiFiEvents", source, re.S)
require(callback_match is not None, "Wi-Fi callback was not found")
if callback_match:
    callback = callback_match.group(1)
    require("portENTER_CRITICAL" in callback and "portEXIT_CRITICAL" in callback,
            "Wi-Fi callback shared state must be protected by a critical section")
    require("WiFi.reconnect" not in callback, "WiFi.reconnect must not run in the callback")
    require("Serial." not in callback, "event printing must be moved out of the callback")
require("portMUX_TYPE" in source and "portMUX_INITIALIZER_UNLOCKED" in source,
        "event-shared state must use a FreeRTOS mutex")
require(re.search(r"void\s+loop\s*\([^)]*\).*?WiFi\.reconnect\s*\(", source, re.S) is not None,
        "WiFi.reconnect must be handled by loop()")

tracked = subprocess.run(
    ["git", "ls-files", str(HERE.relative_to(ROOT))], cwd=ROOT,
    check=True, capture_output=True, text=True).stdout.splitlines()
require(not any(path.endswith("AlfredStage3Secrets.h") for path in tracked),
        "local Wi-Fi credentials file is tracked")
for path in tracked:
    text = (ROOT / path).read_text(encoding="utf-8")
    if path.endswith((".ino", ".h")):
        for value in re.findall(r'#define\s+ALFRED_WIFI_(?:SSID|PASSWORD)\s+"([^"]+)"', text):
            require(value == "replace-me", f"possible committed credential in {path}")

changed = set(subprocess.run(
    ["git", "diff", "--name-only", "HEAD"], cwd=ROOT,
    check=True, capture_output=True, text=True).stdout.splitlines())
changed.update(subprocess.run(
    ["git", "diff", "--name-only", "--cached"], cwd=ROOT,
    check=True, capture_output=True, text=True).stdout.splitlines())
allowed_prefix = "frame/diagnostics/alfred_stage3/"
unexpected = sorted(path for path in changed if path != ".gitignore" and not path.startswith(allowed_prefix))
require(not unexpected, "production or existing diagnostic files modified: " + ", ".join(unexpected))

if errors:
    print("Alfred Stage 3 static check FAILED:")
    for error in errors:
        print(f"  - {error}")
    sys.exit(1)

print("Alfred Stage 3 static check PASSED")
