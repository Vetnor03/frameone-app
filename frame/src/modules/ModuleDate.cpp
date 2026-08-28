#include "FrameText.h"
#include "ModuleDate.h"
#include "DisplayCore.h"
#include "Theme.h"
#include <time.h>

/* =========================
   Font includes (prefer NO fonts if they exist)
   ========================= */
#if __has_include("Fonts/FreeSansBold24ptNO.h")
  #include "Fonts/FreeSansBold24ptNO.h"
  #define FONT_B24 (&FreeSansBold24pt8b)
#else
  #include <Fonts/FreeSansBold24pt7b.h>
  #define FONT_B24 (&FreeSansBold24pt7b)
#endif

#if __has_include("Fonts/FreeSansBold18ptNO.h")
  #include "Fonts/FreeSansBold18ptNO.h"
  #define FONT_B18 (&FreeSansBold18pt8b)
#else
  #include <Fonts/FreeSansBold18pt7b.h>
  #define FONT_B18 (&FreeSansBold18pt7b)
#endif

#if __has_include("Fonts/FreeSansBold12ptNO.h")
  #include "Fonts/FreeSansBold12ptNO.h"
  #define FONT_B12 (&FreeSansBold12pt8b)
#else
  #include <Fonts/FreeSansBold12pt7b.h>
  #define FONT_B12 (&FreeSansBold12pt7b)
#endif

#if __has_include("Fonts/FreeSans9ptNO.h")
  #include "Fonts/FreeSans9ptNO.h"
  #define FONT_9 (&FreeSans9pt8b)
#else
  #include <Fonts/FreeSans9pt7b.h>
  #define FONT_9 (&FreeSans9pt7b)
#endif

static const FrameConfig* g_cfg = nullptr;

namespace ModuleDate {
  void setConfig(const FrameConfig* cfg) { g_cfg = cfg; }
}

/* Shared physical-frame UTF-8 safety boundary. */
static void utf8ToLatin1(const char* in, char* out, size_t outSize) {
  FrameText::normalizeUtf8ForDisplay(out, outSize, in);
}

/* ========================= */

static bool getLocalTmQuick(tm& outTm) {
  if (!getLocalTime(&outTm, 10)) return false;
  return true;
}

static const char* const WDAYS_FULL[] = {
  "Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"
};
static const char* const MONTHS_FULL[] = {
  "January","February","March","April","May","June","July","August","September","October","November","December"
};

static const char* safeWday(int w) {
  if (w >= 0 && w <= 6) return WDAYS_FULL[w];
  return "Monday";
}
static const char* safeMonth(int m) {
  if (m >= 0 && m <= 11) return MONTHS_FULL[m];
  return "January";
}

static void measureText(const char* text, const GFXfont* font,
                        int16_t& x1, int16_t& y1, uint16_t& tw, uint16_t& th) {
  auto& d = DisplayCore::get();
  d.setFont(font);
  d.setTextSize(1);
  d.getTextBounds(text, 0, 0, &x1, &y1, &tw, &th);
}

static void drawCenteredLine(int x, int y, int w, int h,
                             const char* text,
                             const GFXfont* font,
                             uint16_t color) {
  auto& d = DisplayCore::get();

  int16_t x1, y1;
  uint16_t tw, th;
  measureText(text, font, x1, y1, tw, th);

  int bx = x + (w - (int)tw) / 2;
  int by = y + (h - (int)th) / 2;

  d.setTextColor(color);
  d.setFont(font);
  d.setTextSize(1);
  d.setCursor(bx - x1, by - y1);
  d.print(text);

  d.setFont(nullptr);
  d.setTextSize(1);
}

/* =========================
   MEDIUM (square) — premium design
   ========================= */
static void drawMediumDate(const Cell& c,
                           const char* month,
                           const char* wday,
                           int year,
                           int dayNum) {
  auto& d = DisplayCore::get();
  d.setTextSize(1);

  char yearStr[8];
  snprintf(yearStr, sizeof(yearStr), "%d", year);

  char dayStr[8];
  snprintf(dayStr, sizeof(dayStr), "%d", dayNum);

  int16_t yx1, yy1, mx1, my1, dx1, dy1, wx1, wy1;
  uint16_t yw, yh, mw, mh, dw, dh, ww, wh;

  measureText(yearStr, FONT_9,  yx1, yy1, yw, yh);
  measureText(month,   FONT_B12, mx1, my1, mw, mh);
  measureText(dayStr,  FONT_B24, dx1, dy1, dw, dh);
  measureText(wday,    FONT_B12, wx1, wy1, ww, wh);

  const int gap1 = 6;
  const int gap2 = 14;
  const int gap3 = 14;

  const int rectPadX = 18;
  const int rectPadY = 10;

  int rectW = (int)ww + rectPadX * 2;
  int rectH = (int)wh + rectPadY * 2;

  if (rectW > c.w - 16) rectW = c.w - 16;

  int totalH = (int)yh + gap1 + (int)mh + gap2 + (int)dh + gap3 + rectH;
  int top = c.y + (c.h - totalH) / 2;

  // Year
  {
    int bx = c.x + (c.w - (int)yw) / 2;
    int by = top;
    d.setTextColor(Theme::ink());
    d.setFont(FONT_9);
    d.setCursor(bx - yx1, by - yy1);
    d.print(yearStr);
  }

  // Month
  int monthTop = top + (int)yh + gap1;
  {
    int bx = c.x + (c.w - (int)mw) / 2;
    int by = monthTop;
    d.setTextColor(Theme::ink());
    d.setFont(FONT_B12);
    d.setCursor(bx - mx1, by - my1);
    d.print(month);
  }

  // Day
  int dayTop = monthTop + (int)mh + gap2;
  {
    int bx = c.x + (c.w - (int)dw) / 2;
    int by = dayTop;
    d.setTextColor(Theme::ink());
    d.setFont(FONT_B24);
    d.setCursor(bx - dx1, by - dy1);
    d.print(dayStr);
  }

  // White badge behind weekday
  int rectTop = dayTop + (int)dh + gap3;
  int rectX = c.x + (c.w - rectW) / 2;

  d.fillRect(rectX, rectTop, rectW, rectH, Theme::fill());

  {
    int bx = rectX + (rectW - (int)ww) / 2;
    int by = rectTop + (rectH - (int)wh) / 2;

    d.setTextColor(Theme::onFill());
    d.setFont(FONT_B12);
    d.setCursor(bx - wx1, by - wy1);
    d.print(wday);
  }

  d.setFont(nullptr);
  d.setTextSize(1);
}

