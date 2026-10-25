#include "TypographyAudit.h"
#include "Config.h"

#if TYPOGRAPHY_AUDIT_ENABLED

#include "DisplayCore.h"
#include "FrameText.h"
#include "HardwareProfile.h"
#include "FreeSans9ptNO.h"
#include "FreeSans12ptNO.h"
#include "FreeSansBold12ptNO.h"
#include "FreeSansBold18ptNO.h"
#include <Fonts/FreeSansBold24pt7b.h>
#include <Fonts/FreeSerif9pt7b.h>
#include <Fonts/FreeSerif12pt7b.h>
#include <Fonts/FreeSerif18pt7b.h>
#include <Fonts/FreeSerifBold18pt7b.h>
#include <Fonts/FreeSerifBold24pt7b.h>
#if TYPOGRAPHY_CANDIDATE_FONTS_ENABLED
#include "EditorialCandidates.h"
#endif
#include <Arduino.h>

#if !defined(FRAME_IS_ALFRED_V1_2)
#error Typography audit must only be compiled for Alfred V1.2 hardware
#endif

namespace {
constexpr int kWidth = 800;
constexpr int kHeight = 480;
uint8_t currentPage = 0;
bool usbConnected = false;
#if TYPOGRAPHY_CANDIDATE_FONTS_ENABLED
constexpr uint8_t kPageCount = 6;
#else
constexpr uint8_t kPageCount = 4;
#endif

struct Sample {
  const char* label;
  const char* value;
  const GFXfont* font;
  bool norwegian; // Only project Latin-1 fonts can show Æ Ø Å / æ ø å.
};

void text(int x, int y, int w, int h, const char* value,
          const GFXfont* font, uint16_t ink, bool norwegian = false,
          bool centered = true) {
  auto& d = DisplayCore::get();
  char converted[192] = {0};
  if (norwegian)
    FrameText::normalizeUtf8ForDisplay(converted, sizeof(converted), value);
  else
    strlcpy(converted, value, sizeof(converted));

  d.setFont(font);
  d.setTextSize(1); // Never artificially scale glyph bitmaps.
  d.setTextColor(ink);
  int16_t bx = 0, by = 0;
  uint16_t tw = 0, th = 0;
  d.getTextBounds(converted, 0, 0, &bx, &by, &tw, &th);
  const int drawX = x + (centered ? (w - (int)tw) / 2 : 0) - bx;
  const int drawY = y + (h - (int)th) / 2 - by;
  d.setCursor(drawX, drawY);
  d.print(converted);
  d.setFont(nullptr);
}

void rule(int x1, int y1, int x2, int y2, uint16_t color) {
  DisplayCore::get().drawLine(x1, y1, x2, y2, color);
}

void heading(const char* title, const char* subtitle, uint16_t ink) {
  text(24, 9, 752, 35, title, &FreeSansBold12pt8b, ink);
  text(24, 43, 752, 25, subtitle, &FreeSans9pt8b, ink);
  rule(24, 70, 776, 70, ink);
}

void pageFamilies() {
  auto& d = DisplayCore::get();
  d.fillScreen(GxEPD_WHITE);
  const uint16_t ink = GxEPD_BLACK;
  heading(
#if TYPOGRAPHY_CANDIDATE_FONTS_ENABLED
    "RE:MIND | FONT CALIBRATION 1/6",
#else
    "RE:MIND | FONT CALIBRATION 1/4",
#endif
    "Actual 800 x 480 pixels. Compare stroke weight, personality and spacing.", ink);
  text(28, 75, 352, 32, "SANS | NORWEGIAN", &FreeSansBold12pt8b, ink);
  text(420, 75, 352, 32, "SERIF | ASCII ONLY", &FreeSansBold12pt8b, ink);
  rule(396, 80, 396, 446, ink);
  const Sample sans[] = {
    {"REGULAR 9 PT", "Fredag kl. 12:30", &FreeSans9pt8b, true},
    {"REGULAR 12 PT", "Neste avtale", &FreeSans12ptNO8b, true},
    {"BOLD 12 PT", "Kontrolltime", &FreeSansBold12pt8b, true},
    {"BOLD 18 PT", "12 grader", &FreeSansBold18pt8b, true},
    {"BOLD 18 PT", "Æ Ø Å  æ ø å", &FreeSansBold18pt8b, true},
  };
  const Sample serif[] = {
    {"REGULAR 9 PT", "Friday at 12:30", &FreeSerif9pt7b, false},
    {"REGULAR 12 PT", "Next appointment", &FreeSerif12pt7b, false},
    {"REGULAR 18 PT", "Kontrolltime", &FreeSerif18pt7b, false},
    {"BOLD 18 PT", "12 degrees", &FreeSerifBold18pt7b, false},
    {"BOLD 24 PT", "24", &FreeSerifBold24pt7b, false},
  };
  for (int i = 0; i < 5; ++i) {
    const int y = 112 + i * 66;
    text(30, y, 346, 15, sans[i].label, &FreeSans9pt8b, ink, false, false);
    text(30, y + 13, 346, 44, sans[i].value, sans[i].font, ink, sans[i].norwegian);
    text(420, y, 346, 15, serif[i].label, &FreeSans9pt8b, ink, false, false);
    text(420, y + 13, 346, 44, serif[i].value, serif[i].font, ink);
    if (i < 4) {
      rule(32, y + 61, 371, y + 61, ink);
      rule(424, y + 61, 763, y + 61, ink);
    }
  }
  // Keep calibration captions inside the visible passepartout opening.
  text(25, 435, 750, 20, "Stock serif: ASCII only. Premium tests on pages 5 and 6 support AE/O/A.",
       &FreeSans9pt8b, ink);
}

void pageDistance() {
  auto& d = DisplayCore::get();
  d.fillScreen(GxEPD_WHITE);
  heading(
#if TYPOGRAPHY_CANDIDATE_FONTS_ENABLED
    "RE:MIND | DISTANCE TEST 2/6",
#else
    "RE:MIND | DISTANCE TEST 2/4",
#endif
    "Read from 0.5 m, then 1 m, then 2 m. Record the smallest COMFORTABLE size.", GxEPD_BLACK);
  const struct Row {
    const char* name;
    const char* sample;
    const GFXfont* font;
    bool norwegian;
  } rows[] = {
    {"9 PT", "Kontrolltime Aleris", &FreeSans9pt8b, true},
    {"12 PT", "Kontrolltime Aleris", &FreeSans12ptNO8b, true},
    {"18 PT BOLD", "Kontrolltime Aleris", &FreeSansBold18pt8b, true},
    {"24 PT BOLD", "Kontrolltime Aleris", &FreeSansBold24pt7b, false},
  };
  for (int i = 0; i < 4; ++i) {
    const int y = 90 + i * 88;
    text(22, y, 142, 35, rows[i].name, &FreeSansBold12pt8b, GxEPD_BLACK, false, false);
    text(178, y - 8, 595, 65, rows[i].sample, rows[i].font,
      GxEPD_BLACK, rows[i].norwegian, false);
    if (i < 3) rule(24, y + 64, 776, y + 64, GxEPD_BLACK);
    char line[192] = {0};
    if (rows[i].norwegian)
      FrameText::normalizeUtf8ForDisplay(line, sizeof(line), rows[i].sample);
    else strlcpy(line, rows[i].sample, sizeof(line));
    auto& display = DisplayCore::get();
    display.setFont(rows[i].font);
    int16_t bx, by;
    uint16_t w, h;
    display.getTextBounds(line, 0, 0, &bx, &by, &w, &h);
    Serial.printf("Type QA: %s ink bounding box %ux%u pixels\n", rows[i].name, w, h);
  }
  text(20, 440, 760, 30, "24 pt sample uses an ASCII-only GFX font. Smaller sans samples include Latin-1.",
    &FreeSans9pt8b, GxEPD_BLACK);
}

void pageGrid(bool dark) {
  auto& d = DisplayCore::get();
  const uint16_t paper = dark ? GxEPD_BLACK : GxEPD_WHITE;
  const uint16_t ink = dark ? GxEPD_WHITE : GxEPD_BLACK;
  d.fillScreen(paper);
  const char* const labels[16] = {
    "Weather","Reminders","Countdown","News",
    "Surf","Ski","Viking","Stocks",
    "Groceries","Date","AI Follow","Weather",
    "Reminders","Countdown","News","Surf"
  };
  const char* const values[16] = {
    "12°","Avtale","24","Nyheter",
    "Fair","15 cm","2 - 1","274.50",
    "Milk","21","None","12°",
    "Aleris","24","Aker BP","Fair"
  };
  const char* const details[16] = {
    "Cloudy","Fredag kl. 12","Christmas","Top stories",
    "0.8 - 1.2 m","Fresh snow","Full time","NOK +1.4%",
    "Coffee","October","No updates","13 high / 9 low",
    "Friday 12:30","Days left","Latest story","NE wind"
  };
  for (int i = 0; i < 16; ++i) {
    const int x = (i % 4) * 200;
    const int y = (i / 4) * 120;
    d.drawRect(x + 3, y + 3, 194, 114, ink);
    text(x + 10, y + 10, 180, 25, labels[i], &FreeSansBold12pt8b, ink);
    // This represents the actual miniature hierarchy, not a browser zoom.
    text(x + 8, y + 36, 184, 46, values[i], &FreeSansBold18pt8b, ink, true);
    text(x + 8, y + 85, 184, 23, details[i], &FreeSans9pt8b, ink, true);
  }
}

#if TYPOGRAPHY_CANDIDATE_FONTS_ENABLED
void pageNewType(bool warm) {
  auto& d = DisplayCore::get();
  d.fillScreen(GxEPD_WHITE);
  const GFXfont* display = warm ? &RemindFraunces72 : &RemindInstrument72;
  const GFXfont* headingFace = warm ? &RemindFraunces48 : &RemindInstrument48;
  heading(warm ? "RE:MIND | WARM FONT 6/6" : "RE:MIND | GALLERY FONT 5/6",
    "One-bit custom Norwegian fonts, true sizes. View from 0.5 / 1 / 2 metres.",
    GxEPD_BLACK);
  // 72px is a *bitmap design size*. The real glyph height may be smaller.
  text(24, 80, 750, 95, "21", display, GxEPD_BLACK, true, false);
  text(220, 90, 550, 74, "oktober", headingFace, GxEPD_BLACK, true, false);
  rule(24, 184, 776, 184, GxEPD_BLACK);
  text(24, 196, 752, 55, "Æ Ø Å  æ ø å", headingFace, GxEPD_BLACK, true, false);
  text(24, 272, 752, 40, "Kontrolltime · fredag 12:30",
    &RemindDM24, GxEPD_BLACK, true, false);
  text(24, 325, 752, 30, "Blåbær, vær, brød og åpne møter",
    &RemindDM18, GxEPD_BLACK, true, false);
  rule(24, 376, 776, 376, GxEPD_BLACK);
  text(24, 387, 752, 35, "DM Sans 18 / 24 · Seriff 48 / 72",
    &RemindDM18, GxEPD_BLACK, true, false);
  text(24, 432, 752, 23, "Actual one-bit glyphs. Only this USB test includes new custom fonts.",
    &FreeSans9pt8b, GxEPD_BLACK, false, false);
}
#endif

void draw(uint8_t page) {
  if (!usbConnected) return;
  Serial.printf("RE:MIND physical typography QA page %u/%u; full 800x480 refresh\n",
    unsigned(page + 1), unsigned(
#if TYPOGRAPHY_CANDIDATE_FONTS_ENABLED
    6
#else
    4
#endif
    ));
  DisplayCore::begin();
  auto& d = DisplayCore::get();
  d.setFullWindow();
  d.firstPage();
  do {
    switch (page) {
      case 0: pageFamilies(); break;
      case 1: pageDistance(); break;
      case 2: pageGrid(false); break;
      case 3: pageGrid(true); break;
#if TYPOGRAPHY_CANDIDATE_FONTS_ENABLED
      case 4: pageNewType(false); break;
      case 5: pageNewType(true); break;
#endif
      default: pageGrid(true); break;
    }
  } while (d.nextPage());
  DisplayCore::end(); // Turn off the e-paper rail after every completed page.
  Serial.printf("Type QA page complete; send 1-%u or n/p to change page.\n",
    unsigned(kPageCount));
}
}

