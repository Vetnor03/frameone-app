#!/usr/bin/env python3
"""Create a Surf-style Arduino IDE source ZIP (no grayscale or flashing)."""
from pathlib import Path
from shutil import copy2, rmtree
import hashlib,json
ROOT=Path(__file__).resolve().parents[3]
TEST=ROOT/"frame/tests/reminders_v4_bw_grid"
OUT=TEST/"arduino-package"
SKETCH=OUT/"frame_v2.5.1"
if OUT.exists():rmtree(OUT)
SKETCH.mkdir(parents=True)
source=(TEST/"src/main.cpp").read_text(encoding="utf-8")
changes={
 '"../../../src/device/HardwareProfile.h"':'"HardwareProfile.h"',
 '"../../../src/assets/fonts/RemindEditorialFonts.h"':'"RemindEditorialFonts.h"',
 '"../../../src/assets/fonts/FreeSans9ptNO.h"':'"FreeSans9ptNO.h"',
 '"../../../src/modules/RemindersEditorialPreview.h"':'"RemindersEditorialPreview.h"',
 'void setup() {':'void remindersGridQaSetup() {',
 'void loop() {':'void remindersGridQaLoop() {'
}
for old,new in changes.items():
    if source.count(old)!=1:raise SystemExit(f"Required unique source anchor missing: {old}")
    source=source.replace(old,new)
(SKETCH/"RemindersGridQA.cpp").write_text(source,encoding="utf-8")
(SKETCH/"frame_v2.5.1.ino").write_text(
 "#include <Arduino.h>\n"
 "// RE:MIND V4 REMINDERS B/W GRID QA — NOT PRODUCTION FIRMWARE.\n"
 "void remindersGridQaSetup();\nvoid remindersGridQaLoop();\n"
 "void setup(){remindersGridQaSetup();}\n"
 "void loop(){remindersGridQaLoop();}\n",encoding="utf-8")
for path in [
 "frame/src/device/HardwareProfile.h",
 "frame/src/modules/RemindersEditorialPreview.h",
 "frame/src/assets/fonts/RemindEditorialFonts.h",
 "frame/src/assets/fonts/RemindEditorialFonts.cpp",
 "frame/src/assets/fonts/FreeSans9ptNO.h"
]:
 copy2(ROOT/path,SKETCH/Path(path).name)
copy2(ROOT/"frame/partitions_alfred_16mb.csv",SKETCH/"partitions.csv")
copy2(TEST/"README.md",SKETCH/"README_REMINDERS_16_GRID_QA.txt")
files=list(SKETCH.glob("*"))
assert len(files)==9 and all(f.is_file() for f in files)
manifest={f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in files}
(OUT/"SHA256_MANIFEST.json").write_text(json.dumps(manifest,indent=2))
print("Arduino sketch packaged:",[f.name for f in files])