/* =========================
   Calendar helpers
   ========================= */
static int daysInMonth(int year, int month0) {
  static const int mdays[] = { 31,28,31,30,31,30,31,31,30,31,30,31 };
  int d = mdays[month0];
  if (month0 == 1) {
    bool leap = ((year % 4 == 0) && (year % 100 != 0)) || (year % 400 == 0);
    if (leap) d = 29;
  }
  return d;
}

static int ymd(int year, int month0, int day) {
  return year * 10000 + (month0 + 1) * 100 + day;
}

static int holidayYMD(const HolidayItem& h) {
  return (int)h.year * 10000 + (int)h.month * 100 + (int)h.day;
}

static bool sameDay(const HolidayItem& h, int year, int month0, int dayNum) {
  return ((int)h.year == year && (int)h.month == (month0 + 1) && (int)h.day == dayNum);
}

static bool isHolidayInMonth(int year, int month0, int dayNum) {
  if (!g_cfg) return false;
  for (int i = 0; i < (int)g_cfg->date.holidayCount; i++) {
    if (sameDay(g_cfg->date.holidays[i], year, month0, dayNum)) return true;
  }
  return false;
}

/* ISO week number (simple, stable enough for display) */
static int weekNumberISO(int year, int month0, int day) {
  tm t = {};
  t.tm_year = year - 1900;
  t.tm_mon  = month0;
  t.tm_mday = day;
  t.tm_hour = 12;
  mktime(&t);

  int wday = t.tm_wday; // Sun=0..Sat=6
  int monIndex = (wday == 0) ? 6 : (wday - 1); // Mon=0..Sun=6
  int deltaToThu = 3 - monIndex;

  tm thu = t;
  thu.tm_mday += deltaToThu;
  mktime(&thu);

  tm jan4 = {};
  jan4.tm_year = thu.tm_year;
  jan4.tm_mon  = 0;
  jan4.tm_mday = 4;
  jan4.tm_hour = 12;
  mktime(&jan4);

  int jan4w = jan4.tm_wday;
  int jan4Mon = (jan4w == 0) ? 6 : (jan4w - 1);

  tm week1Mon = jan4;
  week1Mon.tm_mday -= jan4Mon;
  mktime(&week1Mon);

  time_t a = mktime(&week1Mon);
  time_t b = mktime(&thu);
  long diffDays = (long)((b - a) / 86400);
  int week = (int)(diffDays / 7) + 1;
  if (week < 1) week = 1;
  if (week > 53) week = 53;
  return week;
}

/* =========================
   Month calendar (same as your current)
   ========================= */
