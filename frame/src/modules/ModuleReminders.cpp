// ===============================
// ModuleReminders.cpp (FULL FILE - copy/paste)
// ===============================
#include "ModuleReminders.h"
#include "DisplayCore.h"
#include "Theme.h"
#include "Config.h"
#include "DeviceIdentity.h"
#include "NetClient.h"

#include <ArduinoJson.h>
#include <string.h>
#include <math.h>
#include <time.h>
#include <stdio.h>

#include "Fonts/FreeSans9ptNO.h"
#include "Fonts/FreeSansBold12ptNO.h"
#include "Fonts/FreeSansBold18ptNO.h"

#define FONT_B9  (&FreeSans9pt8b)
#define FONT_B12 (&FreeSansBold12pt8b)
#define FONT_B18 (&FreeSansBold18pt8b)

#define REMINDERS_DEBUG 1

#if REMINDERS_DEBUG
  #define REM_LOG(x) Serial.print(x)
  #define REM_LOGLN(x) Serial.println(x)
#else
  #define REM_LOG(x) do {} while (0)
  #define REM_LOGLN(x) do {} while (0)
#endif

namespace ModuleReminders {

// =========================================================
// Config + cache
// =========================================================
static const FrameConfig* g_cfg = nullptr;

static const int MAX_REMINDERS = 20;
static const int MAX_BUCKETS = 10;
static const int MAX_BUCKET_ITEMS = 10;

struct ReminderItem {
  bool used = false;
  char id[48] = {0};
  char title[96] = {0};
  char time[12] = {0};           // HH:MM or empty
  char occurrenceDate[16] = {0}; // YYYY-MM-DD
  char displayDate[24] = {0};
  char repeat[20] = {0};
  int daysUntil = 0;
  bool isOverdue = false;
};

struct ReminderBucket {
  bool used = false;
  int daysUntil = 0;
  bool isOverdue = false;
  int count = 0;
  int itemIdx[MAX_BUCKET_ITEMS];
};

struct ReminderCache {
  bool loaded = false;
  bool ok = false;
  int count = 0;
  ReminderItem items[MAX_REMINDERS];
};

static ReminderCache g_cache;

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
        case 0xB8: out[oi++] = (char)0xF8; break; // Ã¸
        case 0x98: out[oi++] = (char)0xD8; break; // Ã˜
        case 0xA5: out[oi++] = (char)0xE5; break; // Ã¥
        case 0x85: out[oi++] = (char)0xC5; break; // Ã…
        case 0xA6: out[oi++] = (char)0xE6; break; // Ã¦
        case 0x86: out[oi++] = (char)0xC6; break; // Ã†
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
  for (int i = 0; i < MAX_REMINDERS; i++) g_cache.items[i] = ReminderItem{};
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
    char buf[160];
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

static void buildRelativeDateText(int daysUntil, bool isOverdue, char* out, size_t outSize) {
  if (!out || outSize == 0) return;
  out[0] = '\0';

  if (isOverdue || daysUntil < 0) {
    int late = abs(daysUntil);
    if (late == 1) snprintf(out, outSize, "1 day late");
    else snprintf(out, outSize, "%d days late", late);
    return;
  }

  if (daysUntil == 0) {
    snprintf(out, outSize, "Today");
    return;
  }

  if (daysUntil == 1) {
    snprintf(out, outSize, "Tomorrow");
    return;
  }

  snprintf(out, outSize, "In %d days", daysUntil);
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

static bool extractTimeHHMM(const char* raw, char* out, size_t outSize) {
  if (!out || outSize == 0) return false;
  out[0] = '\0';
  if (!raw || !raw[0]) return false;

  int hh = -1;
  int mm = -1;

  if (sscanf(raw, "%d:%d", &hh, &mm) != 2) return false;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return false;

  snprintf(out, outSize, "%02d:%02d", hh, mm);
  return true;
}

static void buildReminderTitleWithTime(const ReminderItem& r, char* out, size_t outSize) {
  if (!out || outSize == 0) return;
  out[0] = '\0';

  if (r.time[0]) {
    snprintf(out, outSize, "%s %s", r.title, r.time);
  } else {
    safeCopy(out, outSize, r.title);
  }
}

static int weekdayIndexYMD(int y, int m, int d) {
  static int t[] = {0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4};
  if (m < 3) y -= 1;
  return (y + y / 4 - y / 100 + y / 400 + t[m - 1] + d) % 7;
}

static const char* weekdayNameFull(int idx) {
  switch (idx) {
    case 0: return "Sunday";
    case 1: return "Monday";
    case 2: return "Tuesday";
    case 3: return "Wednesday";
    case 4: return "Thursday";
    case 5: return "Friday";
    case 6: return "Saturday";
    default: return "";
  }
}

static bool getLocalTmQuick(tm& outTm) {
  if (!getLocalTime(&outTm, 10)) return false;
  return true;
}

static const char* const MONTHS_FULL[] = {
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
};

static const char* safeMonth(int m) {
  if (m >= 0 && m <= 11) return MONTHS_FULL[m];
  return "January";
}

static int daysInMonth(int year, int month0) {
  static const int mdays[] = {31,28,31,30,31,30,31,31,30,31,30,31};
  int d = mdays[month0];
  if (month0 == 1) {
    bool leap = ((year % 4 == 0) && (year % 100 != 0)) || (year % 400 == 0);
    if (leap) d = 29;
  }
  return d;
}

static int weekNumberISO(int year, int month0, int day) {
  tm t = {};
  t.tm_year = year - 1900;
  t.tm_mon  = month0;
  t.tm_mday = day;
  t.tm_hour = 12;
  mktime(&t);

  int wday = t.tm_wday;
  int monIndex = (wday == 0) ? 6 : (wday - 1);
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

// =========================================================
// Reminder date helpers
// =========================================================
struct OccurrenceRef {
  int itemIdx = -1;
  int year = 0;
  int month = 0;
  int day = 0;
};

static int ymdKey(int y, int m, int d) {
  return y * 10000 + m * 100 + d;
}

static int reminderCountOnDay(int year, int month0, int day) {
  if (!g_cache.ok) return 0;

  int count = 0;
  for (int i = 0; i < g_cache.count; i++) {
    if (!g_cache.items[i].used) continue;

    int ry = 0, rm = 0, rd = 0;
    if (!parseYMD10(g_cache.items[i].occurrenceDate, ry, rm, rd)) continue;

    if (ry == year && rm == (month0 + 1) && rd == day) {
      count++;
    }
  }
  return count;
}

static bool isOccurrenceInList(const OccurrenceRef* list, int count,
                               int itemIdx, int y, int m, int d) {
  if (!list) return false;
  for (int i = 0; i < count; i++) {
    if (list[i].itemIdx == itemIdx &&
        list[i].year == y &&
        list[i].month == m &&
        list[i].day == d) {
      return true;
    }
  }
  return false;
}

static bool occurrenceLess(const OccurrenceRef& a, const OccurrenceRef& b) {
  int ak = ymdKey(a.year, a.month, a.day);
  int bk = ymdKey(b.year, b.month, b.day);
  if (ak != bk) return ak < bk;
  return a.itemIdx < b.itemIdx;
}

static bool nextOccurrenceOnOrAfter(const ReminderItem& r,
                                    int fromY, int fromM, int fromD,
                                    int& outY, int& outM, int& outD) {
  int ry = 0, rm = 0, rd = 0;
  if (!parseYMD10(r.occurrenceDate, ry, rm, rd)) return false;

  if (ymdKey(ry, rm, rd) < ymdKey(fromY, fromM, fromD)) return false;

  outY = ry;
  outM = rm;
  outD = rd;
  return true;
}

static bool nextOccurrenceAfterDate(const ReminderItem& r,
                                    int afterY, int afterM, int afterD,
                                    int& outY, int& outM, int& outD) {
  int ry = 0, rm = 0, rd = 0;
  if (!parseYMD10(r.occurrenceDate, ry, rm, rd)) return false;

  if (ymdKey(ry, rm, rd) <= ymdKey(afterY, afterM, afterD)) return false;

  outY = ry;
  outM = rm;
  outD = rd;
  return true;
}

// =========================================================
// Fetch
// =========================================================
static bool fetchReminders() {
  clearCache();

  String url = String(BASE_URL)
             + "/api/device/reminders?device_id="
             + DeviceIdentity::getDeviceId()
             + "&limit=20&tz=Europe/Oslo";

  int code = 0;
  String body;
  bool ok = NetClient::httpGetAuth(url, DeviceIdentity::getToken(), code, body);

  REM_LOG("reminders HTTP: ");
  REM_LOGLN(code);
  REM_LOGLN(body);

  if (!ok || code != 200 || body.length() == 0) {
    g_cache.loaded = true;
    g_cache.ok = false;
    return false;
  }

  StaticJsonDocument<16384> doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    REM_LOGLN("reminders JSON parse failed");
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

  int idx = 0;
  for (JsonObject it : items) {
    if (idx >= MAX_REMINDERS) break;

    ReminderItem& r = g_cache.items[idx];
    r.used = true;

    safeCopy(r.id, sizeof(r.id), it["reminder_id"] | "");

    const char* rawTitle = it["title"] | "";
    utf8ToLatin1(r.title, sizeof(r.title), rawTitle);

    char rawTime[24] = {0};
    safeCopy(rawTime, sizeof(rawTime), it["display_time"] | "");
    if (!rawTime[0]) safeCopy(rawTime, sizeof(rawTime), it["due_time"] | "");
    if (!rawTime[0]) safeCopy(rawTime, sizeof(rawTime), it["time"] | "");
    extractTimeHHMM(rawTime, r.time, sizeof(r.time));

    const char* rawOccurrenceDate = it["occurrence_date"] | "";
    safeCopy(r.occurrenceDate, sizeof(r.occurrenceDate), rawOccurrenceDate);

    const char* rawDisplayDate = it["display_date"] | "";
    utf8ToLatin1(r.displayDate, sizeof(r.displayDate), rawDisplayDate);

    const char* rawRepeat = it["repeat"] | "";
    safeCopy(r.repeat, sizeof(r.repeat), rawRepeat);

    r.daysUntil = it["days_until"] | 0;
    r.isOverdue = it["is_overdue"] | false;

    idx++;
  }

  g_cache.loaded = true;
  g_cache.ok = true;
  g_cache.count = idx;
  return true;
}

static void ensureLoaded() {
  if (g_cache.loaded) return;
  fetchReminders();
}

// =========================================================
// Buckets
// =========================================================
static int buildBuckets(ReminderBucket* buckets, int maxBuckets) {
  if (!buckets || maxBuckets <= 0) return 0;

  for (int i = 0; i < maxBuckets; i++) buckets[i] = ReminderBucket{};

  if (!g_cache.ok || g_cache.count <= 0) return 0;

  int bucketCount = 0;

  for (int i = 0; i < g_cache.count; i++) {
    const ReminderItem& r = g_cache.items[i];
    if (!r.used) continue;

    int found = -1;
    for (int b = 0; b < bucketCount; b++) {
      if (!buckets[b].used) continue;
      if (buckets[b].daysUntil == r.daysUntil) {
        found = b;
        break;
      }
    }

    if (found < 0) {
      if (bucketCount >= maxBuckets) continue;
      found = bucketCount++;
      buckets[found].used = true;
      buckets[found].daysUntil = r.daysUntil;
      buckets[found].isOverdue = r.isOverdue || (r.daysUntil < 0);
      buckets[found].count = 0;
      for (int k = 0; k < MAX_BUCKET_ITEMS; k++) buckets[found].itemIdx[k] = -1;
    }

    ReminderBucket& bk = buckets[found];
    if (bk.count < MAX_BUCKET_ITEMS) {
      bk.itemIdx[bk.count] = i;
      bk.count++;
    }
  }

  return bucketCount;
}

static int findPrimaryBucketIndex(const ReminderBucket* buckets, int bucketCount) {
  if (!buckets || bucketCount <= 0) return -1;

  for (int i = 0; i < bucketCount; i++) {
    if (buckets[i].used && buckets[i].daysUntil == 0) return i;
  }
  for (int i = 0; i < bucketCount; i++) {
    if (buckets[i].used && buckets[i].daysUntil == 1) return i;
  }
  for (int i = 0; i < bucketCount; i++) {
    if (buckets[i].used) return i;
  }
  return -1;
}

static int findBucketByDaysUntil(const ReminderBucket* buckets, int bucketCount, int daysUntil) {
  if (!buckets || bucketCount <= 0) return -1;
  for (int i = 0; i < bucketCount; i++) {
    if (buckets[i].used && buckets[i].daysUntil == daysUntil) return i;
  }
  return -1;
}

static int computePrimaryVisibleCount(const ReminderBucket& bucket) {
  char headerBuf[40] = {0};

  if (bucket.daysUntil <= 0) {
    strlcpy(headerBuf, "Today", sizeof(headerBuf));
  } else if (bucket.daysUntil == 1) {
    strlcpy(headerBuf, "Tomorrow", sizeof(headerBuf));
  } else {
    int firstItemIdx = bucket.itemIdx[0];
    if (firstItemIdx >= 0 && firstItemIdx < g_cache.count) {
      int y = 0, m = 0, d0 = 0;
      if (parseYMD10(g_cache.items[firstItemIdx].occurrenceDate, y, m, d0)) {
        const char* wd = weekdayNameFull(weekdayIndexYMD(y, m, d0));

        if (bucket.daysUntil <= 7) {
          snprintf(headerBuf, sizeof(headerBuf), "On %s", wd);
        } else if (bucket.daysUntil <= 14) {
          snprintf(headerBuf, sizeof(headerBuf), "%s next week", wd);
        } else {
          safeCopy(headerBuf, sizeof(headerBuf), g_cache.items[firstItemIdx].displayDate);
        }
      } else {
        if (bucket.daysUntil <= 14) strlcpy(headerBuf, "Upcoming", sizeof(headerBuf));
        else safeCopy(headerBuf, sizeof(headerBuf), g_cache.items[firstItemIdx].displayDate);
      }
    } else {
      strlcpy(headerBuf, "Upcoming", sizeof(headerBuf));
    }
  }

  const bool headerIsToday = (strcmp(headerBuf, "Today") == 0);
  const bool headerIsTomorrow = (strcmp(headerBuf, "Tomorrow") == 0);
  const bool isTodayOrTomorrow = headerIsToday || headerIsTomorrow;

  return min(bucket.count, isTodayOrTomorrow ? 4 : 3);
}

static int collectPrimaryShownOccurrences(const ReminderBucket* buckets,
                                          int bucketCount,
                                          int primaryIdx,
                                          OccurrenceRef* outRefs,
                                          int maxCount) {
  if (!outRefs || maxCount <= 0) return 0;
  for (int i = 0; i < maxCount; i++) outRefs[i] = OccurrenceRef{};

  if (!buckets || bucketCount <= 0 || primaryIdx < 0 || primaryIdx >= bucketCount) return 0;

  const ReminderBucket& bucket = buckets[primaryIdx];
  if (!bucket.used || bucket.count <= 0) return 0;

  int visibleCount = computePrimaryVisibleCount(bucket);
  int rotation = getRotationStep4h();

  int outCount = 0;
  for (int i = 0; i < visibleCount && outCount < maxCount; i++) {
    int pick = wrapIndex(rotation + i, bucket.count);
    int itemIdx = bucket.itemIdx[pick];
    if (itemIdx < 0 || itemIdx >= g_cache.count) continue;

    int y = 0, m = 0, d = 0;
    if (!parseYMD10(g_cache.items[itemIdx].occurrenceDate, y, m, d)) continue;

    outRefs[outCount].itemIdx = itemIdx;
    outRefs[outCount].year = y;
    outRefs[outCount].month = m;
    outRefs[outCount].day = d;
    outCount++;
  }

  return outCount;
}

// =========================================================
// Shared drawing helpers
// =========================================================
static void drawTopRightSmallNote(const Cell& c, const char* txt, int y) {
  auto& d = DisplayCore::get();
  int16_t x1, y1; uint16_t tw, th;
  measureText(txt, FONT_B9, x1, y1, tw, th);
  int drawX = c.x + c.w - 12 - (int)tw;
  int drawY = y;
  d.setFont(FONT_B9);
  d.setTextColor(Theme::ink());
  d.setCursor(drawX - x1, drawY - y1);
  d.print(txt);
  d.setFont(nullptr);
}

static void drawCenteredSmallNoteAtY(const Cell& c, const char* txt, int y) {
  auto& d = DisplayCore::get();
  int16_t x1, y1; uint16_t tw, th;
  measureText(txt, FONT_B9, x1, y1, tw, th);
  int drawX = c.x + (c.w - (int)tw) / 2;
  int drawY = y;
  d.setFont(FONT_B9);
  d.setTextColor(Theme::ink());
  d.setCursor(drawX - x1, drawY - y1);
  d.print(txt);
  d.setFont(nullptr);
}

static void drawCenteredBulletLine(const Cell& c,
                                   int centerY,
                                   const char* text,
                                   const GFXfont* font,
                                   int anchorTextStartX) {
  auto& d = DisplayCore::get();

  int16_t tx1, ty1;
  uint16_t tw, th;
  measureText(text, font, tx1, ty1, tw, th);

  const int dotR = 3;
  const int gap = 10;

  int textBaseline = centerY - (int)th / 2 - ty1;
  int dotCx = anchorTextStartX - gap - dotR;
  int dotCy = centerY;

  d.fillCircle(dotCx, dotCy, dotR, Theme::ink());

  d.setFont(font);
  d.setTextColor(Theme::ink());
  d.setCursor(anchorTextStartX, textBaseline);
  d.print(text);
  d.setFont(nullptr);
}

static void drawBucketLinesCentered(const Cell& c,
                                    const ReminderBucket& bucket,
                                    int visibleCount,
                                    int yTop,
                                    int totalH,
                                    const GFXfont* lineFont) {
  const int rotation = getRotationStep4h();
  const int lineH = fontLineHeight(lineFont);
  const int lineGap = 12;
  const int dotR = 3;
  const int gap = 10;

  int blockH = visibleCount * lineH + (visibleCount - 1) * lineGap;
  int startY = yTop + (totalH - blockH) / 2;

  char lines[4][128];
  int widths[4] = {0, 0, 0, 0};
  int longestW = 0;

  for (int i = 0; i < visibleCount; i++) {
    lines[i][0] = 0;

    int pick = wrapIndex(rotation + i, bucket.count);
    int itemIdx = bucket.itemIdx[pick];
    if (itemIdx < 0 || itemIdx >= g_cache.count) continue;

    char fullBuf[128];
    buildReminderTitleWithTime(g_cache.items[itemIdx], fullBuf, sizeof(fullBuf));

    fitTextToWidth(fullBuf, lines[i], sizeof(lines[i]), c.w - 44, lineFont);
    widths[i] = textWidth(lines[i], lineFont);
    if (widths[i] > longestW) longestW = widths[i];
  }

  int totalLongestW = dotR * 2 + gap + longestW;
  int anchorTextStartX = c.x + (c.w - totalLongestW) / 2 + dotR * 2 + gap;

  for (int i = 0; i < visibleCount; i++) {
    if (!lines[i][0]) continue;

    int centerY = startY + i * (lineH + lineGap) + lineH / 2;
    drawCenteredBulletLine(c, centerY, lines[i], lineFont, anchorTextStartX);
  }
}

// =========================================================
// Calendar drawing with reminder dots
// =========================================================
static void drawReminderMonthCalendarRows(int x, int y, int w, int h,
                                          int year, int month0,
                                          int todayYear, int todayMonth0, int todayDayNum,
                                          bool showMonthTitle,
                                          bool showWeekNums,
                                          bool showDowHeader,
                                          int forcedRows) {
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

  int cellH = (availH - titleH - titleGap - dowH) / rows;
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
    d.setFont(FONT_B9);
    d.setTextColor(ink);

    for (int c = 0; c < cols; c++) {
      int cx = dowX + c * cellW;
      int cy = curY;

      int16_t x1, y1; uint16_t tw, th;
      measureText(DOW[c], FONT_B9, x1, y1, tw, th);

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
    d.setFont(FONT_B9);
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
      measureText(wkStr, FONT_B9, x1, y1, tw, th);

      int cellY = gridTop + r * cellH;
      int cy = cellY + (cellH - (int)th) / 2;

      int colX = blockX + weekPadLeft;
      int colW = weekW - weekPadLeft - weekPadRight;

      int bx = colX + (colW - (int)tw) / 2;
      d.setCursor(bx - x1, cy - y1);
      d.print(wkStr);
    }
  }

  d.setFont(FONT_B9);

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
      measureText(buf, FONT_B9, x1, y1, tw, th);

      bool isToday = (year == todayYear && month0 == todayMonth0 && day == todayDayNum);
      int remCount = reminderCountOnDay(year, month0, day);
      bool hasRem = (remCount > 0);

      if (isToday) {
        int radius = min(cellW, cellH) / 2 - 2;
        if (radius < 10) radius = 10;
        if (radius > 16) radius = 16;

        d.fillCircle(centerX, centerY, radius, GxEPD_WHITE);
        d.setTextColor(GxEPD_BLACK);
      } else {
        d.setTextColor(ink);
      }

      int tx = centerX - (int)tw / 2;
      int ty = centerY - (int)th / 2;
      d.setCursor(tx - x1, ty - y1);
      d.print(buf);

      if (!isToday && hasRem) {
        int dots = remCount;
        if (dots > 3) dots = 3;

        int dotY = cellY + cellH - 1;
        if (dotY <= centerY + 3) dotY = centerY + 4;

        if (dots == 1) {
          d.fillCircle(centerX, dotY, 2, ink);
        } else if (dots == 2) {
          d.fillCircle(centerX - 4, dotY, 2, ink);
          d.fillCircle(centerX + 4, dotY, 2, ink);
        } else {
          d.fillCircle(centerX - 5, dotY, 2, ink);
          d.fillCircle(centerX,     dotY, 2, ink);
          d.fillCircle(centerX + 5, dotY, 2, ink);
        }
      }
    }
  }

