#include "ModuleDateAdaptive.h"
#include "DisplayCore.h"
#include "Theme.h"
#include <time.h>

#if __has_include("Fonts/FreeSansBold24ptNO.h")
  #include "Fonts/FreeSansBold24ptNO.h"
  #define ADATE_B24 (&FreeSansBold24pt8b)
#else
  #include <Fonts/FreeSansBold24pt7b.h>
  #define ADATE_B24 (&FreeSansBold24pt7b)
#endif

#if __has_include("Fonts/FreeSansBold18ptNO.h")
  #include "Fonts/FreeSansBold18ptNO.h"
  #define ADATE_B18 (&FreeSansBold18pt8b)
#else
  #include <Fonts/FreeSansBold18pt7b.h>
  #define ADATE_B18 (&FreeSansBold18pt7b)
#endif

#if __has_include("Fonts/FreeSansBold12ptNO.h")
  #include "Fonts/FreeSansBold12ptNO.h"
  #define ADATE_B12 (&FreeSansBold12pt8b)
#else
  #include <Fonts/FreeSansBold12pt7b.h>
  #define ADATE_B12 (&FreeSansBold12pt7b)
#endif

#if __has_include("Fonts/FreeSans9ptNO.h")
  #include "Fonts/FreeSans9ptNO.h"
  #define ADATE_9 (&FreeSans9pt8b)
#else
  #include <Fonts/FreeSans9pt7b.h>
  #define ADATE_9 (&FreeSans9pt7b)
#endif