static void drawMonthCalendar(int x, int y, int w, int h,
                              int year, int month0,
                              int todayYear, int todayMonth0, int todayDayNum,
                              bool showMonthTitle,
                              bool showWeekNums,
                              bool showDowHeader,
                              bool hardBounds = false) {
  auto& d = DisplayCore::get();
  d.setTextSize(1);

  const uint16_t ink = Theme::ink();

  const int cols = 7;
  const int rows = 6;

  const int titleH = showMonthTitle ? 22 : 0;
  const int titleGap = showMonthTitle ? 10 : 0;
  const int dowH = showDowHeader ? 18 : 0;

  const int padX = 12;
  const int padY = 8;

  int availW = w - 2 * padX;
  int availH = h - 2 * padY;

  if (availW < 7 * 10 || availH < (titleH + titleGap + dowH + rows * 10)) return;

  const int weekW = showWeekNums ? 26 : 0;
  const int weekPadLeft = showWeekNums ? 2 : 0;
  const int weekPadRight = showWeekNums ? 6 : 0;

  int gridAvailW = availW - weekW;
  if (gridAvailW < 7 * 9) return;

  int cellW = gridAvailW / cols;
  if (cellW < 9) cellW = 9;

  tm first = {};
  first.tm_year = year - 1900;
  first.tm_mon  = month0;
  first.tm_mday = 1;
  first.tm_hour = 12;
  mktime(&first);

  int firstWdayMonFirst = (first.tm_wday == 0) ? 6 : first.tm_wday - 1;
  int dim = daysInMonth(year, month0);

  int usedCells = firstWdayMonFirst + dim;
  int usedRows  = (usedCells + 6) / 7;
  if (usedRows < 4) usedRows = 4;
  if (usedRows > 6) usedRows = 6;

  // ✅ Use real rows everywhere (prevents empty 6th row when not needed)
  const int drawRows = usedRows;

  int cellH = (availH - titleH - titleGap - dowH) / drawRows;
  if (cellH < 10) cellH = 10;

  int blockW = weekW + cols * cellW;
  int blockH = titleH + titleGap + dowH + drawRows * cellH;

  int blockX = x + (w - blockW) / 2;
  int blockTop = y + (h - blockH) / 2;

  int curY = blockTop;

  if (showMonthTitle) {
    const char* mname = safeMonth(month0);
    int16_t x1, y1; uint16_t tw, th;
    measureText(mname, FONT_B12, x1, y1, tw, th);
    int tx = blockX + (blockW - (int)tw) / 2;
    int ty = curY + (titleH - (int)th) / 2;
    d.setTextColor(ink);
    d.setFont(FONT_B12);
    d.setCursor(tx - x1, ty - y1);
    d.print(mname);
    curY += titleH + titleGap;
  }

  int dowX = blockX + weekW;

  if (showDowHeader) {
    static const char* const DOW[] = {"Mo","Tu","We","Th","Fr","Sa","Su"};
    d.setFont(FONT_9);
    d.setTextColor(ink);

    for (int c = 0; c < cols; c++) {
      int cx = dowX + c * cellW;
      int cy = curY;

      int16_t x1, y1; uint16_t tw, th;
      measureText(DOW[c], FONT_9, x1, y1, tw, th);

      int bx = cx + (cellW - (int)tw) / 2;
      int by = cy + (dowH - (int)th) / 2;

      d.setCursor(bx - x1, by - y1);
      d.print(DOW[c]);
    }
  }

  int gridTop = curY + dowH;

  if (showWeekNums && weekW > 0) {
    int divX = blockX + weekW - 1;
    int y0 = gridTop + 2;
    int y1 = gridTop + drawRows * cellH - 2;
    d.drawLine(divX, y0, divX, y1, ink);
  }

  if (showWeekNums) {
    d.setFont(FONT_9);
    d.setTextColor(ink);

    for (int r = 0; r < drawRows; r++) {
      int firstIdx = r * cols;
      int lastIdx  = r * cols + (cols - 1);

      int firstDay = firstIdx - firstWdayMonFirst + 1;
      int lastDay  = lastIdx  - firstWdayMonFirst + 1;

      if (lastDay < 1) continue;
      if (firstDay > dim) continue;

      int sampleDay = firstDay;
      if (sampleDay < 1) sampleDay = 1;
      if (sampleDay > dim) sampleDay = dim;

      int wk = weekNumberISO(year, month0, sampleDay);

      char wkStr[4];
      snprintf(wkStr, sizeof(wkStr), "%d", wk);

      int16_t x1, y1; uint16_t tw, th;
      measureText(wkStr, FONT_9, x1, y1, tw, th);

      int cellY = gridTop + r * cellH;
      int cy = cellY + (cellH - (int)th) / 2;

      int colX = blockX + weekPadLeft;
      int colW = weekW - weekPadLeft - weekPadRight;

      int bx = colX + (colW - (int)tw) / 2;
      d.setCursor(bx - x1, cy - y1);
      d.print(wkStr);
    }
  }

  d.setFont(FONT_9);

  for (int r = 0; r < drawRows; r++) {
    for (int c = 0; c < cols; c++) {
      int idx = r * cols + c;
      int day = idx - firstWdayMonFirst + 1;
      if (day < 1 || day > dim) continue;

      int cellX = dowX + c * cellW;
      int cellY = gridTop + r * cellH;

      int centerX = cellX + cellW / 2;
      int centerY = cellY + cellH / 2;

      char buf[4];
      snprintf(buf, sizeof(buf), "%d", day);

      int16_t x1, y1; uint16_t tw, th;
      measureText(buf, FONT_9, x1, y1, tw, th);

      bool isToday = (year == todayYear && month0 == todayMonth0 && day == todayDayNum);
      bool isHol   = isHolidayInMonth(year, month0, day);

      if (isToday) {
        int radius = min(cellW, cellH) / 2 - 2;
        if (hardBounds && radius < 1) radius = 1;
        else if (!hardBounds && radius < 10) radius = 10;
        if (radius > 16) radius = 16;

        d.fillCircle(centerX, centerY, radius, Theme::fill());
        d.setTextColor(Theme::onFill());
      } else {
        d.setTextColor(ink);
      }

      int tx = centerX - (int)tw / 2;
      int ty = centerY - (int)th / 2;
      d.setCursor(tx - x1, ty - y1);
      d.print(buf);

      if (isHol) {
        int dotY = cellY + cellH - 3;
        d.fillCircle(centerX, dotY, 2, isToday ? Theme::onFill() : ink);
      }
    }
  }

  d.setFont(nullptr);
  d.setTextSize(1);
}

// Month Calendar for Large Module

