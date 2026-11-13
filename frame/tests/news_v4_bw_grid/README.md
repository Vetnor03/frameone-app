RE:MIND NEWS R2 — BLACK/WHITE V4 16-LAYOUT SERIAL QA
=================================================

This is a TEST-ONLY Arduino IDE sketch, in the SAME format as the
previous Surf and Reminders V4 16-layout QA ZIP packages.

1. Extract ZIP and open frame_v2.5.1/frame_v2.5.1.ino in Arduino IDE.
2. Keep original ESP32-S3 Alfred V4 settings. GxEPD2 v1.6.4,
   Adafruit GFX v1.12.6, BusIO v1.17.4. ESP32 core 3.3.11.
3. Check:
   - Board: ESP32S3 Dev Module, 240 MHz
   - Flash: 16 MB, QIO 80 MHz
   - PSRAM: OPI PSRAM
   - USB CDC On Boot: Enabled
   - IMPORTANT: partitions.csv in sketch folder MUST be used:
     app0 0x10000, app1 0x610000 (Alfred original V4 map).
   - Erase All Flash Before Sketch Upload: DISABLED.
4. Verify compilation BEFORE uploading. Only use the intended V4
   USB-connected test frame after confirming the partition map
   and that you can restore the normal production firmware.
5. Open Serial Monitor at 115200 baud and set Line ending: Newline.

If GxEPD2 and the OLD GxEPD2_4G libraries both compile and the
build reports "multiple definition of GxEPD2_...", CLOSE Arduino
IDE, move GxEPD2_4G OUT of your Arduino/libraries folder, then
reopen Arduino IDE. Keep the ordinary GxEPD2 library.
Do NOT erase the whole flash to resolve compiler errors.

Serial commands — exact Surf/Reminders numbering:
    1 = 1x1     5 = 2x1     9 = 3x1    13 = 4x1
    2 = 1x2     6 = 2x2    10 = 3x2    14 = 4x2
    3 = 1x3     7 = 2x3    11 = 3x3    15 = 4x3
    4 = 1x4     8 = 2x4    12 = 3x4    16 = 4x4

    L      = Light: white background, black text
    D      = Dark: black background, white text
    T      = Toggle theme
    N / P  = next / previous geometry
    render = refresh current sample
    status = current geometry and rendering info
    help   = print help

Optional sample sets:
    scene normal        = four varied headlines (initial sample)
    scene one           = single large headline
    scene two           = two headlines
    scene six           = six headlines
    scene fourteen      = 14 articles (full fetched max)
    scene long          = long complete titles
    scene norwegian     = ÆØÅ æøå and diacritics
    scene english       = English label and titles
    scene unbreakable   = single long unbreakable word
    scene empty         = empty feed
    scene unavailable   = unavailable feed

Four-by-four 200x120px grid dotted lines are visible across the
ENTIRE 800x480 screen. A DOUBLE BORDER outlines the active top-left
rectangle. Actual News content is pre-rendered within a dedicated
1-bit canvas limited to the current active rectangle. Serial Monitor
also reports pixels attempted outside the active rectangle.

This test includes the exact experimental NewsEditorialPreview.h
and original approved Fraunces/DM Sans 1-bit fonts; rendering and
small editorial lozenge bullets are REAL C++, not mockups.

IMPORTANT SCOPE / RESTORE
-------------------------
The TEST has only offline sample headlines. It DOES NOT fetch live NRK
articles or exercise live API, feed selection, caching, update rules,
time sync or product backend. Unsupported title cases explicitly show
PREVIEW FALLBACK; this test does NOT contain the old legacy renderer.

Flashing it TEMPORARILY REPLACES THE NORMAL APPLICATION on this frame.
The test does not write NVS settings, API, WiFi credentials or OTA;
however firmware must be restored afterwards without erasing flash.
USB power is required for each full refresh. Do not flash on battery.

No production merge, OTA or automatic device flashing was performed
when this ZIP was built. This physical test is not yet module lock.
Date, Weather, Surf and Reminders production modules are untouched.