  d.setFont(nullptr);
  d.setTextSize(1);
}

// =========================================================
// Next reminders list (XL bottom-left)
// =========================================================
static void drawNextRemindersList(int x, int y, int w, int h,
                                  const ReminderBucket* buckets,
                                  int bucketCount,
                                  int primaryIdx) {
  if (!g_cache.ok || g_cache.count <= 0) {
    drawCenteredLine(x, y, w, h, "No reminders", FONT_B12, Theme::ink());
    return;
  }

  OccurrenceRef alreadyShown[4];
  int alreadyShownCount = collectPrimaryShownOccurrences(buckets, bucketCount, primaryIdx,
                                                         alreadyShown, 4);

  OccurrenceRef picked[5];
  int pickedCount = 0;
  for (int i = 0; i < 5; i++) picked[i] = OccurrenceRef{};

  tm nowTm;
  if (!getLocalTmQuick(nowTm)) {
    drawCenteredLine(x, y, w, h, "No reminders", FONT_B12, Theme::ink());
    return;
  }

  int todayY = nowTm.tm_year + 1900;
  int todayM = nowTm.tm_mon + 1;
  int todayD = nowTm.tm_mday;

  for (int slot = 0; slot < 5; slot++) {
    bool found = false;
    OccurrenceRef best{};

    for (int i = 0; i < g_cache.count; i++) {
      const ReminderItem& r = g_cache.items[i];
      if (!r.used) continue;

      int candY = 0, candM = 0, candD = 0;

      if (slot == 0) {
        if (!nextOccurrenceOnOrAfter(r, todayY, todayM, todayD, candY, candM, candD)) continue;
      } else {
        if (!nextOccurrenceOnOrAfter(r, todayY, todayM, todayD, candY, candM, candD)) continue;

        while (isOccurrenceInList(alreadyShown, alreadyShownCount, i, candY, candM, candD) ||
               isOccurrenceInList(picked, pickedCount, i, candY, candM, candD)) {
          if (!nextOccurrenceAfterDate(r, candY, candM, candD, candY, candM, candD)) {
            candY = candM = candD = 0;
            break;
          }
        }
        if (candY == 0) continue;
      }

      if (isOccurrenceInList(alreadyShown, alreadyShownCount, i, candY, candM, candD)) {
        while (nextOccurrenceAfterDate(r, candY, candM, candD, candY, candM, candD)) {
          if (!isOccurrenceInList(alreadyShown, alreadyShownCount, i, candY, candM, candD) &&
              !isOccurrenceInList(picked, pickedCount, i, candY, candM, candD)) {
            break;
          }
        }
        if (isOccurrenceInList(alreadyShown, alreadyShownCount, i, candY, candM, candD) ||
            isOccurrenceInList(picked, pickedCount, i, candY, candM, candD)) {
          continue;
        }
      }

      if (isOccurrenceInList(picked, pickedCount, i, candY, candM, candD)) continue;

      OccurrenceRef cand;
      cand.itemIdx = i;
      cand.year = candY;
      cand.month = candM;
      cand.day = candD;

      if (!found || occurrenceLess(cand, best)) {
        best = cand;
        found = true;
      }
    }

    if (!found) break;
    picked[pickedCount++] = best;
  }

  if (pickedCount <= 0) {
    drawCenteredLine(x, y, w, h, "No more reminders", FONT_B12, Theme::ink());
    return;
  }

  auto& d = DisplayCore::get();
  const uint16_t ink = Theme::ink();

  const int lineH = 32;
  const int padL  = 26;
  const int padB  = 24;
  const int gap   = 16;

  int blockH = pickedCount * lineH;

  int16_t dx1, dy1; uint16_t dtw, dth;
  measureText("00.00", FONT_B9, dx1, dy1, dtw, dth);
  int dateColW = (int)dtw;

  int maxNameW = w - padL - dateColW - gap - 12;
  if (maxNameW < 60) maxNameW = 60;

  int startX = x + padL;
  int startY = y + h - padB - blockH;

  for (int i = 0; i < pickedCount; i++) {
    const OccurrenceRef& occ = picked[i];
    if (occ.itemIdx < 0 || occ.itemIdx >= g_cache.count) continue;

    const ReminderItem& r = g_cache.items[occ.itemIdx];

    char dateStr[8];
    snprintf(dateStr, sizeof(dateStr), "%02d.%02d", occ.day, occ.month);

    char fullBuf[128];
    buildReminderTitleWithTime(r, fullBuf, sizeof(fullBuf));

    char titleBuf[128];
    fitTextToWidth(fullBuf, titleBuf, sizeof(titleBuf), maxNameW, FONT_B12);

    int rowY = startY + i * lineH;
    int baselineY = rowY + lineH / 2;

    int16_t tx1, ty1; uint16_t tw, th;
    measureText(dateStr, FONT_B9, tx1, ty1, tw, th);

    int dateX = startX + (dateColW - (int)tw);

    d.setFont(FONT_B9);
    d.setTextColor(ink);
    d.setCursor(dateX - tx1, baselineY);
    d.print(dateStr);

    int nameX = startX + dateColW + gap;
    d.setFont(FONT_B12);
    d.setTextColor(ink);
    d.setCursor(nameX, baselineY);
    d.print(titleBuf);
  }

  d.setFont(nullptr);
  d.setTextSize(1);
}