static void drawMonthCalendarRows(int x, int y, int w, int h,
                                  int year, int month0,
                                  int todayYear, int todayMonth0, int todayDayNum,
                                  bool showMonthTitle,
                                  bool showWeekNums,
                                  bool showDowHeader,
                                  int forcedRows,
                                  bool showHolidayDots) {
  auto& d = DisplayCore::get();
  d.setTextSize(1);

  const uint16_t ink = Theme::ink();

  const int cols = 7;
  const int rows = forcedRows;

  const int titleH = showMonthTitle ? 22 : 0;
  const int titleGap = showMonthTitle ? 10 : 0;
  const int dowH = showDowHeader ? 18 : 0;

  const int padX = 12;
  const int padY = 8;

  int availW = w - 2 * padX;
  int availH = h - 2 * padY;

  if (availW < 7 * 10 || availH < (titleH + titleGap + dowH + rows * 10)) return;

  const int weekW = showWeekNums ? 26 : 0;
  const int weekPadLeft = showWeekNums ? 2 : 0;
  const int weekPadRight = showWeekNums ? 6 : 0;

  int gridAvailW = availW - weekW;
  if (gridAvailW < 7 * 9) return;

  int cellW = gridAvailW / cols;
  if (cellW < 9) cellW = 9;

  int cellH = (availH - titleH - titleGap) / rows;
  if (cellH < 10) cellH = 10;

  int blockW = weekW + cols * cellW;
  int blockH = titleH + titleGap + dowH + rows * cellH;

  int blockX = x + (w - blockW) / 2;
  int blockTop = y + (h - blockH) / 2;

  int curY = blockTop;

  if (showMonthTitle) {
    const char* mname = safeMonth(month0);
    int16_t x1, y1; uint16_t tw, th;
    measureText(mname, FONT_B12, x1, y1, tw, th);
    int tx = blockX + (blockW - (int)tw) / 2;
    int ty = curY + (titleH - (int)th) / 2;
    d.setTextColor(ink);
    d.setFont(FONT_B12);
    d.setCursor(tx - x1, ty - y1);
    d.print(mname);
    curY += titleH + titleGap;
  }

  tm first = {};
  first.tm_year = year - 1900;
  first.tm_mon  = month0;
  first.tm_mday = 1;
  first.tm_hour = 12;
  mktime(&first);

  int firstWdayMonFirst = (first.tm_wday == 0) ? 6 : first.tm_wday - 1;
  int dim = daysInMonth(year, month0);

  int dowX = blockX + weekW;

  if (showDowHeader) {
    static const char* const DOW[] = {"Mo","Tu","We","Th","Fr","Sa","Su"};
    d.setFont(FONT_9);
    d.setTextColor(ink);

    for (int c = 0; c < cols; c++) {
      int cx = dowX + c * cellW;
      int cy = curY;

      int16_t x1, y1; uint16_t tw, th;
      measureText(DOW[c], FONT_9, x1, y1, tw, th);

      int bx = cx + (cellW - (int)tw) / 2;
      int by = cy + (dowH - (int)th) / 2;

      d.setCursor(bx - x1, by - y1);
      d.print(DOW[c]);
    }
  }

  int gridTop = curY + dowH;

  if (showWeekNums && weekW > 0) {
    int divX = blockX + weekW - 1;
    int y0 = gridTop + 2;
    int y1 = gridTop + rows * cellH - 2;
    d.drawLine(divX, y0, divX, y1, ink);
  }

  if (showWeekNums) {
    d.setFont(FONT_9);
    d.setTextColor(ink);

    for (int r = 0; r < rows; r++) {
      int firstIdx = r * cols;
      int lastIdx  = r * cols + (cols - 1);

      int firstDay = firstIdx - firstWdayMonFirst + 1;
      int lastDay  = lastIdx  - firstWdayMonFirst + 1;

      if (lastDay < 1) continue;
      if (firstDay > dim) continue;

      int sampleDay = firstDay;
      if (sampleDay < 1) sampleDay = 1;
      if (sampleDay > dim) sampleDay = dim;

      int wk = weekNumberISO(year, month0, sampleDay);

      char wkStr[4];
      snprintf(wkStr, sizeof(wkStr), "%d", wk);

      int16_t x1, y1; uint16_t tw, th;
      measureText(wkStr, FONT_9, x1, y1, tw, th);

      int cellY = gridTop + r * cellH;
      int cy = cellY + (cellH - (int)th) / 2;

      int colX = blockX + weekPadLeft;
      int colW = weekW - weekPadLeft - weekPadRight;

      int bx = colX + (colW - (int)tw) / 2;
      d.setCursor(bx - x1, cy - y1);
      d.print(wkStr);
    }
  }

  d.setFont(FONT_9);

  for (int r = 0; r < rows; r++) {
    for (int c = 0; c < cols; c++) {
      int idx = r * cols + c;
      int day = idx - firstWdayMonFirst + 1;
      if (day < 1 || day > dim) continue;

      int cellX = dowX + c * cellW;
      int cellY = gridTop + r * cellH;

      int centerX = cellX + cellW / 2;
      int centerY = cellY + cellH / 2;

      char buf[4];
      snprintf(buf, sizeof(buf), "%d", day);

      int16_t x1, y1; uint16_t tw, th;
      measureText(buf, FONT_9, x1, y1, tw, th);

      bool isToday = (year == todayYear && month0 == todayMonth0 && day == todayDayNum);

      if (isToday) {
        int radius = min(cellW, cellH) / 2 - 2;
        if (radius < 10) radius = 10;
        if (radius > 16) radius = 16;

        d.fillCircle(centerX, centerY, radius, Theme::fill());
        d.setTextColor(Theme::onFill());
      } else {
        d.setTextColor(ink);
      }

      int tx = centerX - (int)tw / 2;
      int ty = centerY - (int)th / 2;
      d.setCursor(tx - x1, ty - y1);
      d.print(buf);

      if (showHolidayDots) {
        bool isHol = isHolidayInMonth(year, month0, day);
        if (isHol) {
          int dotY = cellY + cellH - 3;
          d.fillCircle(centerX, dotY, 2, isToday ? Theme::onFill() : ink);
        }
      }
    }
  }

  d.setFont(nullptr);
  d.setTextSize(1);
}

