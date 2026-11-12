#!/usr/bin/env python3
"""Package the VERIFIED 4G test as the same Arduino IDE ZIP layout as Surf QA.

Source is from the isolated grayscale branch, not the older Surf QA sample.
The only text transformations are include paths and entrypoint names so the
Arduino IDE compiles its normal matching .ino, with implementation in .cpp.
"""
from pathlib import Path
from shutil import copy2, copytree, rmtree
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib
import json

ROOT=Path(__file__).resolve().parents[3]
TEST=ROOT/"frame/tests/reminders_v4_gray"
OUT=TEST/"arduino-package"
SKETCH=OUT/"frame_v2.5.1"
SRC=TEST/"src/main.cpp"

if OUT.exists():
    rmtree(OUT)
SKETCH.mkdir(parents=True)
text=SRC.read_text(encoding="utf-8")
changes={
    '"../../../src/device/HardwareProfile.h"': '"HardwareProfile.h"',
    '"../../../src/assets/fonts/RemindEditorialFonts.h"': '"RemindEditorialFonts.h"',
    '"../../../src/assets/fonts/FreeSans9ptNO.h"': '"FreeSans9ptNO.h"',
    '"../../../src/modules/RemindersEditorialPreview.h"': '"RemindersEditorialPreview.h"',
    'void setup() {': 'void grayscaleQaSetup() {',
    'void loop() {': 'void grayscaleQaLoop() {',
}
for old,new in changes.items():
    if text.count(old)!=1:
        raise SystemExit(f"Cannot pack: required unique anchor missing: {old}")
    text=text.replace(old,new)
(SKETCH/"RemindersGrayQA.cpp").write_text(text,encoding="utf-8")
(SKETCH/"frame_v2.5.1.ino").write_text(
    '#include <Arduino.h>\n'
    '// RE:MIND Reminders V4 TRUE four-greyscale SERIAL QA (NOT production).\n'
    '// This is the familiar Arduino IDE sketch entrypoint. All original\n'
    '// C++ Reminders layout and fonts live in the accompanying .cpp files.\n'
    'void grayscaleQaSetup();\nvoid grayscaleQaLoop();\n'
    'void setup() { grayscaleQaSetup(); }\n'
    'void loop() { grayscaleQaLoop(); }\n',
    encoding="utf-8")
for path in [
    "frame/src/device/HardwareProfile.h",
    "frame/src/modules/RemindersEditorialPreview.h",
    "frame/src/assets/fonts/RemindEditorialFonts.h",
    "frame/src/assets/fonts/RemindEditorialFonts.cpp",
    "frame/src/assets/fonts/FreeSans9ptNO.h",
]:
    copy2(ROOT/path,SKETCH/Path(path).name)