// =========================================================
// SMALL
// =========================================================
static void renderSmall(const Cell& c, const ReminderBucket* buckets, int bucketCount, int primaryIdx) {
  auto& d = DisplayCore::get();
  const uint16_t ink = Theme::ink();

  if (!g_cache.ok) {
    drawEmptyState(c, "No reminders", "Fetch failed");
    return;
  }
  if (primaryIdx < 0) {
    drawEmptyState(c, "No reminders", "Nothing upcoming");
    return;
  }

  const ReminderBucket& bucket = buckets[primaryIdx];
  if (bucket.count <= 0) {
    drawEmptyState(c, "No reminders", "Nothing upcoming");
    return;
  }

  char headerBuf[40] = {0};

  if (bucket.daysUntil <= 0) {
    strlcpy(headerBuf, "Today", sizeof(headerBuf));
  } else if (bucket.daysUntil == 1) {
    strlcpy(headerBuf, "Tomorrow", sizeof(headerBuf));
  } else {
    int firstItemIdx = bucket.itemIdx[0];
    if (firstItemIdx >= 0 && firstItemIdx < g_cache.count) {
      int y = 0, m = 0, d0 = 0;
      if (parseYMD10(g_cache.items[firstItemIdx].occurrenceDate, y, m, d0)) {
        const char* wd = weekdayNameFull(weekdayIndexYMD(y, m, d0));

        if (bucket.daysUntil <= 7) {
          snprintf(headerBuf, sizeof(headerBuf), "On %s", wd);
        } else if (bucket.daysUntil <= 14) {
          snprintf(headerBuf, sizeof(headerBuf), "%s next week", wd);
        } else {
          safeCopy(headerBuf, sizeof(headerBuf), g_cache.items[firstItemIdx].displayDate);
        }
      } else {
        strlcpy(headerBuf, "Upcoming", sizeof(headerBuf));
      }
    } else {
      strlcpy(headerBuf, "Upcoming", sizeof(headerBuf));
    }
  }

  const bool headerIsToday = (strcmp(headerBuf, "Today") == 0);

  const int topPad = 20;
  const int underlineGap = 1;
  const int underlineH = 2;

  int16_t hx1, hy1;
  uint16_t hw, hh;
  measureText(headerBuf, FONT_B12, hx1, hy1, hw, hh);

  int titleBaseline = c.y + topPad - hy1;

  d.setFont(FONT_B12);
  d.setTextColor(ink);
  d.setCursor(c.x + c.w / 2 - (int)hw / 2 - hx1, titleBaseline);
  d.print(headerBuf);
  d.setFont(nullptr);

  int underlineY = titleBaseline + hy1 + (int)hh + underlineGap;
  int underlineX = c.x + c.w / 2 - (int)hw / 2;
  d.fillRect(underlineX, underlineY, (int)hw, underlineH, ink);

  const int visibleCount = min(bucket.count, 3);

  if (bucket.count > visibleCount) {
    char moreBuf[24];
    snprintf(moreBuf, sizeof(moreBuf), "+%d more", bucket.count - visibleCount);
    drawTopRightSmallNote(c, moreBuf, c.y + 12);
  }

  const bool showTomorrowNote = headerIsToday;
  if (showTomorrowNote) {
    int tomorrowIdx = findBucketByDaysUntil(buckets, bucketCount, 1);
    if (tomorrowIdx >= 0 && buckets[tomorrowIdx].count > 0) {
      char tomorrowBuf[32];
      snprintf(tomorrowBuf, sizeof(tomorrowBuf), "Tomorrow: %d", buckets[tomorrowIdx].count);
      drawCenteredSmallNoteAtY(c, tomorrowBuf, c.y + c.h - 20);
    }
  }

  const int contentTop = underlineY + underlineH + 10;
  const int contentBottom = showTomorrowNote ? (c.y + c.h - 24) : (c.y + c.h - 10);
  const int contentH = contentBottom - contentTop;
  if (contentH <= 8) return;

  const int dividerInsetTop = showTomorrowNote ? 4 : 8;
  const int dividerInsetBottom = showTomorrowNote ? 4 : 8;
  const int dividerY = contentTop + dividerInsetTop;
  const int dividerH = max(8, contentH - dividerInsetTop - dividerInsetBottom);

  if (visibleCount == 2) {
    int divX = c.x + c.w / 2;
    d.drawFastVLine(divX, dividerY, dividerH, ink);
  } else if (visibleCount == 3) {
    int div1X = c.x + c.w / 3;
    int div2X = c.x + (c.w * 2) / 3;
    d.drawFastVLine(div1X, dividerY, dividerH, ink);
    d.drawFastVLine(div2X, dividerY, dividerH, ink);
  }

  const int rotation = getRotationStep4h();
  const int textPadX = 8;

  for (int i = 0; i < visibleCount; i++) {
    int pick = wrapIndex(rotation + i, bucket.count);
    int itemIdx = bucket.itemIdx[pick];
    if (itemIdx < 0 || itemIdx >= g_cache.count) continue;

    int secX0 = c.x + (c.w * i) / visibleCount;
    int secX1 = c.x + (c.w * (i + 1)) / visibleCount;
    int secW = secX1 - secX0;

    char fullBuf[128];
    buildReminderTitleWithTime(g_cache.items[itemIdx], fullBuf, sizeof(fullBuf));

    char titleBuf[128];
    fitTextToWidth(fullBuf,
                   titleBuf,
                   sizeof(titleBuf),
                   secW - textPadX * 2 - 4,
                   FONT_B12);

    int16_t tx1, ty1;
    uint16_t tw, th;
    measureText(titleBuf, FONT_B12, tx1, ty1, tw, th);

    int cx = secX0 + secW / 2;
    int baselineY = contentTop + (contentH - (int)th) / 2 - ty1;

    d.setFont(FONT_B12);
    d.setTextColor(ink);
    d.setCursor(cx - (int)tw / 2 - tx1, baselineY);
    d.print(titleBuf);
    d.setFont(nullptr);
  }
}