/* =========================
   Holiday list (bottom-left) — WITH UTF8->Latin1 conversion
   ========================= */
static void drawHolidayListCentered(int x, int y, int w, int h,
                                    int todayY, int todayM0, int todayD) {
  auto& d = DisplayCore::get();
  d.setTextSize(1);

  if (!g_cfg || g_cfg->date.holidayCount == 0) {
    drawCenteredLine(x, y, w, h, "No holidays", FONT_B12, Theme::ink());
    return;
  }

  const int todayKey = ymd(todayY, todayM0, todayD);

  struct Item { const HolidayItem* hi; int key; };
  Item picked[5];
  int count = 0;

  for (int pick = 0; pick < 5; pick++) {
    int bestIdx = -1;
    int bestKey = 99999999;

    for (int i = 0; i < (int)g_cfg->date.holidayCount; i++) {
      const HolidayItem& hi = g_cfg->date.holidays[i];
      int k = holidayYMD(hi);
      if (k < todayKey) continue;
      if (k >= bestKey) continue;

      bool already = false;
      for (int j = 0; j < count; j++) {
        if (picked[j].key == k) { already = true; break; }
      }
      if (already) continue;

      bestKey = k;
      bestIdx = i;
    }

    if (bestIdx < 0) break;
    picked[count].hi = &g_cfg->date.holidays[bestIdx];
    picked[count].key = bestKey;
    count++;
  }

  if (count == 0) {
    drawCenteredLine(x, y, w, h, "No holidays", FONT_B12, Theme::ink());
    return;
  }

  const uint16_t ink = Theme::ink();

  const int lineH = 32;
  const int padL  = 26;
  const int padB  = 26;
  const int gap   = 16;

  int blockH = count * lineH;

  // Date column width (fixed sample)
  int16_t dx1, dy1; uint16_t dtw, dth;
  measureText("00.00", FONT_9, dx1, dy1, dtw, dth);
  int dateColW = (int)dtw;

  // Available width for holiday name after date column
  int maxNameW = w - padL - dateColW - gap;
  if (maxNameW < 60) maxNameW = 60;

  // Measure widest name (NO truncation) but keep within available space
  int actualNameW = 0;
  for (int i = 0; i < count; i++) {
    char nameLatin[128];
    utf8ToLatin1(picked[i].hi->name, nameLatin, sizeof(nameLatin));

    int16_t x1, y1; uint16_t tw, th;
    measureText(nameLatin, FONT_B12, x1, y1, tw, th);

    int nw = (int)tw;
    if (nw > actualNameW) actualNameW = nw;
  }
  if (actualNameW > maxNameW) actualNameW = maxNameW;

  // Anchor bottom-left with padding
  int startX = x + padL;
  int startY = y + h - padB - blockH;

  for (int i = 0; i < count; i++) {
    const HolidayItem* hi = picked[i].hi;

    char dateStr[8];
    snprintf(dateStr, sizeof(dateStr), "%02d.%02d", (int)hi->day, (int)hi->month);

    int rowY = startY + i * lineH;
    int baselineY = rowY + lineH / 2;  // shared baseline

    // UTF-8 -> Latin1 conversion
    char nameLatin[128];
    utf8ToLatin1(hi->name, nameLatin, sizeof(nameLatin));

    // ---- DATE (9pt), fixed aligned column on the left ----
    int16_t tx1, ty1; uint16_t tw, th;
    measureText(dateStr, FONT_9, tx1, ty1, tw, th);

    int dateX = startX + (dateColW - (int)tw); // right-aligned within date column

    d.setFont(FONT_9);
    d.setTextColor(ink);
    d.setCursor(dateX - tx1, baselineY); // baseline-aligned
    d.print(dateStr);

    // ---- NAME (Bold12), starts after date column + gap ----
    int nameX = startX + dateColW + gap;

    d.setFont(FONT_B12);
    d.setTextColor(ink);
    d.setCursor(nameX, baselineY); // baseline-aligned
    d.print(nameLatin);
  }

  d.setFont(nullptr);
  d.setTextSize(1);
}

/* =========================
   XL Full Screen layout
   ========================= */
