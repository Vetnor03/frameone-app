RE:MIND REMINDERS R3.2 — BLACK/WHITE 16-SIZE GRID QA
=====================================================
The SAME workflow as the SURF 16 SERIAL QA Arduino IDE sketch.

Open: frame_v2.5.1/frame_v2.5.1.ino
Board: ESP32S3 Dev Module (Alfred V4 ESP32-S3, 16MB QIO, OPI PSRAM)
Display: 7.5-inch 800x480, original GxEPD2 1-bit driver
Use original V4 partitions.csv (app0 at 0x10000, app1 at 0x610000).
No 'Erase All Flash'. Use only a designated USB V4 test frame.

IMPORTANT: This sketch REPLACES the ordinary app temporarily.
There is no Wi-Fi, live data, Skip, sync or API here. It ONLY runs
the exact experimental C++ Reminders design with fixed test samples.
Restore normal firmware afterwards. Don't overwrite NVS or OTA data.

SERIAL MONITOR: 115200 baud, Newline (LF).
Write ONLY the number and Enter to change size:
   1=1x1   2=1x2   3=1x3   4=1x4
   5=2x1   6=2x2   7=2x3   8=2x4
   9=3x1  10=3x2  11=3x3  12=3x4
  13=4x1  14=4x2  15=4x3  16=4x4

L = Light (white background, black text)
D = Dark  (black background, white text)
T = toggle Light/Dark; N=next; P=previous
Optional: scene normal | few | many | long | tomorrow | norwegian | empty
Optional: render | status | help

The ENTIRE four-by-four grid is drawn on every frame (dashed
gridlines every 200×120 px). The current top-left anchored geometry
gets a thicker double border. This makes overflow outside active
cells visible. If experimental layout preflight fails, "PREVIEW
FALLBACK" is shown instead of pretending the legacy renderer is present.

TEST: Inspect all 16 sizes in both Light and Dark, checking texts do
not cross highlighted selection border. This is a PHYSICAL QA test;
no production approval until owner has reviewed the real e-paper.
No production Date, Weather or Surf changes. No OTA/merge/auto-flash.

LIBRARIES (same as typical Surf QA):
GxEPD2 v1.6.4, Adafruit GFX and Adafruit BusIO.
Verify the Arduino IDE uses your original V4 partition table and
hardware profile; do not upload if it has selected a generic default
partition table instead of the included V4 partitions.csv.


COMPILER TROUBLESHOOTING (ARDUINO ESP32 CORE 3.3.11)
---------------------------------------------------
If compile/link reports repeated 'multiple definition of GxEPD2_...' errors
and lists BOTH libraries GxEPD2 and GxEPD2_4G:
1. Close Arduino IDE.
2. Move the OLD experiment folder out of the Arduino libraries directory:
   C:\\Users\\<your-user>\\Documents\\Arduino\\libraries\\GxEPD2_4G
   (e.g. move to Desktop as a backup; do NOT move it merely to another
   subfolder under Arduino\\libraries).
3. KEEP the normal GxEPD2 library installed. Restart Arduino IDE.
4. Compile again. At end, only GxEPD2 should be listed, not GxEPD2_4G.
These duplicate-symbol errors arise in the user's library setup, NOT the
Reminders layout renderer. No firmware or design change is required.

BEFORE UPLOADING: In Tools > Partition Scheme choose Custom, confirm the
included frame_v2.5.1/partitions.csv is used, and compare the generated
partition table against the existing V4 table (app0 0x10000, app1 0x610000,
NVS 0x9000). Log showing PartitionScheme=fatflash is a warning to CHECK;
a local partitions.csv may override the menu choice in Arduino core 3.3.11,
but do not assume that without verifying build output. Do not Erase All
Flash and do not upload until partition compatibility is established.