namespace {

struct Rect {
  int x;
  int y;
  int w;
  int h;
};

static const FrameConfig* g_cfg = nullptr;

static const char* const WDAYS_FULL[] = {
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
};
static const char* const MONTHS_FULL[] = {
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
};

static const char* safeWday(int value) {
  return value >= 0 && value <= 6 ? WDAYS_FULL[value] : "Monday";
}

static const char* safeMonth(int value) {
  return value >= 0 && value <= 11 ? MONTHS_FULL[value] : "January";
}

static int clampInt(int value, int low, int high) {
  if (value < low) return low;
  if (value > high) return high;
  return value;
}

static Rect insetRect(const Rect& rect, int pad) {
  Rect out = { rect.x + pad, rect.y + pad, rect.w - pad * 2, rect.h - pad * 2 };
  if (out.w < 1) out.w = 1;
  if (out.h < 1) out.h = 1;
  return out;
}

static void measureText(const char* text, const GFXfont* font,
                        int16_t& x1, int16_t& y1, uint16_t& tw, uint16_t& th) {
  auto& d = DisplayCore::get();
  d.setFont(font);
  d.setTextSize(1);
  d.getTextBounds(text, 0, 0, &x1, &y1, &tw, &th);
}

static bool drawCenteredIfFits(const Rect& rect, const char* text, const GFXfont* font,
                               uint16_t color = Theme::ink()) {
  if (!text || !text[0] || rect.w <= 0 || rect.h <= 0) return false;
  int16_t x1, y1;
  uint16_t tw, th;
  measureText(text, font, x1, y1, tw, th);
  if ((int)tw > rect.w || (int)th > rect.h) return false;

  auto& d = DisplayCore::get();
  const int bx = rect.x + (rect.w - (int)tw) / 2;
  const int by = rect.y + (rect.h - (int)th) / 2;
  d.setTextColor(color);
  d.setFont(font);
  d.setTextSize(1);
  d.setCursor(bx - x1, by - y1);
  d.print(text);
  d.setFont(nullptr);
  return true;
}

static bool drawFitted(const Rect& rect, const char* text,
                       const GFXfont* first, const GFXfont* second = nullptr,
                       const GFXfont* third = nullptr) {
  if (drawCenteredIfFits(rect, text, first)) return true;
  if (second && drawCenteredIfFits(rect, text, second)) return true;
  if (third && drawCenteredIfFits(rect, text, third)) return true;
  return false;
}

static bool drawWeekdayBadge(const Rect& rect, const char* weekday) {
  if (!weekday || !weekday[0] || rect.w < 20 || rect.h < 16) return false;
  const GFXfont* font = ADATE_B12;
  int16_t x1, y1;
  uint16_t tw, th;
  measureText(weekday, font, x1, y1, tw, th);
  if ((int)tw + 14 > rect.w || (int)th + 8 > rect.h) {
    font = ADATE_9;
    measureText(weekday, font, x1, y1, tw, th);
  }
  if ((int)tw + 10 > rect.w || (int)th + 6 > rect.h) return false;

  const int badgeW = (int)tw + 10;
  const int badgeH = (int)th + 6;
  const int badgeX = rect.x + (rect.w - badgeW) / 2;
  const int badgeY = rect.y + (rect.h - badgeH) / 2;
  auto& d = DisplayCore::get();
  d.fillRect(badgeX, badgeY, badgeW, badgeH, GxEPD_WHITE);
  Rect textRect = { badgeX + 5, badgeY + 3, badgeW - 10, badgeH - 6 };
  return drawCenteredIfFits(textRect, weekday, font, GxEPD_BLACK);
}

static int daysInMonth(int year, int month0) {
  static const int DAYS[] = {31,28,31,30,31,30,31,31,30,31,30,31};
  int days = DAYS[month0];
  if (month0 == 1) {
    const bool leap = ((year % 4 == 0) && (year % 100 != 0)) || year % 400 == 0;
    if (leap) days = 29;
  }
  return days;
}

static int weekNumberISO(int year, int month0, int day) {
  tm current = {};
  current.tm_year = year - 1900;
  current.tm_mon = month0;
  current.tm_mday = day;
  current.tm_hour = 12;
  mktime(&current);

  const int mondayIndex = current.tm_wday == 0 ? 6 : current.tm_wday - 1;
  tm thursday = current;
  thursday.tm_mday += 3 - mondayIndex;
  mktime(&thursday);

  tm jan4 = {};
  jan4.tm_year = thursday.tm_year;
  jan4.tm_mon = 0;
  jan4.tm_mday = 4;
  jan4.tm_hour = 12;
  mktime(&jan4);
  const int jan4Monday = jan4.tm_wday == 0 ? 6 : jan4.tm_wday - 1;
  jan4.tm_mday -= jan4Monday;
  mktime(&jan4);

  const long days = (long)((mktime(&thursday) - mktime(&jan4)) / 86400);
  int week = (int)(days / 7) + 1;
  return clampInt(week, 1, 53);
}

static bool isHoliday(int year, int month0, int day) {
  if (!g_cfg) return false;
  for (uint8_t i = 0; i < g_cfg->date.holidayCount; ++i) {
    const HolidayItem& item = g_cfg->date.holidays[i];
    if ((int)item.year == year && (int)item.month == month0 + 1 && (int)item.day == day) return true;
  }
  return false;
}

static bool drawCalendar(const Rect& rect, int year, int month0,
                         int todayYear, int todayMonth0, int todayDay,
                         bool requestTitle) {
  // Same progressive feature thresholds as app/lib/dateResponsive.mjs.
  if (rect.w < 154 || rect.h < 92) return false;
  const bool showDow = rect.w >= 168 && rect.h >= 112;
  const bool showWeek = showDow && rect.w >= 190 && rect.h >= 126;
  const bool showTitle = requestTitle && showDow && rect.h >= 146;

  const int padX = 5;
  const int padY = 5;
  const int titleH = showTitle ? 22 : 0;
  const int titleGap = showTitle ? 4 : 0;
  const int dowH = showDow ? 17 : 0;
  const int weekW = showWeek ? 24 : 0;
  const int availW = rect.w - padX * 2;
  const int availH = rect.h - padY * 2;
  if (availW <= weekW + 7 * 9) return false;

  tm first = {};
  first.tm_year = year - 1900;
  first.tm_mon = month0;
  first.tm_mday = 1;
  first.tm_hour = 12;
  mktime(&first);
  const int firstMonday = first.tm_wday == 0 ? 6 : first.tm_wday - 1;
  const int dim = daysInMonth(year, month0);
  int rows = (firstMonday + dim + 6) / 7;
  rows = clampInt(rows, 4, 6);

  const int cellW = (availW - weekW) / 7;
  const int cellH = (availH - titleH - titleGap - dowH) / rows;
  if (cellW < 9 || cellH < 10) return false;

  const int blockW = weekW + cellW * 7;
  const int blockH = titleH + titleGap + dowH + cellH * rows;
  const int blockX = rect.x + (rect.w - blockW) / 2;
  int cursorY = rect.y + (rect.h - blockH) / 2;
  auto& d = DisplayCore::get();
  const uint16_t ink = Theme::ink();

  if (showTitle) {
    Rect titleRect = { blockX, cursorY, blockW, titleH };
    drawFitted(titleRect, safeMonth(month0), ADATE_B12, ADATE_9);
    cursorY += titleH + titleGap;
  }

  const int daysX = blockX + weekW;
  if (showDow) {
    static const char* const DOW[] = {"Mo","Tu","We","Th","Fr","Sa","Su"};
    for (int col = 0; col < 7; ++col) {
      Rect dowRect = { daysX + col * cellW, cursorY, cellW, dowH };
      drawCenteredIfFits(dowRect, DOW[col], ADATE_9, ink);
    }
  }
  const int gridTop = cursorY + dowH;

  if (showWeek) {
    const int dividerX = blockX + weekW - 1;
    d.drawLine(dividerX, gridTop + 2, dividerX, gridTop + rows * cellH - 2, ink);
    for (int row = 0; row < rows; ++row) {
      int sampleDay = row * 7 - firstMonday + 1;
      if (sampleDay < 1) sampleDay = 1;
      if (sampleDay > dim) continue;
      char weekText[4];
      snprintf(weekText, sizeof(weekText), "%d", weekNumberISO(year, month0, sampleDay));
      Rect weekRect = { blockX, gridTop + row * cellH, weekW - 2, cellH };
      drawCenteredIfFits(weekRect, weekText, ADATE_9, ink);
    }
  }

  for (int row = 0; row < rows; ++row) {
    for (int col = 0; col < 7; ++col) {
      const int index = row * 7 + col;
      const int day = index - firstMonday + 1;
      if (day < 1 || day > dim) continue;
      Rect dayRect = { daysX + col * cellW, gridTop + row * cellH, cellW, cellH };
      char dayText[4];
      snprintf(dayText, sizeof(dayText), "%d", day);
      int16_t x1, y1;
      uint16_t tw, th;
      measureText(dayText, ADATE_9, x1, y1, tw, th);
      if ((int)tw > dayRect.w || (int)th > dayRect.h) continue;

      const int centerX = dayRect.x + dayRect.w / 2;
      const int centerY = dayRect.y + dayRect.h / 2;
      const bool today = year == todayYear && month0 == todayMonth0 && day == todayDay;
      if (today) {
        int radius = (cellW < cellH ? cellW : cellH) / 2 - 2;
        radius = clampInt(radius, 7, 14);
        d.fillCircle(centerX, centerY, radius, GxEPD_WHITE);
      }
      const int tx = centerX - (int)tw / 2;
      const int ty = centerY - (int)th / 2;
      d.setTextColor(today ? GxEPD_BLACK : ink);
      d.setFont(ADATE_9);
      d.setTextSize(1);
      d.setCursor(tx - x1, ty - y1);
      d.print(dayText);
      if (isHoliday(year, month0, day) && cellH >= 15) {
        d.fillCircle(centerX, dayRect.y + dayRect.h - 2, 1, today ? GxEPD_BLACK : ink);
      }
    }
  }
  d.setFont(nullptr);
  d.setTextSize(1);
  return true;
}

static void drawHeroStack(const Rect& rect, const char* month, const char* weekday,
                          int year, int day, bool showYear, bool showMonth) {
  if (rect.w < 1 || rect.h < 1) return;
  const int yearH = showYear ? 20 : 0;
  const int monthH = showMonth ? 26 : 0;
  const int weekdayH = rect.h >= 78 ? 28 : 22;
  int dayH = rect.h - yearH - monthH - weekdayH;
  if (dayH < 28) dayH = 28;
  int desired = yearH + monthH + dayH + weekdayH;
  if (desired > rect.h) desired = rect.h;
  Rect group = { rect.x, rect.y + (rect.h - desired) / 2, rect.w, desired };
  int y = group.y;

  char yearText[8];
  snprintf(yearText, sizeof(yearText), "%d", year);
  char dayText[8];
  snprintf(dayText, sizeof(dayText), "%d", day);

  if (showYear && y < group.y + group.h) {
    Rect region = { group.x, y, group.w, yearH };
    drawFitted(region, yearText, ADATE_9);
    y += yearH;
  }
  if (showMonth && y < group.y + group.h) {
    Rect region = { group.x, y, group.w, monthH };
    drawFitted(region, month, ADATE_B12, ADATE_9);
    y += monthH;
  }
  const int remainingForWeekday = group.y + group.h - y;
  const int actualWeekdayH = remainingForWeekday > weekdayH ? weekdayH : remainingForWeekday;
  const int actualDayH = remainingForWeekday - actualWeekdayH;
  if (actualDayH > 0) {
    Rect region = { group.x, y, group.w, actualDayH };
    drawFitted(region, dayText, ADATE_B24, ADATE_B18, ADATE_B12);
    y += actualDayH;
  }
  if (actualWeekdayH > 0) {
    Rect region = { group.x, y, group.w, actualWeekdayH };
    if (!drawWeekdayBadge(region, weekday)) drawFitted(region, weekday, ADATE_B12, ADATE_9);
  }
}

static void drawHeroHorizontal(const Rect& rect, const char* month, const char* weekday,
                               int year, int day, bool showYear) {
  if (rect.w < 1 || rect.h < 1) return;
  const int yearW = showYear ? (rect.w * 17 / 100 < 70 ? rect.w * 17 / 100 : 70) : 0;
  const int weekdayW = rect.w * 35 / 100 < 180 ? rect.w * 35 / 100 : 180;
  const int dayW = rect.w * 20 / 100 < 88 ? rect.w * 20 / 100 : 88;
  const int monthW = rect.w - weekdayW - dayW - yearW;
  int x = rect.x;
  Rect weekdayRect = { x, rect.y, weekdayW, rect.h };
  if (!drawWeekdayBadge(weekdayRect, weekday)) drawFitted(weekdayRect, weekday, ADATE_B12, ADATE_9);
  x += weekdayW;

  char dayText[8];
  snprintf(dayText, sizeof(dayText), "%d", day);
  Rect dayRect = { x, rect.y, dayW, rect.h };
  drawFitted(dayRect, dayText, ADATE_B24, ADATE_B18, ADATE_B12);
  x += dayW;

  if (monthW > 0) {
    Rect monthRect = { x, rect.y, monthW, rect.h };
    drawFitted(monthRect, month, ADATE_B12, ADATE_9);
    x += monthW;
  }
  if (showYear && yearW > 0) {
    char yearText[8];
    snprintf(yearText, sizeof(yearText), "%d", year);
    Rect yearRect = { x, rect.y, yearW, rect.h };
    drawFitted(yearRect, yearText, ADATE_9);
  }
}

static void utf8ToLatin1(const char* input, char* output, size_t outputSize) {
  if (!output || outputSize == 0) return;
  if (!input) { output[0] = '\0'; return; }
  size_t out = 0;
  for (size_t i = 0; input[i] && out + 1 < outputSize;) {
    const uint8_t first = (uint8_t)input[i];
    if (first < 0x80) {
      output[out++] = (char)first;
      ++i;
      continue;
    }
    if ((first & 0xE0) == 0xC0) {
      const uint8_t second = (uint8_t)input[i + 1];
      if ((second & 0xC0) == 0x80) {
        const uint16_t code = ((uint16_t)(first & 0x1F) << 6) | (uint16_t)(second & 0x3F);
        output[out++] = code >= 0x00A0 && code <= 0x00FF ? (char)code : '?';
        i += 2;
        continue;
      }
    }
    output[out++] = '?';
    ++i;
  }
  output[out] = '\0';
}

static int dateKey(int year, int month0, int day) {
  return year * 10000 + (month0 + 1) * 100 + day;
}

static void drawHolidayRows(const Rect& rect, int year, int month0, int day, int maxRows) {
  if (!g_cfg || g_cfg->date.holidayCount == 0 || maxRows <= 0 || rect.h < 18) return;
  const int today = dateKey(year, month0, day);
  int selected[2] = {-1, -1};
  int selectedCount = 0;
  for (int pick = 0; pick < maxRows && pick < 2; ++pick) {
    int bestIndex = -1;
    int bestKey = 99999999;
    for (uint8_t i = 0; i < g_cfg->date.holidayCount; ++i) {
      const HolidayItem& item = g_cfg->date.holidays[i];
      const int key = (int)item.year * 10000 + (int)item.month * 100 + (int)item.day;
      if (key < today || key >= bestKey) continue;
      bool used = false;
      for (int j = 0; j < selectedCount; ++j) if (selected[j] == (int)i) used = true;
      if (!used) { bestIndex = i; bestKey = key; }
    }
    if (bestIndex < 0) break;
    selected[selectedCount++] = bestIndex;
  }
  if (selectedCount == 0) return;

  const int rowH = rect.h / selectedCount;
  for (int row = 0; row < selectedCount; ++row) {
    const HolidayItem& item = g_cfg->date.holidays[selected[row]];
    char dateText[8];
    snprintf(dateText, sizeof(dateText), "%02d.%02d", (int)item.day, (int)item.month);
    char name[64];
    utf8ToLatin1(item.name, name, sizeof(name));
    Rect rowRect = { rect.x, rect.y + row * rowH, rect.w, rowH };
    const int dateW = rowRect.w < 150 ? 48 : 58;
    Rect dateRect = { rowRect.x, rowRect.y, dateW, rowRect.h };
    Rect nameRect = { rowRect.x + dateW + 4, rowRect.y, rowRect.w - dateW - 4, rowRect.h };
    drawFitted(dateRect, dateText, ADATE_9);
    drawFitted(nameRect, name, ADATE_B12, ADATE_9);
  }
}

static void drawUnavailable(const Cell& c) {
  Rect rect = { c.x + 8, c.y + 8, c.w - 16, c.h - 16 };
  drawFitted(rect, "DATE", ADATE_B12, ADATE_9);
}

} // namespace