static void drawXLDate(const Cell& c,
                       const char* month,
                       const char* wday,
                       int year,
                       int month0,
                       int dayNum,
                       int todayYear, int todayMonth0, int todayDay) {
  const int gapX = 14;

  int leftW  = (c.w - gapX) / 2;
  int rightW = c.w - gapX - leftW;

  int leftX  = c.x;
  int rightX = c.x + leftW + gapX;

  const int gapY = 14;
  int topH    = (c.h - gapY) / 2;
  int bottomH = c.h - gapY - topH;

  int topY = c.y;
  int botY = c.y + topH + gapY;

  Cell topLeft = c;
  topLeft.x = leftX;
  topLeft.y = topY;
  topLeft.w = leftW;
  topLeft.h = topH;

  int holX = leftX;
  int holY = botY;
  int holW = leftW;
  int holH = bottomH;

  const int padTopFeb = 26;
  const int padBotMar = 26;
  const int padRight  = 26;

  int calX = rightX;
  int calW = rightW - padRight;

  int febY = topY + padTopFeb;
  int febH = topH - padTopFeb;

  int marY = botY;
  int marH = bottomH - padBotMar;

  int nextYear = year;
  int nextMonth0 = month0 + 1;
  if (nextMonth0 >= 12) { nextMonth0 = 0; nextYear = year + 1; }

  drawMediumDate(topLeft, month, wday, year, dayNum);
  drawHolidayListCentered(holX, holY, holW, holH, todayYear, todayMonth0, todayDay);

  drawMonthCalendar(calX, febY - 9, calW, febH + 8,
                    year, month0,
                    todayYear, todayMonth0, todayDay,
                    true, true, true);

  drawMonthCalendar(calX, marY, calW, marH,
                    nextYear, nextMonth0,
                    todayYear, todayMonth0, todayDay,
                    true, true, false);
}

/* =========================
   LARGE layout
   ========================= */
static void drawLargeDate(const Cell& c,
                          const char* month,
                          const char* wday,
                          int year,
                          int month0,
                          int dayNum,
                          int todayYear, int todayMonth0, int todayDay) {

  const int gapX = 14;

  int leftW  = (c.w - gapX) / 2;
  int rightW = c.w - gapX - leftW;

  int leftX  = c.x;
  int rightX = c.x + leftW + gapX;

  // LEFT = medium date block
  Cell leftCell = c;
  leftCell.x = leftX;
  leftCell.y = c.y;
  leftCell.w = leftW;
  leftCell.h = c.h;

  drawMediumDate(leftCell, month, wday, year, dayNum);

  // RIGHT = calendar centered with padding
  const int pad = 26;
  int availX = rightX + pad;
  int availY = c.y + pad;
  int availW = rightW - pad * 2;
  int availH = c.h - pad * 2;

  // compute needed rows (so we don't draw an empty 6th row)
  tm first = {};
  first.tm_year = year - 1900;
  first.tm_mon  = month0;
  first.tm_mday = 1;
  first.tm_hour = 12;
  mktime(&first);

  int firstWdayMonFirst = (first.tm_wday == 0) ? 6 : first.tm_wday - 1;
  int dim = daysInMonth(year, month0);

  int usedCells = firstWdayMonFirst + dim;
  int usedRows  = (usedCells + 6) / 7;
  if (usedRows < 4) usedRows = 4;
  if (usedRows > 5) usedRows = 5; // <-- your requirement: never show row 6 in LARGE

  drawMonthCalendarRows(availX, availY, availW, availH,
                        year, month0,
                        todayYear, todayMonth0, todayDay,
                        false,  // no title on large
                        true,
                        true,
                        usedRows,
                        false); // holiday dots OFF (only today)
}

/* ========================= */

static bool drawAdaptiveFact(const char* text, int x, int y, int w, int h,
                             const GFXfont* const* fonts, int fontCount,
                             uint16_t color = Theme::ink()) {
  if (!text || !text[0] || w <= 0 || h <= 0) return false;
  for (int i = 0; i < fontCount; ++i) {
    int16_t x1, y1; uint16_t tw, th;
    measureText(text, fonts[i], x1, y1, tw, th);
    if ((int)tw > w || (int)th > h) continue;
    auto& d = DisplayCore::get();
    d.setTextColor(color); d.setFont(fonts[i]); d.setTextSize(1);
    d.setCursor(x + (w - (int)tw) / 2 - x1, y + (h - (int)th) / 2 - y1);
    d.print(text); d.setFont(nullptr);
    return true;
  }
  return false;
}

static void uppercaseAscii(const char* input, char* output, size_t outputSize) {
  if (!output || outputSize == 0) return;
  size_t i = 0;
  for (; input && input[i] && i + 1 < outputSize; ++i) {
    const char value = input[i];
    output[i] = value >= 'a' && value <= 'z' ? value - ('a' - 'A') : value;
  }
  output[i] = '\0';
}

static void drawAdaptiveWeekdayBadge(const char* weekday, int x, int y, int w, int h) {
  char uppercase[20];
  uppercaseAscii(weekday, uppercase, sizeof(uppercase));
  const GFXfont* fonts[] = {FONT_B12, FONT_9};
  for (int i = 0; i < 2; ++i) {
    int16_t x1, y1; uint16_t tw, th;
    measureText(uppercase, fonts[i], x1, y1, tw, th);
    if ((int)tw > w - 18 || (int)th > h - 8) continue;
    const int badgeW = min(w - 4, max(62, (int)tw + 18));
    const int badgeH = min(h - 4, (int)th + 10);
    if (badgeW <= 0 || badgeH <= 0) return;
    const int badgeX = x + (w - badgeW) / 2;
    const int badgeY = y + (h - badgeH) / 2;
    DisplayCore::get().fillRect(badgeX, badgeY, badgeW, badgeH, Theme::fill());
    drawAdaptiveFact(uppercase, badgeX, badgeY, badgeW, badgeH, &fonts[i], 1, Theme::onFill());
    return;
  }
}