// =========================================================
// MEDIUM
// =========================================================
static void renderMedium(const Cell& c, const ReminderBucket* buckets, int bucketCount, int primaryIdx) {
  auto& d = DisplayCore::get();
  const uint16_t ink = Theme::ink();

  if (!g_cache.ok) {
    drawEmptyState(c, "No reminders", "Fetch failed");
    return;
  }
  if (primaryIdx < 0) {
    drawEmptyState(c, "No reminders", "Nothing upcoming");
    return;
  }

  const ReminderBucket& bucket = buckets[primaryIdx];

  char headerBuf[40] = {0};

  if (bucket.daysUntil <= 0) {
    strlcpy(headerBuf, "Today", sizeof(headerBuf));
  } else if (bucket.daysUntil == 1) {
    strlcpy(headerBuf, "Tomorrow", sizeof(headerBuf));
  } else {
    int firstItemIdx = bucket.itemIdx[0];
    if (firstItemIdx >= 0 && firstItemIdx < g_cache.count) {
      int y = 0, m = 0, d0 = 0;
      if (parseYMD10(g_cache.items[firstItemIdx].occurrenceDate, y, m, d0)) {
        const char* wd = weekdayNameFull(weekdayIndexYMD(y, m, d0));

        if (bucket.daysUntil <= 7) {
          snprintf(headerBuf, sizeof(headerBuf), "On %s", wd);
        } else if (bucket.daysUntil <= 14) {
          snprintf(headerBuf, sizeof(headerBuf), "%s next week", wd);
        } else {
          safeCopy(headerBuf, sizeof(headerBuf), g_cache.items[firstItemIdx].displayDate);
        }
      } else {
        if (bucket.daysUntil <= 14) strlcpy(headerBuf, "Upcoming", sizeof(headerBuf));
        else safeCopy(headerBuf, sizeof(headerBuf), g_cache.items[firstItemIdx].displayDate);
      }
    } else {
      strlcpy(headerBuf, "Upcoming", sizeof(headerBuf));
    }
  }

  const bool headerIsToday = (strcmp(headerBuf, "Today") == 0);
  const bool headerIsTomorrow = (strcmp(headerBuf, "Tomorrow") == 0);
  const bool isTodayOrTomorrow = headerIsToday || headerIsTomorrow;

  const int topPad = 26;
  const int titleUnderlineGap = 1;
  const int titleUnderlineH = 2;
  const int bottomPad = 35;

  int16_t hx1, hy1; uint16_t hw, hh;
  measureText(headerBuf, FONT_B12, hx1, hy1, hw, hh);

  int titleBaseline = c.y + topPad - hy1;

  d.setFont(FONT_B12);
  d.setTextColor(ink);
  d.setCursor(c.x + c.w / 2 - (int)hw / 2 - hx1, titleBaseline);
  d.print(headerBuf);
  d.setFont(nullptr);

  int underlineY = titleBaseline + hy1 + (int)hh + titleUnderlineGap;
  int underlineX = c.x + c.w / 2 - (int)hw / 2;
  d.fillRect(underlineX, underlineY, (int)hw, titleUnderlineH, ink);

  const int visibleCount = min(bucket.count, isTodayOrTomorrow ? 4 : 3);

  if (bucket.count > visibleCount) {
    char moreBuf[24];
    snprintf(moreBuf, sizeof(moreBuf), "+%d more", bucket.count - visibleCount);
    drawTopRightSmallNote(c, moreBuf, c.y + 14);
  }

  const bool showTomorrowNote = headerIsToday;

  if (showTomorrowNote) {
    int tomorrowIdx = findBucketByDaysUntil(buckets, bucketCount, 1);
    if (tomorrowIdx >= 0 && buckets[tomorrowIdx].count > 0) {
      char tomorrowBuf[36];
      snprintf(tomorrowBuf, sizeof(tomorrowBuf), "Tomorrow: %d", buckets[tomorrowIdx].count);
      drawCenteredSmallNoteAtY(c, tomorrowBuf, c.y + c.h - 26);
    }
  }

  char badgeBuf[32];
  int rectY = c.y + c.h;
  bool showBottomBadge = !isTodayOrTomorrow;

  buildRelativeDateText(bucket.daysUntil, bucket.isOverdue, badgeBuf, sizeof(badgeBuf));

  if (showBottomBadge) {
    int16_t bx1, by1; uint16_t bw, bh;
    measureText(badgeBuf, FONT_B9, bx1, by1, bw, bh);

    const int rectPadX = 14;
    const int rectPadY = 8;
    int rectW = (int)bw + rectPadX * 2;
    int rectH = (int)bh + rectPadY * 2;
    if (rectW > c.w - 18) rectW = c.w - 18;

    int rectX = c.x + (c.w - rectW) / 2;
    rectY = c.y + c.h - bottomPad - rectH;

    d.fillRect(rectX, rectY, rectW, rectH, GxEPD_WHITE);

    int textX = rectX + (rectW - (int)bw) / 2;
    int textY = rectY + (rectH - (int)bh) / 2;

    d.setTextColor(GxEPD_BLACK);
    d.setFont(FONT_B9);
    d.setCursor(textX - bx1, textY - by1);
    d.print(badgeBuf);
    d.setFont(nullptr);
  }

  const int contentTop = underlineY + titleUnderlineH + 12;

  int contentBottom;
  if (showBottomBadge) {
    contentBottom = rectY - 14;
  } else if (showTomorrowNote) {
    contentBottom = c.y + c.h - 34;
  } else {
    contentBottom = c.y + c.h - 12;
  }

  const int contentH = contentBottom - contentTop;

  if (contentH > 10 && visibleCount > 0) {
    drawBucketLinesCentered(c, bucket, visibleCount, contentTop, contentH, FONT_B12);
  }
}