namespace ModuleDateAdaptive {

void setConfig(const FrameConfig* cfg) {
  g_cfg = cfg;
}

void render(const Cell& c) {
  tm now = {};
  if (!getLocalTime(&now, 10)) {
    drawUnavailable(c);
    return;
  }

  const int year = now.tm_year + 1900;
  const int month0 = now.tm_mon;
  const int day = now.tm_mday;
  const char* month = safeMonth(month0);
  const char* weekday = safeWday(now.tm_wday);

  // The thresholds intentionally mirror app/lib/dateResponsive.mjs.
  const bool micro = c.w < 150 || c.h < 88 || (c.w < 230 && c.h < 140);
  const bool shallow = c.w > c.h && c.h < 170;
  const bool expanded = (c.w >= 700 && c.h >= 330) || (c.w >= 520 && c.h >= 400);
  const bool horizontalCalendar = c.w >= 430 && c.h >= 210;
  const bool verticalCalendar = !horizontalCalendar && c.w >= 330 && c.h >= 400;

  int pad = (c.w < c.h ? c.w : c.h) * 7 / 100;
  pad = clampInt(pad, 8, 18);
  Rect cellRect = { c.x, c.y, c.w, c.h };
  Rect inner = insetRect(cellRect, pad);

  if (expanded) {
    const int gap = 18;
    const int heroW = inner.w * 48 / 100;
    Rect hero = { inner.x, inner.y, heroW, inner.h };
    Rect right = { inner.x + heroW + gap, inner.y, inner.w - heroW - gap, inner.h };
    const int holidayRows = c.h >= 420 ? 2 : 1;
    const int holidayH = holidayRows == 2 ? 72 : 48;
    Rect heroMain = { hero.x, hero.y, hero.w, hero.h - holidayH - 8 };
    Rect holidays = { hero.x, hero.y + hero.h - holidayH, hero.w, holidayH };
    drawHeroStack(heroMain, month, weekday, year, day, true, true);
    drawHolidayRows(holidays, year, month0, day, holidayRows);

    const int rowGap = 14;
    const int rowH = (right.h - rowGap) / 2;
    Rect currentCalendar = { right.x, right.y, right.w, rowH };
    Rect nextCalendar = { right.x, right.y + rowH + rowGap, right.w, right.h - rowH - rowGap };
    drawCalendar(currentCalendar, year, month0, year, month0, day, true);
    int nextYear = year;
    int nextMonth = month0 + 1;
    if (nextMonth >= 12) { nextMonth = 0; ++nextYear; }
    drawCalendar(nextCalendar, nextYear, nextMonth, year, month0, day, true);
    return;
  }

  if (horizontalCalendar || verticalCalendar) {
    const int gap = 18;
    if (verticalCalendar) {
      const int heroH = inner.h * 52 / 100 - gap / 2;
      Rect hero = { inner.x, inner.y, inner.w, heroH };
      Rect calendar = { inner.x, inner.y + heroH + gap, inner.w, inner.h - heroH - gap };
      drawHeroStack(hero, month, weekday, year, day, true, true);
      drawCalendar(calendar, year, month0, year, month0, day, true);
    } else {
      const int heroW = inner.w * 48 / 100;
      Rect hero = { inner.x, inner.y, heroW, inner.h };
      Rect calendar = { inner.x + heroW + gap, inner.y, inner.w - heroW - gap, inner.h };
      if (c.h >= 300 && g_cfg && g_cfg->date.holidayCount > 0) {
        const int holidayH = 48;
        Rect heroMain = { hero.x, hero.y, hero.w, hero.h - holidayH - 8 };
        Rect holidays = { hero.x, hero.y + hero.h - holidayH, hero.w, holidayH };
        drawHeroStack(heroMain, month, weekday, year, day, true, true);
        drawHolidayRows(holidays, year, month0, day, 1);
      } else {
        drawHeroStack(hero, month, weekday, year, day, true, true);
      }
      drawCalendar(calendar, year, month0, year, month0, day, c.h >= 300);
    }
    return;
  }

  if (shallow) {
    drawHeroHorizontal(inner, month, weekday, year, day, c.w >= 500);
    return;
  }

  // Micro and ordinary stack geometries use progressive disclosure rather than scaling.
  drawHeroStack(inner, month, weekday, year, day, !micro, !micro || c.h >= 105);
}

} // namespace ModuleDateAdaptive