static void drawAdaptiveHolidays(int x, int y, int w, int h, int maxRows,
                                 int todayYear, int todayMonth0, int todayDay) {
  if (!g_cfg || maxRows < 1 || g_cfg->date.holidayCount == 0 || w <= 0 || h <= 0) return;
  const GFXfont* headingFonts[] = {FONT_B12, FONT_9};
  const GFXfont* rowFonts[] = {FONT_B12, FONT_9};
  drawAdaptiveFact("UPCOMING HOLIDAYS", x, y, w, min(22, h), headingFonts, 2);

  const int todayKey = ymd(todayYear, todayMonth0, todayDay);
  int usedKeys[2] = {0, 0};
  const int rows = min(2, maxRows);
  for (int row = 0; row < rows; ++row) {
    const HolidayItem* selected = nullptr;
    int selectedKey = 99999999;
    for (int i = 0; i < (int)g_cfg->date.holidayCount; ++i) {
      const HolidayItem& holiday = g_cfg->date.holidays[i];
      const int key = holidayYMD(holiday);
      if (key < todayKey || key >= selectedKey || key == usedKeys[0] || key == usedKeys[1]) continue;
      selected = &holiday;
      selectedKey = key;
    }
    if (!selected) break;
    usedKeys[row] = selectedKey;
    char name[128], line[144];
    utf8ToLatin1(selected->name, name, sizeof(name));
    snprintf(line, sizeof(line), "%02d.%02d  %s", (int)selected->day, (int)selected->month, name);
    const int rowY = y + 25 + row * 22;
    drawAdaptiveFact(line, x, rowY, w, min(20, y + h - rowY), rowFonts, 2);
  }
}

static int adaptiveUpcomingHolidayCount(int todayYear, int todayMonth0, int todayDay) {
  if (!g_cfg) return 0;
  const int todayKey = ymd(todayYear, todayMonth0, todayDay);
  int count = 0;
  for (int i = 0; i < (int)g_cfg->date.holidayCount && count < 2; ++i)
    if (holidayYMD(g_cfg->date.holidays[i]) >= todayKey) ++count;
  return count;
}