namespace TypographyAudit {
void begin() {
  Serial.begin(115200);
  delay(350);
  pinMode(HardwareProfile::kPgoodN, INPUT);
  // The diagnostic has no battery power policy: only refresh while on USB.
  usbConnected = digitalRead(HardwareProfile::kPgoodN) == LOW;
  Serial.println("RE:MIND TYPOGRAPHY CALIBRATION - NO NETWORK, NO OTA, NO NVS");
  Serial.printf("USB required. Commands: 1-%u = pages; n = next; p = previous; ? = help.\n",
    unsigned(kPageCount));
  if (!usbConnected) {
    Serial.println("USB not detected; no panel refresh. Connect supplied USB cable.");
    return;
  }
  draw(currentPage);
}

void poll() {
  if (!usbConnected) {
    if (digitalRead(HardwareProfile::kPgoodN) == LOW) {
      usbConnected = true;
      draw(currentPage);
    }
    delay(100);
    return;
  }
  if (digitalRead(HardwareProfile::kPgoodN) != LOW) {
    usbConnected = false;
    Serial.println("USB disconnected; typography diagnostic suspended.");
    return;
  }
  if (!Serial.available()) {
    delay(25);
    return;
  }
  const char command = static_cast<char>(Serial.read());
  uint8_t nextPage = currentPage;
  if (command >= '1' && command < '1' + kPageCount)
    nextPage = command - '1';
  else if (command == 'n' || command == 'N')
    nextPage = (currentPage + 1) % kPageCount;
  else if (command == 'p' || command == 'P') nextPage = (currentPage + kPageCount - 1) % kPageCount;
  else if (command == '?') {
    Serial.printf("Send 1-%u, n or p. Each command performs ONE full refresh.\n",
      unsigned(kPageCount));
    return;
  } else return;
  if (nextPage != currentPage) {
    currentPage = nextPage;
    draw(currentPage);
  }
}
}
#endif // TYPOGRAPHY_AUDIT_ENABLED