// =========================================================
// LARGE
// =========================================================
static void renderLarge(const Cell& c, const ReminderBucket* buckets, int bucketCount, int primaryIdx) {
  if (!g_cache.ok) {
    drawEmptyState(c, "No reminders", "Fetch failed");
    return;
  }

  tm t;
  if (!getLocalTmQuick(t)) {
    drawEmptyState(c, "No reminders", "No time");
    return;
  }

  int year = t.tm_year + 1900;
  int month0 = t.tm_mon;
  int dayNum = t.tm_mday;

  const int gapX = 14;

  int leftW  = (c.w - gapX) / 2;
  int rightW = c.w - gapX - leftW;

  int leftX  = c.x;
  int rightX = c.x + leftW + gapX;

  Cell leftCell = c;
  leftCell.x = leftX;
  leftCell.y = c.y;
  leftCell.w = leftW;
  leftCell.h = c.h;

  renderMedium(leftCell, buckets, bucketCount, primaryIdx);

  const int pad = 26;
  int availX = rightX + pad;
  int availY = c.y + pad;
  int availW = rightW - pad * 2;
  int availH = c.h - pad * 2;

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
  if (usedRows > 5) usedRows = 5;

  drawReminderMonthCalendarRows(availX, availY, availW, availH,
                                year, month0,
                                year, month0, dayNum,
                                false,
                                true,
                                true,
                                usedRows);
}

