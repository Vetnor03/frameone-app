#!/usr/bin/env python3
"""Build the familiar Arduino IDE sketch folder from tested V4 News C++."""
from pathlib import Path
from shutil import copy2, rmtree
import hashlib,json

ROOT=Path(__file__).resolve().parents[3]
TEST=ROOT/"frame/tests/news_v4_bw_grid"
OUT=TEST/"arduino-package"
SKETCH=OUT/"frame_v2.5.1"
if OUT.exists():rmtree(OUT)
SKETCH.mkdir(parents=True)

source=(TEST/"src/main.cpp").read_text(encoding="utf-8")
changes={
 '"../../../src/device/HardwareProfile.h"':'"HardwareProfile.h"',
 '"../../../src/assets/fonts/RemindEditorialFonts.h"':'"RemindEditorialFonts.h"',
 '"../../../src/modules/NewsEditorialPreview.h"':'"NewsEditorialPreview.h"',
 'void setup(){':'void newsGridQaSetup(){',
 'void loop(){':'void newsGridQaLoop(){',
}
for before,after in changes.items():
    if source.count(before)!=1:
        raise SystemExit(f"Missing or ambiguous source anchor: {before}")
    source=source.replace(before,after)
(SKETCH/"NewsGridQA.cpp").write_text(source,encoding="utf-8")
(SKETCH/"frame_v2.5.1.ino").write_text(
 '#include <Arduino.h>\n'
 '// RE:MIND News R2 B/W V4 GRID QA — USB TEST ONLY, no OTA.\n'
 'void newsGridQaSetup();\nvoid newsGridQaLoop();\n'
 'void setup(){newsGridQaSetup();}\n'
 'void loop(){newsGridQaLoop();}\n',encoding="utf-8")

paths=[
 "frame/src/device/HardwareProfile.h",
 "frame/src/modules/NewsEditorialPreview.h",
 "frame/src/assets/fonts/RemindEditorialFonts.h",
 "frame/src/assets/fonts/RemindEditorialFonts.cpp",
]
for p in paths:
    copy2(ROOT/p,SKETCH/Path(p).name)
copy2(ROOT/"frame/partitions_alfred_16mb.csv",SKETCH/"partitions.csv")
copy2(TEST/"README.md",SKETCH/"README_NEWS_R2_16_GRID.txt")

files=sorted(f for f in SKETCH.iterdir() if f.is_file())
assert len(files)==8,[x.name for x in files]
assert (SKETCH/"frame_v2.5.1.ino").is_file()
assert (SKETCH/"NewsGridQA.cpp").is_file()
assert (SKETCH/"NewsEditorialPreview.h").is_file()
assert (SKETCH/"partitions.csv").is_file()
assert b"newsEditorialLozenge" in (SKETCH/"NewsEditorialPreview.h").read_bytes()
manifest={
  "project":"RE:MIND News R2 physical V4 QA",
  "entrypoint":"frame_v2.5.1/frame_v2.5.1.ino",
  "variant":"black-white, original GxEPD2, 1–16 Serial, L/D",
  "source_files":{p.name:hashlib.sha256(p.read_bytes()).hexdigest()
                  for p in files},
}
(OUT/"SHA256_MANIFEST.json").write_text(json.dumps(manifest,indent=2)+"\n")
print("Arduino IDE V4 News QA prepared:",[p.name for p in files])