copy2(ROOT/"frame/partitions_alfred_16mb.csv",SKETCH/"partitions.csv")
copy2(TEST/"README.md",SKETCH/"README_GREYSCALE_SERIAL_QA.txt")
(SKETCH/"README_FLASH.txt").write_text(
    "RE:MIND V4 - TRUE 4 GREY LEVELS / REMINDERS QA\n"
    "=================================================\n\n"
    "This is the familiar Arduino IDE sketch ZIP format, like your Surf QA.\n"
    "Open frame_v2.5.1/frame_v2.5.1.ino in Arduino IDE.\n\n"
    "BOARD/IDE SETTINGS\n"
    "Board: ESP32S3 Dev Module\n"
    "ESP32 by Espressif Systems core: 3.3.11\n"
    "CPU Frequency: 240MHz\n"
    "Flash Size: 16MB (128Mb)\n"
    "Flash Mode: QIO 80MHz\n"
    "Partition Scheme: Custom, from the INCLUDED partitions.csv\n"
    "PSRAM: OPI PSRAM\n"
    "USB Mode: Hardware CDC and JTAG\n"
    "USB CDC On Boot: Enabled\n"
    "Upload Mode: UART0 / Hardware CDC\n"
    "Erase All Flash Before Sketch Upload: DISABLED\n"
    "Serial Monitor: 115200 baud, Newline (LF)\n\n"
    "LIBRARIES\n"
    "Adafruit GFX 1.12.6 and Adafruit BusIO 1.17.4 (as usual)\n"
    "GxEPD2_4G 1.0.9 (NEW): Install bundled separate\n"
    "GxEPD2_4G_ARDUINO_LIBRARY.zip from Sketch > Include Library > Add ZIP.\n"
    "The 4G driver is intentionally separate from the normal GxEPD2 library.\n\n"
    "SAFETY AND SCOPE\n"
    "This is USB-only, standalone OFFLINE visual test, not production firmware.\n"
    "Use only on your designated V4 test frame after confirming a safe restore\n"
    "path to normal firmware. Uploading a sketch overwrites application code;\n"
    "do not erase all flash. The sketch never writes NVS, settings or OTA.\n"
    "The identical production partition table is included so the Arduino IDE\n"
    "does not replace the partition layout with the default 1.9MB OTA layout.\n"
    "If the IDE does not use this exact partitions.csv, DO NOT upload.\n"
    "No Skip, backend, OTA or scheduled synchronization are exercised in this\n"
    "offline test. It uses the ORIGINAL RemindersEditorialPreview.h and fonts.\n\n"
    "SERIAL COMMANDS\n"
    "levels = all 4 REAL grey bands\n"
    "bg 0 / bg 1 / bg 2 / bg 3 = white/light-grey/dark-grey/black\n"
    "  (automatic black ink on 0/1 and white ink on 2/3)\n"
    "size 1x1 .. size 4x4 = 16 shapes\n"
    "next / prev = cycle\n"
    "scene normal / few / many / long / tomorrow / norwegian / empty\n"
    "render = repeat full refresh; help; status\n\n"
    "NO OTA, NO merge, NO automatic upload. Physical 4-grey waveform behavior\n"
    "is experimental and must be judged on the actual panel before production.\n",
    encoding="utf-8")

# Include installable upstream 4G library in the SAME single artifact ZIP.
LIB=TEST/".pio/libdeps/v4_gray_qa/GxEPD2_4G"
if not (LIB/"library.properties").is_file():
    raise SystemExit(f"GxEPD2_4G not installed by tested PlatformIO build: {LIB}")
LIBZIP=OUT/"GxEPD2_4G_ARDUINO_LIBRARY.zip"
with ZipFile(LIBZIP,"w",ZIP_DEFLATED,compresslevel=6) as z:
    for file in LIB.rglob("*"):
        if file.is_file() and not any(x in {".git",".pio",".github"} for x in file.parts):
            z.write(file,Path("GxEPD2_4G")/file.relative_to(LIB))

# Additional metadata, no keys/token IDs.
names=sorted(p.name for p in SKETCH.iterdir() if p.is_file())
assert "frame_v2.5.1.ino" in names and "RemindersGrayQA.cpp" in names
assert "partitions.csv" in names and "RemindersEditorialPreview.h" in names
assert "RemindEditorialFonts.cpp" in names
manifest={
    "sketch_folder":"frame_v2.5.1",
    "entrypoint":"frame_v2.5.1/frame_v2.5.1.ino",
    "arduino_core":"esp32 3.3.11",
    "target":"Alfred V4, ESP32-S3, GDEW075T7 800x480",
    "mode":"offline manual 4-level grayscale QA, serial controls",
    "required_4g_library_zip":LIBZIP.name,
    "files":{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in SKETCH.iterdir() if p.is_file()},
}
(OUT/"MANIFEST.json").write_text(json.dumps(manifest,indent=2)+"\n")
print(f"Prepared Arduino IDE source package: {len(names)} sketch files")
print(f"Bundled GxEPD2_4G driver: {LIBZIP.stat().st_size} bytes")
print("Open frame_v2.5.1/frame_v2.5.1.ino, NOT a .bin or a flash script.")
