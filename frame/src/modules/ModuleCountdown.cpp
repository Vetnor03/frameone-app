// ===============================
// ModuleCountdown.cpp (FULL FILE - copy/paste)
// ===============================
#include "ModuleCountdown.h"
#include "DisplayCore.h"
#include "Theme.h"
#include "Config.h"
#include "DeviceIdentity.h"
#include "NetClient.h"

#include <ArduinoJson.h>
#include <string.h>
#include <math.h>
#include <time.h>

#include "Fonts/FreeSans9ptNO.h"
#include "Fonts/FreeSansBold12ptNO.h"
#include "Fonts/FreeSansBold18ptNO.h"

#define FONT_B9  (&FreeSans9pt8b)
#define FONT_B12 (&FreeSansBold12pt8b)
#define FONT_B18 (&FreeSansBold18pt8b)

#define COUNTDOWN_DEBUG 1

#if COUNTDOWN_DEBUG
  #define CD_LOG(x) Serial.print(x)
  #define CD_LOGLN(x) Serial.println(x)
#else
  #define CD_LOG(x) do {} while (0)
  #define CD_LOGLN(x) do {} while (0)
#endif

namespace ModuleCountdown {

// =========================================================
// Config + cache
// =========================================================
static const FrameConfig* g_cfg = nullptr;

static const int MAX_EVENTS = 20;

struct CountdownItem {
  bool used = false;
  bool pinned = false;
  char id[48] = {0};
  char title[96] = {0};
  char targetDate[16] = {0};   // YYYY-MM-DD
  char displayDate[24] = {0};  // optional
  int daysLeft = 0;
  bool isToday = false;
  bool isPast = false;
};

struct CountdownCache {
  bool loaded = false;
  bool ok = false;
  int count = 0;
  CountdownItem items[MAX_EVENTS];
};

static CountdownCache g_cache;

// =========================================================
// Helpers
// =========================================================
static void safeCopy(char* dst, size_t dstSize, const char* src) {
  if (!dst || dstSize == 0) return;
  if (!src) {
    dst[0] = '\0';
    return;
  }
  strlcpy(dst, src, dstSize);
}

static void utf8ToLatin1(char* out, size_t n, const char* in) {
  if (!out || n == 0) return;
  size_t oi = 0;

  for (size_t i = 0; in && in[i] && oi + 1 < n; i++) {
    uint8_t c = (uint8_t)in[i];

    if (c < 0x80) {
      out[oi++] = (char)c;
      continue;
    }

    if (c == 0xC3 && in[i + 1]) {
      uint8_t d = (uint8_t)in[i + 1];
      i++;
      switch (d) {
        case 0xB8: out[oi++] = (char)0xF8; break; // ø
        case 0x98: out[oi++] = (char)0xD8; break; // Ø
        case 0xA5: out[oi++] = (char)0xE5; break; // å
        case 0x85: out[oi++] = (char)0xC5; break; // Å
        case 0xA6: out[oi++] = (char)0xE6; break; // æ
        case 0x86: out[oi++] = (char)0xC6; break; // Æ
        default:   out[oi++] = '?'; break;
      }
      continue;
    }

    out[oi++] = '?';
  }

  out[oi] = 0;
}

static void clearCache() {
  g_cache.loaded = false;
  g_cache.ok = false;
  g_cache.count = 0;
  for (int i = 0; i < MAX_EVENTS; i++) g_cache.items[i] = CountdownItem{};
}

static void measureText(const char* text, const GFXfont* font,
                        int16_t& x1, int16_t& y1, uint16_t& tw, uint16_t& th) {
  auto& d = DisplayCore::get();
  d.setFont(font);
  d.setTextSize(1);
  d.getTextBounds(text, 0, 0, &x1, &y1, &tw, &th);
}

static int textWidth(const char* text, const GFXfont* font) {
  int16_t x1, y1;
  uint16_t tw, th;
  measureText(text, font, x1, y1, tw, th);
  return (int)tw;
}

static int fontLineHeight(const GFXfont* font) {
  if (font == FONT_B18) return 24;
  if (font == FONT_B12) return 18;
  return 14;
}

static void drawLeft(int x, int baselineY, const char* text, const GFXfont* font, uint16_t col) {
  auto& d = DisplayCore::get();
  d.setFont(font);
  d.setTextColor(col);
  d.setTextSize(1);
  d.setCursor(x, baselineY);
  d.print(text);
  d.setFont(nullptr);
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

static void fitTextToWidth(const char* src, char* dst, size_t dstSize, int maxWidth, const GFXfont* font) {
  if (!dst || dstSize == 0) return;
  dst[0] = '\0';

  if (!src || !src[0]) return;

  if (textWidth(src, font) <= maxWidth) {
    safeCopy(dst, dstSize, src);
    return;
  }

  const char* ell = "...";
  int srcLen = (int)strlen(src);

  for (int n = srcLen; n >= 1; n--) {
    char buf[128];
    int take = n;
    if (take > (int)sizeof(buf) - 4) take = (int)sizeof(buf) - 4;

    memcpy(buf, src, take);
    buf[take] = '\0';
    strcat(buf, ell);

    if (textWidth(buf, font) <= maxWidth) {
      safeCopy(dst, dstSize, buf);
      return;
    }
  }

  safeCopy(dst, dstSize, ell);
}

static bool parseYMD10(const char* iso, int& y, int& m, int& d) {
  if (!iso) return false;
  if (strlen(iso) < 10) return false;
  if (iso[4] != '-' || iso[7] != '-') return false;

  for (int i = 0; i < 10; i++) {
    if (i == 4 || i == 7) continue;
    if (iso[i] < '0' || iso[i] > '9') return false;
  }

  y = (iso[0] - '0') * 1000 + (iso[1] - '0') * 100 + (iso[2] - '0') * 10 + (iso[3] - '0');
  m = (iso[5] - '0') * 10 + (iso[6] - '0');
  d = (iso[8] - '0') * 10 + (iso[9] - '0');
  return true;
}

static int ymdToDays(int y, int m, int d) {
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  int era = y / 400;
  int yoe = y - era * 400;
  int doy = (153 * (m - 3) + 2) / 5 + d - 1;
  int doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + doe;
}

static bool getLocalTmQuick(tm& outTm) {
  if (!getLocalTime(&outTm, 10)) return false;
  return true;
}

static int diffDaysYmd(int fromY, int fromM, int fromD, int toY, int toM, int toD) {
  int a = ymdToDays(fromY, fromM, fromD);
  int b = ymdToDays(toY, toM, toD);
  return b - a;
}

static int getRotationStep4h() {
  time_t now = time(nullptr);
  if (now <= 0) return 0;
  return (int)(now / (4 * 3600));
}

static int wrapIndex(int idx, int count) {
  if (count <= 0) return 0;
  while (idx < 0) idx += count;
  while (idx >= count) idx -= count;
  return idx;
}

static void drawEmptyState(const Cell& c, const char* line1, const char* line2) {
  const GFXfont* f1 = FONT_B12;
  const GFXfont* f2 = FONT_B9;

  int lh1 = fontLineHeight(f1);
  int lh2 = fontLineHeight(f2);
  int totalH = lh1 + 6 + lh2;

  int cy = c.y + (c.h / 2) - (totalH / 2);
  int centerX = c.x + c.w / 2;

  int w1 = textWidth(line1, f1);
  int w2 = textWidth(line2, f2);

  drawLeft(centerX - w1 / 2, cy + lh1, line1, f1, Theme::ink());
  drawLeft(centerX - w2 / 2, cy + lh1 + 6 + lh2, line2, f2, Theme::ink());
}

static void formatTimeLeftLong(int days, char* out, size_t outSize) {
  if (!out || outSize == 0) return;
  out[0] = 0;

  if (days <= 0) {
    snprintf(out, outSize, "today");
    return;
  }

  int years = days / 365;
  int rem = days % 365;
  int months = rem / 30;
  int d = rem % 30;

  char buf[64] = {0};

  if (years > 0) {
    snprintf(buf + strlen(buf), sizeof(buf) - strlen(buf),
             "%d %s", years, years == 1 ? "year" : "years");

    if (months > 0) {
      strlcat(buf, " and ", sizeof(buf));
      snprintf(buf + strlen(buf), sizeof(buf) - strlen(buf),
               "%d %s", months, months == 1 ? "month" : "months");
    } else if (d > 0) {
      strlcat(buf, " and ", sizeof(buf));
      snprintf(buf + strlen(buf), sizeof(buf) - strlen(buf),
               "%d %s", d, d == 1 ? "day" : "days");
    }

    safeCopy(out, outSize, buf);
    return;
  }

  if (months > 0) {
    snprintf(buf + strlen(buf), sizeof(buf) - strlen(buf),
             "%d %s", months, months == 1 ? "month" : "months");

    if (d > 0) {
      strlcat(buf, " and ", sizeof(buf));
      snprintf(buf + strlen(buf), sizeof(buf) - strlen(buf),
               "%d %s", d, d == 1 ? "day" : "days");
    }

    safeCopy(out, outSize, buf);
    return;
  }

  snprintf(out, outSize, "%d %s", d, d == 1 ? "day" : "days");
}

static void formatDateShort(const char* iso, char* out, size_t outSize) {
  if (!out || outSize == 0) return;
  out[0] = 0;

  int y = 0, m = 0, d = 0;
  if (!parseYMD10(iso, y, m, d)) {
    safeCopy(out, outSize, iso ? iso : "--");
    return;
  }

  snprintf(out, outSize, "%02d.%02d.%04d", d, m, y);
}

static bool countdownItemLess(const CountdownItem& a, const CountdownItem& b) {
  if (a.pinned != b.pinned) return a.pinned && !b.pinned;

  if (a.isPast != b.isPast) return !a.isPast && b.isPast;

  if (a.daysLeft != b.daysLeft) return a.daysLeft < b.daysLeft;

  int ay = 0, am = 0, ad = 0;
  int by = 0, bm = 0, bd = 0;
  bool aOk = parseYMD10(a.targetDate, ay, am, ad);
  bool bOk = parseYMD10(b.targetDate, by, bm, bd);

  if (aOk && bOk) {
    int aKey = ay * 10000 + am * 100 + ad;
    int bKey = by * 10000 + bm * 100 + bd;
    if (aKey != bKey) return aKey < bKey;
  }

  return strcmp(a.title, b.title) < 0;
}

static void sortCacheItems() {
  for (int i = 0; i < g_cache.count - 1; i++) {
    for (int j = i + 1; j < g_cache.count; j++) {
      if (countdownItemLess(g_cache.items[j], g_cache.items[i])) {
        CountdownItem tmp = g_cache.items[i];
        g_cache.items[i] = g_cache.items[j];
        g_cache.items[j] = tmp;
      }
    }
  }
}

static int findNearestIdx() {
  if (!g_cache.ok || g_cache.count <= 0) return -1;
  for (int i = 0; i < g_cache.count; i++) {
    if (g_cache.items[i].used && !g_cache.items[i].isPast) return i;
  }
  for (int i = 0; i < g_cache.count; i++) {
    if (g_cache.items[i].used) return i;
  }
  return -1;
}

static int countUpcomingItems() {
  int n = 0;
  for (int i = 0; i < g_cache.count; i++) {
    if (g_cache.items[i].used && !g_cache.items[i].isPast) n++;
  }
  return n;
}

static void formatDaysNumber(int days, char* out, size_t outSize) {
  if (!out || outSize == 0) return;
  if (days <= 0) {
    snprintf(out, outSize, "0");
    return;
  }
  snprintf(out, outSize, "%d", days);
}

static void formatDaysUnit(int days, char* out, size_t outSize) {
  if (!out || outSize == 0) return;
  if (days == 1) snprintf(out, outSize, "DAG");
  else snprintf(out, outSize, "DAGER");
}

static void formatShortStatus(const CountdownItem& item, char* out, size_t outSize) {
  if (!out || outSize == 0) return;
  out[0] = 0;

  if (item.isToday) {
    safeCopy(out, outSize, "Today");
    return;
  }

  if (item.isPast) {
    int pastDays = -item.daysLeft;
    if (pastDays <= 1) safeCopy(out, outSize, "Yesterday");
    else snprintf(out, outSize, "%d days ago", pastDays);
    return;
  }

  if (item.daysLeft == 1) {
    safeCopy(out, outSize, "Tomorrow");
    return;
  }

  snprintf(out, outSize, "In %d days", item.daysLeft);
}

static void drawCenteredTextBaseline(int centerX, int baselineY, const char* text, const GFXfont* font, uint16_t col) {
  auto& d = DisplayCore::get();
  int16_t x1, y1; uint16_t tw, th;
  measureText(text, font, x1, y1, tw, th);
  d.setFont(font);
  d.setTextColor(col);
  d.setTextSize(1);
  d.setCursor(centerX - (int)tw / 2 - x1, baselineY);
  d.print(text);
  d.setFont(nullptr);
}

static void drawTopCenteredLine(int x, int topY, int w, const char* text, const GFXfont* font, uint16_t color) {
  auto& d = DisplayCore::get();
  int16_t x1, y1; uint16_t tw, th;
  measureText(text, font, x1, y1, tw, th);

  int drawX = x + (w - (int)tw) / 2 - x1;
  int baseline = topY - y1;

  d.setFont(font);
  d.setTextColor(color);
  d.setTextSize(1);
  d.setCursor(drawX, baseline);
  d.print(text);
  d.setFont(nullptr);
}

static void drawHDivider(int x, int y, int w) {
  auto& d = DisplayCore::get();
  d.drawLine(x, y, x + w - 1, y, Theme::ink());
}

static int weekdayFromYMD(int y, int m, int d) {
  static const int t[] = {0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4};
  if (m < 3) y -= 1;
  return (y + y/4 - y/100 + y/400 + t[m - 1] + d) % 7;
}

static const char* weekdayNameFromYMD(int y, int m, int d) {
  switch (weekdayFromYMD(y, m, d)) {
    case 0: return "Sunday";
    case 1: return "Monday";
    case 2: return "Tuesday";
    case 3: return "Wednesday";
    case 4: return "Thursday";
    case 5: return "Friday";
    default: return "Saturday";
  }
}

static void formatMediumBadge(const CountdownItem& item, char* out, size_t outSize) {
  if (!out || outSize == 0) return;
  out[0] = 0;

  if (item.isToday) {
    safeCopy(out, outSize, "Today");
    return;
  }

  if (item.daysLeft == 1) {
    safeCopy(out, outSize, "Tomorrow");
    return;
  }

  int y = 0, m = 0, d = 0;
  if (!parseYMD10(item.targetDate, y, m, d)) {
    formatShortStatus(item, out, outSize);
    return;
  }

  const char* wd = weekdayNameFromYMD(y, m, d);

  if (item.daysLeft <= 6) {
    safeCopy(out, outSize, wd);
    return;
  }

  if (item.daysLeft <= 13) {
    snprintf(out, outSize, "Next %s", wd);
    return;
  }

  if (item.daysLeft == 14) {
    safeCopy(out, outSize, "In 2 weeks");
    return;
  }

  if (item.daysLeft == 21) {
    safeCopy(out, outSize, "In 3 weeks");
    return;
  }

  if (item.daysLeft == 28) {
    safeCopy(out, outSize, "In 4 weeks");
    return;
  }

  if (item.daysLeft < 30) {
    snprintf(out, outSize, "In %d days", item.daysLeft);
    return;
  }

  if (item.daysLeft < 60) {
    safeCopy(out, outSize, "Next month");
    return;
  }

  formatShortStatus(item, out, outSize);
}

static void formatEventDaysLine(const CountdownItem& item, char* out, size_t outSize) {
  if (!out || outSize == 0) return;
  char right[32];
  if (item.isToday) safeCopy(right, sizeof(right), "Today");
  else if (item.daysLeft == 1) safeCopy(right, sizeof(right), "Tomorrow");
  else if (item.daysLeft <= 13) {
    int y = 0, m = 0, d = 0;
    if (parseYMD10(item.targetDate, y, m, d)) {
      if (item.daysLeft <= 6) safeCopy(right, sizeof(right), weekdayNameFromYMD(y, m, d));
      else snprintf(right, sizeof(right), "Next %s", weekdayNameFromYMD(y, m, d));
    } else {
      snprintf(right, sizeof(right), "%d days", item.daysLeft);
    }
  } else if (item.daysLeft == 14) {
    safeCopy(right, sizeof(right), "In 2 weeks");
  } else {
    snprintf(right, sizeof(right), "%d days", item.daysLeft);
  }

  snprintf(out, outSize, "%s - %s", item.title, right);
}

static void formatStatusTiny(const CountdownItem& item, char* out, size_t outSize) {
  if (!out || outSize == 0) return;
  if (item.isToday) safeCopy(out, outSize, "TODAY");
  else if (item.daysLeft == 1) safeCopy(out, outSize, "TOMORROW");
  else snprintf(out, outSize, "IN %d DAYS", item.daysLeft);
}

// =========================================================
// Card / list helpers
// =========================================================
static void drawCountdownPageCard(int x, int y, int w, int h, const CountdownItem& item, bool compactTitle) {
  auto& d = DisplayCore::get();
  const uint16_t ink = Theme::ink();

  if (w < 60 || h < 60) return;

  const int headerH = compactTitle ? 18 : 20;
  const int footerH = 18;
  const int centerX = x + w / 2;

  d.drawRect(x, y, w, h, ink);
  d.drawLine(x + 1, y + headerH, x + w - 2, y + headerH, ink);
  d.drawLine(x + 1, y + h - footerH, x + w - 2, y + h - footerH, ink);

  d.fillRect(x + 10, y + 4, 5, 5, ink);
  d.fillRect(x + w - 15, y + 4, 5, 5, ink);

  char titleBuf[96];
  fitTextToWidth(item.title, titleBuf, sizeof(titleBuf), w - 12, compactTitle ? FONT_B9 : FONT_B12);
  drawCenteredLine(x + 3, y + 1, w - 6, headerH - 1, titleBuf, compactTitle ? FONT_B9 : FONT_B12, ink);

  char numBuf[16];
  char unitBuf[16];
  formatDaysNumber(item.daysLeft, numBuf, sizeof(numBuf));
  formatDaysUnit(item.daysLeft, unitBuf, sizeof(unitBuf));

  int contentY = y + headerH + 2;
  int contentH = h - headerH - footerH - 4;

  int16_t nx1, ny1; uint16_t nw, nh;
  measureText(numBuf, FONT_B18, nx1, ny1, nw, nh);

  int16_t ux1, uy1; uint16_t uw, uh;
  measureText(unitBuf, FONT_B9, ux1, uy1, uw, uh);

  int blockH = (int)nh + 5 + (int)uh;
  int numTop = contentY + (contentH - blockH) / 2;
  int numBase = numTop - ny1;
  int unitTop = numTop + (int)nh + 5;
  int unitBase = unitTop - uy1;

  d.setFont(FONT_B18);
  d.setTextColor(ink);
  d.setTextSize(1);
  d.setCursor(centerX - (int)nw / 2 - nx1, numBase);
  d.print(numBuf);

  d.setFont(FONT_B9);
  d.setCursor(centerX - (int)uw / 2 - ux1, unitBase);
  d.print(unitBuf);
  d.setFont(nullptr);

  char footerBuf[24];
  if (item.displayDate[0]) safeCopy(footerBuf, sizeof(footerBuf), item.displayDate);
  else formatDateShort(item.targetDate, footerBuf, sizeof(footerBuf));
  drawCenteredLine(x + 3, y + h - footerH + 1, w - 6, footerH - 1, footerBuf, FONT_B9, ink);
}

static void drawCurrentDetailBlock(int x, int y, int w, int h, const CountdownItem& item) {
  char titleBuf[96];
  fitTextToWidth(item.title, titleBuf, sizeof(titleBuf), w, FONT_B18);

  char statusBuf[24];
  formatStatusTiny(item, statusBuf, sizeof(statusBuf));

  char dateBuf[24];
  if (item.displayDate[0]) safeCopy(dateBuf, sizeof(dateBuf), item.displayDate);
  else formatDateShort(item.targetDate, dateBuf, sizeof(dateBuf));

  char longBuf[64];
  formatTimeLeftLong(item.daysLeft, longBuf, sizeof(longBuf));

  int16_t tx1, ty1; uint16_t tw, th;
  measureText(titleBuf, FONT_B18, tx1, ty1, tw, th);
  int16_t sx1, sy1; uint16_t sw, sh;
  measureText(statusBuf, FONT_B12, sx1, sy1, sw, sh);
  int16_t dx1, dy1; uint16_t dw, dh;
  measureText(dateBuf, FONT_B9, dx1, dy1, dw, dh);
  int16_t lx1, ly1; uint16_t lw, lh;
  measureText(longBuf, FONT_B12, lx1, ly1, lw, lh);

  int totalH = (int)th + 6 + (int)sh + 6 + (int)dh + 8 + (int)lh;
  int top = y + (h - totalH) / 2;

  drawLeft(x, top - ty1, titleBuf, FONT_B18, Theme::ink());
  drawLeft(x, top + (int)th + 6 - sy1, statusBuf, FONT_B12, Theme::ink());
  drawLeft(x, top + (int)th + 6 + (int)sh + 6 - dy1, dateBuf, FONT_B9, Theme::ink());
  drawLeft(x, top + (int)th + 6 + (int)sh + 6 + (int)dh + 8 - ly1, longBuf, FONT_B12, Theme::ink());
}

// =========================================================
// XL sketch/calendar helpers
// =========================================================
static const char* const CD_MONTHS_SHORT[] = {
  "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"
};

static const char* const CD_MONTHS_FULL[] = {
  "January","February","March","April","May","June","July","August","September","October","November","December"
};

static const char* const CD_DOW_SHORT[] = {
  "Mo","Tu","We","Th","Fr","Sa","Su"
};

static const char* cdSafeMonthFull(int m0) {
  if (m0 < 0 || m0 > 11) return "January";
  return CD_MONTHS_FULL[m0];
}

static const char* cdSafeMonthShort(int m0) {
  if (m0 < 0 || m0 > 11) return "Jan";
  return CD_MONTHS_SHORT[m0];
}

static int cdDaysInMonth(int year, int month0) {
  static const int mdays[] = {31,28,31,30,31,30,31,31,30,31,30,31};
  int d = mdays[month0];
  bool leap = ((year % 4 == 0) && (year % 100 != 0)) || (year % 400 == 0);
  if (month0 == 1 && leap) d = 29;
  return d;
}

static int cdYmdKey(int y, int m0, int d) {
  return y * 10000 + (m0 + 1) * 100 + d;
}

static bool cdSameDate(int y1, int m01, int d1, int y2, int m02, int d2) {
  return (y1 == y2 && m01 == m02 && d1 == d2);
}

static bool cdIsTargetDate(const CountdownItem& item, int y, int m0, int d) {
  int ty = 0, tm = 0, td = 0;
  if (!parseYMD10(item.targetDate, ty, tm, td)) return false;
  return cdSameDate(y, m0, d, ty, tm - 1, td);
}

static bool cdIsCrossedDay(const CountdownItem& item,
                           int y, int m0, int d,
                           int todayY, int todayM0, int todayD) {
  int ty = 0, tm = 0, td = 0;
  if (!parseYMD10(item.targetDate, ty, tm, td)) return false;

  int dayKey = cdYmdKey(y, m0, d);
  int todayKey = cdYmdKey(todayY, todayM0, todayD);
  int targetKey = cdYmdKey(ty, tm - 1, td);

  return (dayKey < todayKey && dayKey < targetKey);
}

static int cdPickVariant(int seed, int count) {
  if (count <= 0) return 0;
  if (seed < 0) seed = -seed;
  return seed % count;
}

static void drawHumanX(int cx, int cy, int cellW, int cellH, int variant) {
  auto& d = DisplayCore::get();
  const uint16_t ink = Theme::ink();

  int baseW = max(8, min(cellW - 8, 14));
  int baseH = max(8, min(cellH - 8, 14));

  int w = baseW;
  int h = baseH;

  int ox = 0;
  int oy = 0;

  switch (variant % 5) {
    case 0:
      w = baseW;
      h = baseH + 1;
      ox = 0;  oy = -1;
      break;
    case 1:
      w = baseW - 1;
      h = baseH + 2;
      ox = 1;  oy = 0;
      break;
    case 2:
      w = baseW + 1;
      h = baseH;
      ox = -1; oy = 1;
      break;
    case 3:
      w = baseW;
      h = baseH + 2;
      ox = 0;  oy = 1;
      break;
    default:
      w = baseW + 1;
      h = baseH + 1;
      ox = -1; oy = -1;
      break;
  }

  int x0 = cx - w / 2 + ox;
  int y0 = cy - h / 2 + oy;
  int x1 = cx + w / 2 + ox;
  int y1 = cy + h / 2 + oy;

  auto thickLine = [&](int ax, int ay, int bx, int by) {
    d.drawLine(ax, ay, bx, by, ink);
    d.drawLine(ax + 1, ay, bx + 1, by, ink);
  };

  switch (variant % 5) {
    case 0:
      thickLine(x0,     y0 + 1, x1 - 1, y1);
      thickLine(x0 + 1, y1,     x1,     y0 + 1);
      break;
    case 1:
      thickLine(x0 + 1, y0,     x1,     y1 - 1);
      thickLine(x0,     y1 - 1, x1 - 2, y0 + 1);
      break;
    case 2:
      thickLine(x0,     y0,     x1 - 2, y1);
      thickLine(x0 + 2, y1,     x1,     y0 + 2);
      break;
    case 3:
      thickLine(x0 + 1, y0 + 1, x1,     y1);
      thickLine(x0,     y1 - 2, x1 - 1, y0);
      break;
    default:
      thickLine(x0,     y0 + 2, x1,     y1 - 1);
      thickLine(x0 + 2, y1,     x1 - 1, y0);
      break;
  }
}

static void drawHumanCircle(int cx, int cy, int cellW, int cellH, int variant) {
  auto& d = DisplayCore::get();
  const uint16_t ink = Theme::ink();

  int rx = max(9, min(cellW / 2 - 3, 13));
  int ry = max(9, min(cellH / 2 - 3, 13));

  int dx[5][8] = {
    {-rx, -rx/2, 0, rx/2, rx, rx/2, 0, -rx/2},
    {-rx+1, -rx/2, 1, rx/2+1, rx, rx/2, -1, -rx/2-1},
    {-rx, -rx/2-1, 0, rx/2, rx-1, rx/2, 0, -rx/2},
    {-rx+1, -rx/2, 0, rx/2+1, rx, rx/2-1, -1, -rx/2},
    {-rx, -rx/2, 1, rx/2, rx, rx/2+1, 0, -rx/2-1}
  };

  int dy[5][8] = {
    {0, -ry, -ry+1, -ry, 0, ry, ry-1, ry},
    {-1, -ry, -ry+1, -ry+1, 0, ry-1, ry, ry},
    {0, -ry+1, -ry, -ry, 1, ry, ry-1, ry-1},
    {1, -ry, -ry+1, -ry, 0, ry-1, ry, ry},
    {0, -ry+1, -ry, -ry+1, 0, ry, ry-1, ry}
  };

  auto thickLine = [&](int ax, int ay, int bx, int by) {
    d.drawLine(ax, ay, bx, by, ink);
    d.drawLine(ax + 1, ay, bx + 1, by, ink);
  };

  int v = variant % 5;
  for (int i = 0; i < 7; i++) {
    int x0 = cx + dx[v][i];
    int y0 = cy + dy[v][i];
    int x1 = cx + dx[v][i + 1];
    int y1 = cy + dy[v][i + 1];
    thickLine(x0, y0, x1, y1);
  }
}

static void drawCrookedTargetNote(const CountdownItem& item,
                                  int targetCx, int targetCy,
                                  int variant) {
  auto& d = DisplayCore::get();

  char note[48];
  fitTextToWidth(item.title, note, sizeof(note), 78, FONT_B9);

  int16_t x1, y1; uint16_t tw, th;
  measureText(note, FONT_B9, x1, y1, tw, th);

  int offX[5] = {-14, -10, -16, -12, -15};
  int offY[5] = {-15, -13, -17, -14, -12};

  int v = variant % 5;
  int x = targetCx + offX[v];
  int y = targetCy + offY[v];

  d.setFont(FONT_B9);
  d.setTextColor(Theme::ink());
  d.setTextSize(1);
  d.setCursor(x - x1, y - y1);
  d.print(note);
  d.setFont(nullptr);
  d.setTextSize(1);
}

static void drawCountdownCalendarMonth(int x, int y, int w, int h,
                                       int year, int month0,
                                       int todayY, int todayM0, int todayD,
                                       const CountdownItem& trackedItem,
                                       bool drawNoteIfTargetVisible,
                                       bool showDowHeader) {
  auto& d = DisplayCore::get();
  d.setTextSize(1);

  const uint16_t ink = Theme::ink();

  const int cols = 7;
  const int padX = 10;
  const int padY = 8;
  const int titleH = 18;
  const int dowH = 14;
  const int gapAfterTitle = 6;
  const int gapAfterDow = 4;

  int availW = w - padX * 2;
  int availH = h - padY * 2;
  if (availW < 70 || availH < 70) return;

  tm first = {};
  first.tm_year = year - 1900;
  first.tm_mon  = month0;
  first.tm_mday = 1;
  first.tm_hour = 12;
  mktime(&first);

  int firstWdayMonFirst = (first.tm_wday == 0) ? 6 : (first.tm_wday - 1);
  int dim = cdDaysInMonth(year, month0);
  int usedCells = firstWdayMonFirst + dim;
  int rows = (usedCells + 6) / 7;
  if (rows < 4) rows = 4;
  if (rows > 6) rows = 6;

  int actualDowH = showDowHeader ? dowH : 0;
int actualGapAfterDow = showDowHeader ? gapAfterDow : 0;

int gridTop = y + padY + titleH + gapAfterTitle + actualDowH + actualGapAfterDow;
int cellW = availW / cols;
int cellH = (availH - titleH - gapAfterTitle - actualDowH - actualGapAfterDow) / rows;

  int gridW = cellW * cols;
  int gridX = x + (w - gridW) / 2;

  drawTopCenteredLine(x, y + padY + 2, w, cdSafeMonthFull(month0), FONT_B12, ink);

  if (showDowHeader) {
  for (int ccol = 0; ccol < cols; ccol++) {
    int cx = gridX + ccol * cellW;
    drawCenteredLine(cx, y + padY + titleH + gapAfterTitle, cellW, dowH, CD_DOW_SHORT[ccol], FONT_B9, ink);
  }
}

  bool targetNoteDone = false;

  for (int r = 0; r < rows; r++) {
    for (int ccol = 0; ccol < cols; ccol++) {
      int idx = r * cols + ccol;
      int day = idx - firstWdayMonFirst + 1;
      if (day < 1 || day > dim) continue;

      int cellX = gridX + ccol * cellW;
      int cellY = gridTop + r * cellH;
      int centerX = cellX + cellW / 2;
      int centerY = cellY + cellH / 2;

      char buf[4];
      snprintf(buf, sizeof(buf), "%d", day);

      d.setTextColor(ink);
      drawCenteredLine(cellX, cellY, cellW, cellH, buf, FONT_B9, ink);

      int seed = year * 1000 + month0 * 100 + day * 7;

      if (cdIsCrossedDay(trackedItem, year, month0, day, todayY, todayM0, todayD)) {
        drawHumanX(centerX, centerY, cellW, cellH, cdPickVariant(seed, 5));
      }

      if (cdIsTargetDate(trackedItem, year, month0, day)) {
  int v = cdPickVariant(seed + 17, 5);
  drawHumanCircle(centerX, centerY, cellW, cellH, v);
}
    }
  }

  d.setFont(nullptr);
  d.setTextSize(1);
}

// =========================================================
// Small line builder
// =========================================================
enum SmallTemplateKind {
  SMALL_TPL_ONLY_UNTIL = 0,
  SMALL_TPL_IN,
  SMALL_TPL_LEFT_TO_GO,
  SMALL_TPL_COUNTING_TO,
  SMALL_TPL_IS_IN,
  SMALL_TPL_COMING_UP,
  SMALL_TPL_NEXT_STOP,
  SMALL_TPL_NOT_LONG_NOW,
  SMALL_TPL_BIG_DAY,
  SMALL_TPL_ALMOST_THERE,
  SMALL_TPL_LAST_STRETCH,
  SMALL_TPL_SOON_NOW,
  SMALL_TPL_CLOSE_NOW
};

static int pickTemplateKind(int daysLeft) {
  int rot = getRotationStep4h();

  static const SmallTemplateKind farSet[] = {
    SMALL_TPL_ONLY_UNTIL,
    SMALL_TPL_IN,
    SMALL_TPL_LEFT_TO_GO,
    SMALL_TPL_COUNTING_TO,
    SMALL_TPL_IS_IN,
    SMALL_TPL_COMING_UP,
    SMALL_TPL_NEXT_STOP
  };

  static const SmallTemplateKind midSet[] = {
    SMALL_TPL_ONLY_UNTIL,
    SMALL_TPL_IN,
    SMALL_TPL_LEFT_TO_GO,
    SMALL_TPL_COUNTING_TO,
    SMALL_TPL_IS_IN,
    SMALL_TPL_COMING_UP,
    SMALL_TPL_NOT_LONG_NOW,
    SMALL_TPL_BIG_DAY
  };

  static const SmallTemplateKind nearSet[] = {
    SMALL_TPL_ONLY_UNTIL,
    SMALL_TPL_IN,
    SMALL_TPL_ALMOST_THERE,
    SMALL_TPL_SOON_NOW,
    SMALL_TPL_LAST_STRETCH,
    SMALL_TPL_CLOSE_NOW,
    SMALL_TPL_BIG_DAY,
    SMALL_TPL_NOT_LONG_NOW
  };

  if (daysLeft <= 7) {
    return (int)nearSet[wrapIndex(rot, (int)(sizeof(nearSet) / sizeof(nearSet[0])))];
  }
  if (daysLeft <= 45) {
    return (int)midSet[wrapIndex(rot, (int)(sizeof(midSet) / sizeof(midSet[0])))];
  }
  return (int)farSet[wrapIndex(rot, (int)(sizeof(farSet) / sizeof(farSet[0])))];
}

static void buildSmallLineParts(const CountdownItem& item,
                                char* left,
                                size_t leftSize,
                                char* boldA,
                                size_t boldASize,
                                char* mid,
                                size_t midSize,
                                char* boldB,
                                size_t boldBSize) {
  if (!left || !boldA || !mid || !boldB) return;

  left[0] = 0;
  boldA[0] = 0;
  mid[0] = 0;
  boldB[0] = 0;

  char timeLong[64];
  formatTimeLeftLong(item.daysLeft, timeLong, sizeof(timeLong));

  const int tpl = pickTemplateKind(item.daysLeft);

  if (item.daysLeft <= 0) {
    safeCopy(left, leftSize, "");
    safeCopy(boldA, boldASize, item.title);
    safeCopy(mid, midSize, " today");
    safeCopy(boldB, boldBSize, "");
    return;
  }

  switch (tpl) {
    case SMALL_TPL_ONLY_UNTIL:
      safeCopy(left, leftSize, "Only ");
      safeCopy(boldA, boldASize, timeLong);
      safeCopy(mid, midSize, " until ");
      safeCopy(boldB, boldBSize, item.title);
      break;

    case SMALL_TPL_IN:
      safeCopy(left, leftSize, "");
      safeCopy(boldA, boldASize, item.title);
      safeCopy(mid, midSize, " in ");
      safeCopy(boldB, boldBSize, timeLong);
      break;

    case SMALL_TPL_LEFT_TO_GO:
      safeCopy(left, leftSize, "");
      safeCopy(boldA, boldASize, timeLong);
      safeCopy(mid, midSize, " left to ");
      safeCopy(boldB, boldBSize, item.title);
      break;

    case SMALL_TPL_COUNTING_TO:
      safeCopy(left, leftSize, "Counting to ");
      safeCopy(boldA, boldASize, item.title);
      safeCopy(mid, midSize, " in ");
      safeCopy(boldB, boldBSize, timeLong);
      break;

    case SMALL_TPL_IS_IN:
      safeCopy(left, leftSize, "");
      safeCopy(boldA, boldASize, item.title);
      safeCopy(mid, midSize, " is in ");
      safeCopy(boldB, boldBSize, timeLong);
      break;

    case SMALL_TPL_COMING_UP:
      safeCopy(left, leftSize, "");
      safeCopy(boldA, boldASize, item.title);
      safeCopy(mid, midSize, " coming up in ");
      safeCopy(boldB, boldBSize, timeLong);
      break;

    case SMALL_TPL_NEXT_STOP:
      safeCopy(left, leftSize, "Next stop ");
      safeCopy(boldA, boldASize, item.title);
      safeCopy(mid, midSize, " in ");
      safeCopy(boldB, boldBSize, timeLong);
      break;

    case SMALL_TPL_NOT_LONG_NOW:
      safeCopy(left, leftSize, "Not long now ");
      safeCopy(boldA, boldASize, timeLong);
      safeCopy(mid, midSize, " until ");
      safeCopy(boldB, boldBSize, item.title);
      break;

    case SMALL_TPL_BIG_DAY:
      safeCopy(left, leftSize, "Big day ");
      safeCopy(boldA, boldASize, item.title);
      safeCopy(mid, midSize, " in ");
      safeCopy(boldB, boldBSize, timeLong);
      break;

    case SMALL_TPL_ALMOST_THERE:
      safeCopy(left, leftSize, "Almost there ");
      safeCopy(boldA, boldASize, timeLong);
      safeCopy(mid, midSize, " to ");
      safeCopy(boldB, boldBSize, item.title);
      break;

    case SMALL_TPL_SOON_NOW:
      safeCopy(left, leftSize, "");
      safeCopy(boldA, boldASize, item.title);
      safeCopy(mid, midSize, " soon ");
      safeCopy(boldB, boldBSize, timeLong);
      break;

    case SMALL_TPL_LAST_STRETCH:
      safeCopy(left, leftSize, "Last stretch - ");
      safeCopy(boldA, boldASize, timeLong);
      safeCopy(mid, midSize, " until ");
      safeCopy(boldB, boldBSize, item.title);
      break;

    case SMALL_TPL_CLOSE_NOW:
    default:
      safeCopy(left, leftSize, "");
      safeCopy(boldA, boldASize, item.title);
      safeCopy(mid, midSize, " in ");
      safeCopy(boldB, boldBSize, timeLong);
      break;
  }
}

// =========================================================
// Fetch
// =========================================================
static bool fetchCountdowns() {
  clearCache();

String url = String(BASE_URL)
           + "/api/device/countdowns?device_id="
           + DeviceIdentity::getDeviceId()
             + "&limit=20&tz=Europe/Oslo";

  int code = 0;
  String body;
  bool ok = NetClient::httpGetAuth(url, DeviceIdentity::getToken(), code, body);

  CD_LOG("countdown HTTP: ");
  CD_LOGLN(code);
  CD_LOGLN(body);

  if (!ok || code != 200 || body.length() == 0) {
    g_cache.loaded = true;
    g_cache.ok = false;
    return false;
  }

  StaticJsonDocument<16384> doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    CD_LOGLN("countdown JSON parse failed");
    g_cache.loaded = true;
    g_cache.ok = false;
    return false;
  }

  JsonArray items = doc["items"].as<JsonArray>();
  if (items.isNull()) {
    g_cache.loaded = true;
    g_cache.ok = true;
    g_cache.count = 0;
    return true;
  }

  tm nowTm;
  bool haveNow = getLocalTmQuick(nowTm);
  int nowY = haveNow ? (nowTm.tm_year + 1900) : 0;
  int nowM = haveNow ? (nowTm.tm_mon + 1) : 0;
  int nowD = haveNow ? nowTm.tm_mday : 0;

  int idx = 0;
  for (JsonObject it : items) {
    if (idx >= MAX_EVENTS) break;

    CountdownItem& e = g_cache.items[idx];
    e.used = true;
    e.pinned = it["pinned"] | false;

    safeCopy(e.id, sizeof(e.id), it["id"] | it["event_id"] | "");

    const char* rawTitle = it["title"] | it["name"] | "";
    utf8ToLatin1(e.title, sizeof(e.title), rawTitle);

    const char* rawTarget = it["target_date"] | it["date"] | "";
    safeCopy(e.targetDate, sizeof(e.targetDate), rawTarget);

    const char* rawDisplay = it["display_date"] | "";
    utf8ToLatin1(e.displayDate, sizeof(e.displayDate), rawDisplay);

    bool daysProvided = !it["days_left"].isNull();
    if (daysProvided) {
      e.daysLeft = it["days_left"] | 0;
    } else if (haveNow) {
      int ty = 0, tmn = 0, td = 0;
      if (parseYMD10(e.targetDate, ty, tmn, td)) {
        e.daysLeft = diffDaysYmd(nowY, nowM, nowD, ty, tmn, td);
      } else {
        e.daysLeft = 0;
      }
    } else {
      e.daysLeft = 0;
    }

    e.isToday = (e.daysLeft == 0);
    e.isPast = (e.daysLeft < 0);

    idx++;
  }

  g_cache.loaded = true;
  g_cache.ok = true;
  g_cache.count = idx;

  sortCacheItems();
  return true;
}

static void ensureLoaded() {
  if (g_cache.loaded) return;
  fetchCountdowns();
}

// =========================================================
// SMALL
// =========================================================
static void renderSmall(const Cell& c) {
  if (!g_cache.ok) {
    drawEmptyState(c, "No Countdown", "Fetch failed");
    return;
  }

  int idx = findNearestIdx();
  if (idx < 0) {
    drawEmptyState(c, "No Countdown", "No events yet");
    return;
  }

  const CountdownItem& item = g_cache.items[idx];

  char left[64], boldA[96], mid[64], boldB[96];
  buildSmallLineParts(item, left, sizeof(left), boldA, sizeof(boldA), mid, sizeof(mid), boldB, sizeof(boldB));

  char fullLine[220];
  fullLine[0] = '\0';
  strlcat(fullLine, left, sizeof(fullLine));
  strlcat(fullLine, boldA, sizeof(fullLine));
  strlcat(fullLine, mid, sizeof(fullLine));
  strlcat(fullLine, boldB, sizeof(fullLine));

  char fitBuf[220];
  fitTextToWidth(fullLine, fitBuf, sizeof(fitBuf), c.w - 16, FONT_B12);

  drawCenteredLine(c.x, c.y, c.w, c.h, fitBuf, FONT_B12, Theme::ink());
}

// =========================================================
// MEDIUM
// =========================================================
static void renderMedium(const Cell& c) {
  if (!g_cache.ok) {
    drawEmptyState(c, "No Countdown", "Fetch failed");
    return;
  }

  int idx = findNearestIdx();
  if (idx < 0) {
    drawEmptyState(c, "No Countdown", "No events yet");
    return;
  }

  const CountdownItem& item = g_cache.items[idx];
  auto& d = DisplayCore::get();

  char titleBuf[96];
  fitTextToWidth(item.title, titleBuf, sizeof(titleBuf), c.w - 20, FONT_B12);

  char numBuf[16];
  formatDaysNumber(item.daysLeft, numBuf, sizeof(numBuf));

  char unitBuf[16];
  formatDaysUnit(item.daysLeft, unitBuf, sizeof(unitBuf));

  char badgeBuf[32];
  formatMediumBadge(item, badgeBuf, sizeof(badgeBuf));

  int16_t tx1, ty1, nx1, ny1, ux1, uy1, bx1, by1;
  uint16_t tw, th, nw, nh, uw, uh, bw, bh;

  measureText(titleBuf, FONT_B12, tx1, ty1, tw, th);
  measureText(numBuf,   FONT_B18, nx1, ny1, nw, nh);
  measureText(unitBuf,  FONT_B9,  ux1, uy1, uw, uh);
  measureText(badgeBuf, FONT_B12, bx1, by1, bw, bh);

  const int gap1 = 10;
  const int gap2 = 14;
  const int gap3 = 18;

  const int rectPadX = 18;
  const int rectPadY = 10;

  int rectW = (int)bw + rectPadX * 2;
  int rectH = (int)bh + rectPadY * 2;

  if (rectW > c.w - 16) rectW = c.w - 16;

  int totalH = (int)th + gap1 + (int)nh + gap2 + (int)uh + gap3 + rectH;
  int top = c.y + (c.h - totalH) / 2;

  {
    int bx = c.x + (c.w - (int)tw) / 2;
    int by = top;
    d.setTextColor(Theme::ink());
    d.setFont(FONT_B12);
    d.setTextSize(1);
    d.setCursor(bx - tx1, by - ty1);
    d.print(titleBuf);
  }

  int numTop = top + (int)th + gap1;
  {
    int bx = c.x + (c.w - (int)nw) / 2;
    int by = numTop;
    d.setTextColor(Theme::ink());
    d.setFont(FONT_B18);
    d.setTextSize(1);
    d.setCursor(bx - nx1, by - ny1);
    d.print(numBuf);
  }

  int unitTop = numTop + (int)nh + gap2;
  {
    int bx = c.x + (c.w - (int)uw) / 2;
    int by = unitTop;
    d.setTextColor(Theme::ink());
    d.setFont(FONT_B9);
    d.setTextSize(1);
    d.setCursor(bx - ux1, by - uy1);
    d.print(unitBuf);
  }

  int rectTop = unitTop + (int)uh + gap3;
  int rectX = c.x + (c.w - rectW) / 2;

  d.fillRect(rectX, rectTop, rectW, rectH, GxEPD_WHITE);

  {
    int bx = rectX + (rectW - (int)bw) / 2;
    int by = rectTop + (rectH - (int)bh) / 2;

    d.setTextColor(GxEPD_BLACK);
    d.setFont(FONT_B12);
    d.setTextSize(1);
    d.setCursor(bx - bx1, by - by1);
    d.print(badgeBuf);
  }

  d.setFont(nullptr);
  d.setTextSize(1);
}

// =========================================================
// LARGE
// =========================================================
static void renderLarge(const Cell& c) {
  if (!g_cache.ok) {
    drawEmptyState(c, "No Countdown", "Fetch failed");
    return;
  }

  int idx = findNearestIdx();
  if (idx < 0) {
    drawEmptyState(c, "No Countdown", "No events yet");
    return;
  }

  const CountdownItem& item = g_cache.items[idx];
  auto& d = DisplayCore::get();

  const int gapX = 14;
  int leftW  = (c.w - gapX) / 2;
  int rightW = c.w - gapX - leftW;

  int leftX  = c.x;
  int rightX = c.x + leftW + gapX;

  {
    Cell leftCell = c;
    leftCell.x = leftX;
    leftCell.y = c.y;
    leftCell.w = leftW;
    leftCell.h = c.h;
    renderMedium(leftCell);
  }

  {
    int panelX = rightX;
    int panelY = c.y;
    int panelW = rightW;
    int panelH = c.h;

    if (countUpcomingItems() <= 1) {
      drawCenteredLine(panelX, panelY, panelW, panelH, "No more events", FONT_B12, Theme::ink());
      return;
    }

    int16_t tx1, ty1; uint16_t tw, th;
    char tmpTitle[96];
    fitTextToWidth(item.title, tmpTitle, sizeof(tmpTitle), leftW - 20, FONT_B12);
    measureText(tmpTitle, FONT_B12, tx1, ty1, tw, th);

    const int gap1 = 10;
    const int gap2 = 14;
    const int gap3 = 18;

    int heroTotalH = (int)th + gap1 + 24 + gap2 + 14 + gap3 + 32;
    int sharedTop = panelY + (panelH - heroTotalH) / 2;

    const CountdownItem* rows[4] = {nullptr, nullptr, nullptr, nullptr};
    int found = 0;
    bool skippedHero = false;

    for (int i = 0; i < g_cache.count && found < 4; i++) {
      const CountdownItem& it = g_cache.items[i];
      if (!it.used || it.isPast) continue;

      if (!skippedHero) {
        skippedHero = true;
        continue;
      }

      rows[found++] = &it;
    }

    if (found <= 0) {
      drawCenteredLine(panelX, panelY, panelW, panelH, "No more events", FONT_B12, Theme::ink());
      return;
    }

    const int bulletR = 3;
    const int bulletGap = 8;
    const int rowGap = 14;

    char lineBufs[4][128];
    int lineWidths[4] = {0, 0, 0, 0};
    int maxLineW = 0;

    for (int i = 0; i < found; i++) {
      char rawBuf[128];
      formatEventDaysLine(*rows[i], rawBuf, sizeof(rawBuf));
      fitTextToWidth(rawBuf, lineBufs[i], sizeof(lineBufs[i]), panelW - 20, FONT_B9);
      lineWidths[i] = textWidth(lineBufs[i], FONT_B9);
      if (lineWidths[i] > maxLineW) maxLineW = lineWidths[i];
    }

    const char* hdr = "COMING UP";
    int headerW = textWidth(hdr, FONT_B9);

    int blockTextW = max(maxLineW, headerW);
    int blockW = bulletR * 2 + bulletGap + blockTextW;
    if (blockW > panelW - 8) blockW = panelW - 8;

    int blockX = panelX + (panelW - blockW) / 2;

    {
      int16_t hx1, hy1; uint16_t hw, hh;
      measureText(hdr, FONT_B9, hx1, hy1, hw, hh);

      int bx = panelX + (panelW - (int)hw) / 2;
      int by = sharedTop;

      d.setFont(FONT_B9);
      d.setTextColor(Theme::ink());
      d.setTextSize(1);
      d.setCursor(bx - hx1, by - hy1);
      d.print(hdr);
    }

    int rowY = sharedTop + (int)th + gap1;

    for (int i = 0; i < found; i++) {
      int16_t x1, y1; uint16_t tw2, th2;
      measureText(lineBufs[i], FONT_B9, x1, y1, tw2, th2);

      int baseline = rowY - y1;

      int bulletCx = blockX + bulletR;
      int bulletCy = rowY + th2 / 2 - 1;
      d.fillCircle(bulletCx, bulletCy, bulletR, Theme::ink());

      int textX = blockX + bulletR * 2 + bulletGap;
      d.setFont(FONT_B9);
      d.setTextColor(Theme::ink());
      d.setTextSize(1);
      d.setCursor(textX - x1, baseline);
      d.print(lineBufs[i]);

      rowY += th2 + rowGap;
    }

    d.setFont(nullptr);
    d.setTextSize(1);
  }
}

// =========================================================
// XL
// =========================================================
static void renderXL(const Cell& c) {
  if (!g_cache.ok) {
    drawEmptyState(c, "No Countdown", "Fetch failed");
    return;
  }

  int idx = findNearestIdx();
  if (idx < 0) {
    drawEmptyState(c, "No Countdown", "No events yet");
    return;
  }

  const CountdownItem& hero = g_cache.items[idx];

  tm nowTm;
  if (!getLocalTmQuick(nowTm)) {
    drawEmptyState(c, "No Countdown", "Time unavailable");
    return;
  }

  int todayY  = nowTm.tm_year + 1900;
  int todayM0 = nowTm.tm_mon;
  int todayD  = nowTm.tm_mday;

  int nextMonthY = todayY;
  int nextMonth0 = todayM0 + 1;
  if (nextMonth0 >= 12) {
    nextMonth0 = 0;
    nextMonthY++;
  }

  const int gapX = 14;
  const int gapY = 14;

  int leftW  = (c.w - gapX) / 2;
  int rightW = c.w - gapX - leftW;

  int topH    = (c.h - gapY) / 2;
  int bottomH = c.h - gapY - topH;

  int leftX  = c.x;
  int rightX = c.x + leftW + gapX;
  int topY   = c.y;
  int botY   = c.y + topH + gapY;

  // Top-left: medium hero
  {
    Cell heroCell = c;
    heroCell.x = leftX;
    heroCell.y = topY;
    heroCell.w = leftW;
    heroCell.h = topH;
    renderMedium(heroCell);
  }

  // Bottom-left: centered upcoming block like large-right
  {
    Cell listCell = c;
    listCell.x = leftX;
    listCell.y = botY;
    listCell.w = leftW;
    listCell.h = bottomH;

    auto& d = DisplayCore::get();
    int panelX = listCell.x;
    int panelY = listCell.y;
    int panelW = listCell.w;
    int panelH = listCell.h;

    if (countUpcomingItems() <= 1) {
      drawCenteredLine(panelX, panelY, panelW, panelH, "No more events", FONT_B12, Theme::ink());
    } else {
      int16_t tx1, ty1; uint16_t tw, th;
      char tmpTitle[96];
      fitTextToWidth(hero.title, tmpTitle, sizeof(tmpTitle), panelW - 20, FONT_B12);
      measureText(tmpTitle, FONT_B12, tx1, ty1, tw, th);

      const int gap1 = 10;
      const int gap2 = 14;
      const int gap3 = 18;
      int heroTotalH = (int)th + gap1 + 24 + gap2 + 14 + gap3 + 32;
      int sharedTop = panelY + (panelH - heroTotalH) / 2;

      const CountdownItem* rows[4] = {nullptr, nullptr, nullptr, nullptr};
      int found = 0;
      bool skippedHero = false;

      for (int i = 0; i < g_cache.count && found < 4; i++) {
        const CountdownItem& it = g_cache.items[i];
        if (!it.used || it.isPast) continue;

        if (!skippedHero) {
          skippedHero = true;
          continue;
        }
        rows[found++] = &it;
      }

      if (found <= 0) {
        drawCenteredLine(panelX, panelY, panelW, panelH, "No more events", FONT_B12, Theme::ink());
      } else {
        const int bulletR = 3;
        const int bulletGap = 8;
        const int rowGap = 14;

        char lineBufs[4][128];
        int maxLineW = 0;

        for (int i = 0; i < found; i++) {
          char rawBuf[128];
          formatEventDaysLine(*rows[i], rawBuf, sizeof(rawBuf));
          fitTextToWidth(rawBuf, lineBufs[i], sizeof(lineBufs[i]), panelW - 20, FONT_B9);
          int lw = textWidth(lineBufs[i], FONT_B9);
          if (lw > maxLineW) maxLineW = lw;
        }

        const char* hdr = "COMING UP";
        int headerW = textWidth(hdr, FONT_B9);
        int blockTextW = max(maxLineW, headerW);
        int blockW = bulletR * 2 + bulletGap + blockTextW;
        if (blockW > panelW - 8) blockW = panelW - 8;

        int blockX = panelX + (panelW - blockW) / 2;

        {
          int16_t hx1, hy1; uint16_t hw, hh;
          measureText(hdr, FONT_B9, hx1, hy1, hw, hh);

          int bx = panelX + (panelW - (int)hw) / 2;
          int by = sharedTop;

          d.setFont(FONT_B9);
          d.setTextColor(Theme::ink());
          d.setTextSize(1);
          d.setCursor(bx - hx1, by - hy1);
          d.print(hdr);
        }

        int rowY = sharedTop + (int)th + gap1;

        for (int i = 0; i < found; i++) {
          int16_t x1, y1; uint16_t tw2, th2;
          measureText(lineBufs[i], FONT_B9, x1, y1, tw2, th2);

          int baseline = rowY - y1;
          int bulletCx = blockX + bulletR;
          int bulletCy = rowY + th2 / 2 - 1;
          d.fillCircle(bulletCx, bulletCy, bulletR, Theme::ink());

          int textX = blockX + bulletR * 2 + bulletGap;
          d.setFont(FONT_B9);
          d.setTextColor(Theme::ink());
          d.setTextSize(1);
          d.setCursor(textX - x1, baseline);
          d.print(lineBufs[i]);

          rowY += th2 + rowGap;
        }

        d.setFont(nullptr);
        d.setTextSize(1);
      }
    }
  }

 drawCountdownCalendarMonth(
  rightX, topY, rightW, topH,
  todayY, todayM0,
  todayY, todayM0, todayD,
  hero,
  true,
  true
);

drawCountdownCalendarMonth(
  rightX, botY, rightW, bottomH,
  nextMonthY, nextMonth0,
  todayY, todayM0, todayD,
  hero,
  true,
  false
);
}

// =========================================================
// Public API
// =========================================================
void setConfig(const FrameConfig* cfg) {
  g_cfg = cfg;
  (void)g_cfg;
  clearCache();
}

void render(const Cell& c, const String& moduleName) {
  (void)moduleName;

  ensureLoaded();

  if (c.size == CELL_SMALL) {
    renderSmall(c);
    return;
  }

  if (c.size == CELL_MEDIUM) {
    renderMedium(c);
    return;
  }

  if (c.size == CELL_LARGE) {
    renderLarge(c);
    return;
  }

  if (c.size == CELL_XL) {
    renderXL(c);
    return;
  }

  renderMedium(c);
}

} // namespace ModuleCountdown