// Physical counterpart of app/lib/dateResponsive.mjs.  It selects a composition
// from both logical shape and measured pixel space; the twelve adaptive shapes
// share this grammar rather than owning independent render functions.
static void drawAdaptiveDate(const Cell& c, const char* month, const char* wday,
                             int year, int month0, int dayNum) {
  const int pad = min(18, max(8, min(c.w, c.h) * 7 / 100));
  const int x = c.x + pad, y = c.y + pad;
  const int w = c.w - pad * 2, h = c.h - pad * 2;
  if (w <= 0 || h <= 0) return;

  char day[4], yearText[8];
  snprintf(day, sizeof(day), "%d", dayNum);
  snprintf(yearText, sizeof(yearText), "%d", year);
  const GFXfont* dayFonts[] = {FONT_B24, FONT_B18, FONT_B12, FONT_9};
  const GFXfont* factFonts[] = {FONT_B18, FONT_B12, FONT_9};
  const GFXfont* smallFonts[] = {FONT_B12, FONT_9};

  const bool micro = c.w < 150 || c.h < 88 || (c.w < 230 && c.h < 140);
  const bool shallow = c.colSpan > c.rowSpan && c.h < 170;
  const bool fourByThree = c.colSpan == 4 && c.rowSpan == 3;
  bool expanded = !fourByThree && ((c.w >= 700 && c.h >= 330) || (c.w >= 520 && c.h >= 400));
  bool calendarSplit = false;
  if (expanded) {
    const int featureW = c.w * 48 / 100 - 18;
    const int featureH = (c.h - 42) / 2;
    if (featureW < 154 || featureH < 92) expanded = false;
  }
  if (expanded) calendarSplit = true;
  else if (c.w >= 430 && c.h >= 210)
    calendarSplit = c.w * (fourByThree ? 62 : 48) / 100 - 18 >= 154 && c.h - 32 >= 92;
  if (!calendarSplit && c.w >= 330 && c.h >= 400)
    calendarSplit = c.w - 36 >= 154 && c.h * 44 / 100 - 18 >= 92;
  const int upcomingHolidays = adaptiveUpcomingHolidayCount(year, month0, dayNum);
  const int holidayRows = expanded ? min(upcomingHolidays, c.h >= 420 ? 2 : 1)
                                   : calendarSplit && c.h >= 300 ? min(upcomingHolidays, 1) : 0;

  int heroX = x, heroY = y, heroW = w, heroH = h;
  int calX = 0, calY = 0, calW = 0, calH = 0;
  if (calendarSplit) {
    const int gap = 18;
    if (c.w < 430 && !expanded) {
      heroH = (h * 52 / 100) - gap / 2;
      calX = x; calY = heroY + heroH + gap; calW = w; calH = h - heroH - gap;
    } else {
      heroW = w * (fourByThree ? 38 : 48) / 100;
      calX = heroX + heroW + gap; calY = y; calW = w - heroW - gap; calH = h;
    }
    if (holidayRows) heroH -= min(82, 42 + holidayRows * 22) + 12;
  }

  if (micro) {
    const int weekdayH = 30;
    const int dayH = max(1, heroH - weekdayH);
    drawAdaptiveFact(day, heroX, heroY, heroW, dayH, dayFonts, 4);
    char uppercase[20]; uppercaseAscii(wday, uppercase, sizeof(uppercase));
    drawAdaptiveFact(uppercase, heroX, heroY + dayH, heroW, weekdayH, smallFonts, 2);
  } else if (shallow && !calendarSplit) {
    int weekdayW = min(heroW * 35 / 100, 180);
    int dayW = min(heroW * 20 / 100, 88);
    int yearW = c.w >= 500 ? min(70, heroW * 17 / 100) : 0;
    drawAdaptiveWeekdayBadge(wday, heroX, heroY, weekdayW, heroH);
    drawAdaptiveFact(day, heroX + weekdayW, heroY, dayW, heroH, dayFonts, 4);
    int monthW = heroW - weekdayW - dayW - yearW;
    drawAdaptiveFact(month, heroX + weekdayW + dayW, heroY, monthW, heroH, factFonts, 3);
    if (yearW) drawAdaptiveFact(yearText, heroX + heroW - yearW, heroY, yearW, heroH, smallFonts, 2);
  } else {
    const int yearH = 24;
    const int monthH = 30;
    const int weekdayH = 30;
    int groupH = min(heroH, yearH + monthH + min(104, max(58, heroW * 38 / 100)) + weekdayH);
    int top = heroY + (heroH - groupH) / 2;
    if (yearH) { drawAdaptiveFact(yearText, heroX, top, heroW, yearH, smallFonts, 2); top += yearH; }
    char uppercaseMonth[20]; uppercaseAscii(month, uppercaseMonth, sizeof(uppercaseMonth));
    drawAdaptiveFact(uppercaseMonth, heroX, top, heroW, monthH, factFonts, 3); top += monthH;
    int dayH = max(1, heroY + (heroH + groupH) / 2 - top - weekdayH);
    drawAdaptiveFact(day, heroX, top, heroW, dayH, dayFonts, 4); top += dayH;
    drawAdaptiveWeekdayBadge(wday, heroX, top, heroW, weekdayH);
  }

  if (calW >= 154 && calH >= 92) {
    if (expanded) {
      const int gap = 14, rowH = (calH - gap) / 2;
      drawMonthCalendar(calX, calY, calW, rowH, year, month0, year, month0, dayNum,
                        rowH >= 146, calW >= 190 && rowH >= 126, calW >= 168 && rowH >= 112, true);
      int nextMonth = month0 + 1, nextYear = year;
      if (nextMonth == 12) { nextMonth = 0; ++nextYear; }
      drawMonthCalendar(calX, calY + rowH + gap, calW, calH - rowH - gap,
                        nextYear, nextMonth, year, month0, dayNum,
                        calH - rowH - gap >= 146, calW >= 190 && calH - rowH - gap >= 126,
                        calW >= 168 && calH - rowH - gap >= 112, true);
    } else {
      drawMonthCalendar(calX, calY, calW, calH, year, month0, year, month0, dayNum,
                        calH >= 146, calW >= 190 && calH >= 126, calW >= 168 && calH >= 112, true);
    }
  }
  if (holidayRows) {
    const int holidayH = min(82, 42 + holidayRows * 22);
    drawAdaptiveHolidays(heroX, heroY + heroH + 12, heroW, holidayH, holidayRows,
                         year, month0, dayNum);
  }
}

static void renderDate(const Cell& c) {

  tm t;
  if (!getLocalTmQuick(t)) {
    drawCenteredLine(c.x, c.y, c.w, c.h, "DATE", FONT_B12, Theme::ink());
    return;
  }

  const char* wday  = safeWday(t.tm_wday);
  const char* month = safeMonth(t.tm_mon);

  int year = t.tm_year + 1900;
  int month0 = t.tm_mon;
  int dayNum = t.tm_mday;

  int todayYear = year;
  int todayMonth0 = month0;
  int todayDay = dayNum;

  if (c.size == CELL_ADAPTIVE) {
    drawAdaptiveDate(c, month, wday, year, month0, dayNum);
    return;
  }

  if (c.size == CELL_SMALL) {
    char line[80];
    snprintf(line, sizeof(line), "%s %d. %s", wday, dayNum, month);
    drawCenteredLine(c.x, c.y, c.w, c.h, line, FONT_B18, Theme::ink());
    return;
  }

  if (c.size == CELL_MEDIUM) {
    drawMediumDate(c, month, wday, year, dayNum);
    return;
  }

  if (c.size == CELL_LARGE) {
    drawLargeDate(c, month, wday, year, month0, dayNum, todayYear, todayMonth0, todayDay);
    return;
  }

  if (c.size == CELL_XL) {
    drawXLDate(c, month, wday, year, month0, dayNum, todayYear, todayMonth0, todayDay);
    return;
  }

  // Unknown enum value: keep drawing bounded and minimal.
  drawCenteredLine(c.x, c.y, c.w, c.h, "DATE", FONT_B12, Theme::ink());
}

namespace ModuleDate {
  void render(const Cell& c) {
    renderDate(c);
  }
}