// =========================================================
// XL
// =========================================================
static void renderXL(const Cell& c, const ReminderBucket* buckets, int bucketCount, int primaryIdx) {
  if (!g_cache.ok) {
    drawEmptyState(c, "No reminders", "Fetch failed");
    return;
  }

  tm t;
  if (!getLocalTmQuick(t)) {
    drawEmptyState(c, "No reminders", "No time");
    return;
  }

  int year = t.tm_year + 1900;
  int month0 = t.tm_mon;
  int dayNum = t.tm_mday;

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

  renderMedium(topLeft, buckets, bucketCount, primaryIdx);

  drawNextRemindersList(leftX, botY, leftW, bottomH, buckets, bucketCount, primaryIdx);

  const int padTopMonth = 26;
  const int padBottomMonth = 26;
  const int padRight = 26;

  int calX = rightX;
  int calW = rightW - padRight;

  int thisMonthY = topY + padTopMonth;
  int thisMonthH = topH - padTopMonth;

  int nextMonthY = botY;
  int nextMonthH = bottomH - padBottomMonth;

  int nextYear = year;
  int nextMonth0 = month0 + 1;
  if (nextMonth0 >= 12) {
    nextMonth0 = 0;
    nextYear = year + 1;
  }

  drawReminderMonthCalendarRows(calX, thisMonthY - 9, calW, thisMonthH + 8,
                                year, month0,
                                year, month0, dayNum,
                                true,
                                true,
                                true,
                                6);

  drawReminderMonthCalendarRows(calX, nextMonthY, calW, nextMonthH,
                                nextYear, nextMonth0,
                                year, month0, dayNum,
                                true,
                                true,
                                false,
                                6);
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

  ReminderBucket buckets[MAX_BUCKETS];
  int bucketCount = buildBuckets(buckets, MAX_BUCKETS);
  int primaryIdx = findPrimaryBucketIndex(buckets, bucketCount);

  if (c.size == CELL_SMALL) {
    renderSmall(c, buckets, bucketCount, primaryIdx);
    return;
  }

  if (c.size == CELL_MEDIUM) {
    renderMedium(c, buckets, bucketCount, primaryIdx);
    return;
  }

  if (c.size == CELL_LARGE) {
    renderLarge(c, buckets, bucketCount, primaryIdx);
    return;
  }

  if (c.size == CELL_XL) {
    renderXL(c, buckets, bucketCount, primaryIdx);
    return;
  }

  renderMedium(c, buckets, bucketCount, primaryIdx);
}

} // namespace ModuleReminders