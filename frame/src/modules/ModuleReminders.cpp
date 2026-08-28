#include "FrameText.h"
#include "FrameLayout.h"
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
#include <esp_heap_caps.h>
#include <freertos/FreeRTOS.h>
#include <freertos/task.h>

#include "Fonts/FreeSans9ptNO.h"
#include "Fonts/FreeSansBold12ptNO.h"
#include "Fonts/FreeSansBold18ptNO.h"

#define FONT_B9  (&FreeSans9pt8b)
#define FONT_B12 (&FreeSansBold12pt8b)
#define FONT_B18 (&FreeSansBold18pt8b)

static const GFXfont* REMINDER_CONTENT_FONT = FONT_B12;

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

static const int MAX_REMINDERS = 10;
static const size_t REMINDERS_MAX_BODY_BYTES = 4096;
static const size_t REMINDERS_JSON_CAPACITY = 6144;
static const size_t REMINDERS_FILTER_CAPACITY = 512;
static const int MAX_BUCKETS = 10;
static const int MAX_BUCKET_ITEMS = 10;

struct ReminderItem {
  bool used = false;
  char title[96] = {0};
  char time[12] = {0};           // HH:MM or empty
  char occurrenceDate[16] = {0}; // YYYY-MM-DD
  char displayDate[24] = {0};
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

static bool isEveningHour() {
  time_t now = time(nullptr);
  if (now <= 0) return false;

  struct tm localNow;
  localtime_r(&now, &localNow);
  return localNow.tm_hour >= 17 && localNow.tm_hour < 24;
}

static void utf8ToLatin1(char* out, size_t n, const char* in) {
  FrameText::normalizeUtf8ForDisplay(out, n, in);
}

static void clearCache() {
  g_cache.loaded = false;
  g_cache.ok = false;
  g_cache.count = 0;
  for (int i = 0; i < MAX_REMINDERS; i++) g_cache.items[i] = ReminderItem{};
}

static void markUnavailable() {
  g_cache.loaded = true;
  g_cache.ok = false;
  g_cache.count = 0;
}

static uint32_t loopStackHighWaterMarkBytes() {
  return (uint32_t)uxTaskGetStackHighWaterMark(nullptr) * sizeof(StackType_t);
}

static void logMemoryStats(const char* stage) {
  REM_LOG("REM memory ");
  REM_LOG(stage);
  REM_LOG(" free_heap=");
  REM_LOG(ESP.getFreeHeap());
  REM_LOG(" largest_free_block=");
  REM_LOG(heap_caps_get_largest_free_block(MALLOC_CAP_8BIT));
  REM_LOG(" loop_stack_hwm=");
  REM_LOGLN(loopStackHighWaterMarkBytes());
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

// Adaptive cells use word-safe fitting. Keep the legacy character fitter above
// untouched because the four handmade anchor renderers are deliberately frozen.
static void fitAdaptiveText(const char* src, char* dst, size_t dstSize,
                            int maxWidth, const GFXfont* font) {
  if (!dst || dstSize == 0) return;
  dst[0] = '\0';
  if (!src || !src[0] || maxWidth <= 0) return;
  if (textWidth(src, font) <= maxWidth) { safeCopy(dst, dstSize, src); return; }
  const char* ellipsis = "...";
  if (textWidth(ellipsis, font) > maxWidth) return;
  size_t limit = strlen(src);
  if (limit > dstSize - 4) limit = dstSize - 4;
  while (limit > 0) {
    while (limit > 0 && src[limit] != ' ' && src[limit - 1] != ' ') limit--;
    while (limit > 0 && src[limit - 1] == ' ') limit--;
    if (limit == 0) break;
    memcpy(dst, src, limit); dst[limit] = '\0'; strlcat(dst, ellipsis, dstSize);
    if (textWidth(dst, font) <= maxWidth) return;
    limit--;
  }
  safeCopy(dst, dstSize, ellipsis);
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

static int weekdayIndexYMD(int y, int m, int d);
static const char* weekdayNameFull(int idx);

static const char* weekdayNameFullNorwegian(int idx) {
  switch (idx) {
    case 0: return "S" "\xF8" "ndag";
    case 1: return "Mandag";
    case 2: return "Tirsdag";
    case 3: return "Onsdag";
    case 4: return "Torsdag";
    case 5: return "Fredag";
    case 6: return "L" "\xF8" "rdag";
    default: return "";
  }
}

static bool isAsciiDigit(char c) {
  return c >= '0' && c <= '9';
}

static void trimRightInPlace(char* s) {
  if (!s) return;
  int len = (int)strlen(s);
  while (len > 0 && (s[len - 1] == ' ' || s[len - 1] == '\t')) {
    s[--len] = '\0';
  }
}

static void trimDanglingDateSeparator(char* s) {
  if (!s) return;
  trimRightInPlace(s);

  int len = (int)strlen(s);
  while (len > 0) {
    char c = s[len - 1];
    if (c == '-' || c == ',' || c == ':' || c == '/' || c == '(' || c == '[') {
      s[--len] = '\0';
      trimRightInPlace(s);
      continue;
    }
    break;
  }
}

static bool hasLabelBoundaryBefore(const char* s, int start) {
  if (!s || start <= 0) return false;
  char c = s[start - 1];
  return c == ' ' || c == '\t' || c == '-' || c == ',' || c == ':' || c == '(' || c == '[';
}

static int trailingTimeStart(const char* s, int end) {
  if (!s) return -1;
  while (end > 0 && (s[end - 1] == ' ' || s[end - 1] == '\t')) end--;

  int tokenStart = end;
  while (tokenStart > 0 && s[tokenStart - 1] != ' ' && s[tokenStart - 1] != '\t') tokenStart--;

  int len = end - tokenStart;
  if (len != 5) return -1;
  if (!isAsciiDigit(s[tokenStart]) || !isAsciiDigit(s[tokenStart + 1])) return -1;
  if (s[tokenStart + 2] != ':') return -1;
  if (!isAsciiDigit(s[tokenStart + 3]) || !isAsciiDigit(s[tokenStart + 4])) return -1;

  int hh = (s[tokenStart] - '0') * 10 + (s[tokenStart + 1] - '0');
  int mm = (s[tokenStart + 3] - '0') * 10 + (s[tokenStart + 4] - '0');
  if (hh > 23 || mm > 59) return -1;

  return tokenStart;
}

static bool stripTrailingLabelOnce(const char* in, const char* label, char* out, size_t outSize) {
  if (!in || !label || !label[0] || !out || outSize == 0) return false;

  char work[128];
  safeCopy(work, sizeof(work), in);
  trimRightInPlace(work);

  int len = (int)strlen(work);
  if (len <= 0) return false;

  int timeStart = trailingTimeStart(work, len);
  int labelEnd = (timeStart >= 0) ? timeStart : len;
  while (labelEnd > 0 && (work[labelEnd - 1] == ' ' || work[labelEnd - 1] == '\t')) labelEnd--;

  int labelLen = (int)strlen(label);
  int labelStart = labelEnd - labelLen;
  if (labelStart <= 0) return false;
  if (strncmp(work + labelStart, label, labelLen) != 0) return false;
  if (!hasLabelBoundaryBefore(work, labelStart)) return false;

  char prefix[128];
  int prefixLen = labelStart;
  if (prefixLen >= (int)sizeof(prefix)) prefixLen = (int)sizeof(prefix) - 1;
  memcpy(prefix, work, prefixLen);
  prefix[prefixLen] = '\0';
  trimDanglingDateSeparator(prefix);
  if (!prefix[0]) return false;

  if (timeStart >= 0) {
    char timePart[16];
    safeCopy(timePart, sizeof(timePart), work + timeStart);
    trimRightInPlace(timePart);
    snprintf(out, outSize, "%s %s", prefix, timePart);
  } else {
    safeCopy(out, outSize, prefix);
  }

  return true;
}

static void addDateLabelsForReminder(const ReminderItem& r, const char** labels, int& count, int maxLabels,
                                     char dateShort[8], char dateLong[12]) {
  int y = 0, m = 0, d = 0;
  if (!parseYMD10(r.occurrenceDate, y, m, d)) return;

  int wd = weekdayIndexYMD(y, m, d);

  if (r.daysUntil <= 0) {
    if (count < maxLabels) labels[count++] = "Today";
    if (count < maxLabels) labels[count++] = "I dag";
  } else if (r.daysUntil == 1) {
    if (count < maxLabels) labels[count++] = "Tomorrow";
    if (count < maxLabels) labels[count++] = "I morgen";
  } else {
    if (count < maxLabels) labels[count++] = weekdayNameFull(wd);
    if (count < maxLabels) labels[count++] = weekdayNameFullNorwegian(wd);
  }

  snprintf(dateShort, 8, "%02d.%02d", d, m);
  snprintf(dateLong, 12, "%02d.%02d.%04d", d, m, y);
  if (count < maxLabels) labels[count++] = dateLong;
  if (count < maxLabels) labels[count++] = dateShort;
  if (r.displayDate[0] && strcmp(r.displayDate, "Today") != 0 && strcmp(r.displayDate, "Tomorrow") != 0) {
    if (count < maxLabels) labels[count++] = r.displayDate;
  }
}

static void stripDuplicateReminderDateLabel(const ReminderItem& r, char* out, size_t outSize) {
  if (!out || outSize == 0) return;
  safeCopy(out, outSize, r.title);

  const char* labels[8];
  int labelCount = 0;
  char dateShort[8] = {0};
  char dateLong[12] = {0};
  addDateLabelsForReminder(r, labels, labelCount, 8, dateShort, dateLong);

  for (int i = 0; i < labelCount; i++) {
    char stripped[128];
    if (stripTrailingLabelOnce(out, labels[i], stripped, sizeof(stripped))) {
      safeCopy(out, outSize, stripped);
      return;
    }
  }
}

static void buildReminderTitleWithTime(const ReminderItem& r, char* out, size_t outSize) {
  if (!out || outSize == 0) return;
  out[0] = '\0';

  char cleanTitle[128];
  stripDuplicateReminderDateLabel(r, cleanTitle, sizeof(cleanTitle));

  if (r.time[0]) {
    snprintf(out, outSize, "%s %s", r.time, cleanTitle);
  } else {
    safeCopy(out, outSize, cleanTitle);
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

  Serial.println("REM before fetch");
  logMemoryStats("before_fetch");

  String url = String(BASE_URL)
             + "/api/device/reminders?device_id="
             + DeviceIdentity::getDeviceId()
             + "&limit=10&tz=Europe/Oslo&skip_sync=1";

  int code = 0;
  String body;
  bool ok = NetClient::httpGetAuth(url, DeviceIdentity::getToken(), code, body);

  Serial.println("REM after fetch");
  REM_LOG("reminders HTTP code=");
  REM_LOG(code);
  REM_LOG(" body_bytes=");
  REM_LOGLN(body.length());
  logMemoryStats("after_fetch");

  if (!ok || code != 200 || body.length() == 0) {
    markUnavailable();
    return false;
  }

  if (body.length() > REMINDERS_MAX_BODY_BYTES) {
    REM_LOG("reminders oversized body_bytes=");
    REM_LOG(body.length());
    REM_LOG(" max=");
    REM_LOGLN(REMINDERS_MAX_BODY_BYTES);
    markUnavailable();
    return false;
  }

  DynamicJsonDocument filter(REMINDERS_FILTER_CAPACITY);
  if (filter.capacity() == 0) {
    REM_LOGLN("reminders filter allocation failed");
    markUnavailable();
    return false;
  }

  JsonObject itemFilter = filter["items"][0].to<JsonObject>();
  itemFilter["title"] = true;
  itemFilter["occurrence_date"] = true;
  itemFilter["display_date"] = true;
  itemFilter["days_until"] = true;
  itemFilter["is_overdue"] = true;
  itemFilter["display_time"] = true;

  DynamicJsonDocument doc(REMINDERS_JSON_CAPACITY);
  if (doc.capacity() == 0) {
    REM_LOGLN("reminders JSON allocation failed");
    markUnavailable();
    return false;
  }

  Serial.println("REM before parse");
  REM_LOG("reminders JSON capacity=");
  REM_LOGLN(doc.capacity());
  logMemoryStats("before_parse");

  DeserializationError err = deserializeJson(
    doc,
    body,
    DeserializationOption::Filter(filter)
  );

  Serial.println("REM after parse");
  REM_LOG("reminders deserialize=");
  REM_LOGLN(err ? err.c_str() : "Ok");
  logMemoryStats("after_parse");

  if (err || doc.overflowed()) {
    if (doc.overflowed()) REM_LOGLN("reminders JSON document overflowed");
    markUnavailable();
    return false;
  }

  JsonArray items = doc["items"].as<JsonArray>();
  if (items.isNull()) {
    g_cache.loaded = true;
    g_cache.ok = true;
    g_cache.count = 0;
    Serial.println("REM cache populated");
    REM_LOGLN("reminders parsed_count=0");
    return true;
  }

  int idx = 0;
  for (JsonObject it : items) {
    if (idx >= MAX_REMINDERS) break;

    ReminderItem& r = g_cache.items[idx];
    r.used = true;

    const char* rawTitle = it["title"] | "";
    utf8ToLatin1(r.title, sizeof(r.title), rawTitle);

    char rawTime[24] = {0};
    safeCopy(rawTime, sizeof(rawTime), it["display_time"] | "");
    extractTimeHHMM(rawTime, r.time, sizeof(r.time));

    const char* rawOccurrenceDate = it["occurrence_date"] | "";
    safeCopy(r.occurrenceDate, sizeof(r.occurrenceDate), rawOccurrenceDate);

    const char* rawDisplayDate = it["display_date"] | "";
    utf8ToLatin1(r.displayDate, sizeof(r.displayDate), rawDisplayDate);


    r.daysUntil = it["days_until"] | 0;
    r.isOverdue = it["is_overdue"] | false;

    idx++;
  }

  g_cache.loaded = true;
  g_cache.ok = true;
  g_cache.count = idx;
  Serial.println("REM cache populated");
  REM_LOG("reminders parsed_count=");
  REM_LOGLN(idx);
  logMemoryStats("cache_populated");
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

static void drawBulletWrappedItem(int bulletX,
                                  int textX,
                                  int firstBaselineY,
                                  const char lines[][128],
                                  int lineCount,
                                  const GFXfont* font,
                                  int lineStep,
                                  uint16_t ink,
                                  bool drawBullet) {
  if (lineCount <= 0) return;

  auto& d = DisplayCore::get();
  const int dotR = 3;
  if (drawBullet) {
    d.fillCircle(bulletX, firstBaselineY - lineStep / 2 + 2, dotR, ink);
  }

  d.setFont(font);
  d.setTextColor(ink);
  d.setTextSize(1);
  for (int i = 0; i < lineCount; i++) {
    d.setCursor(textX, firstBaselineY + i * lineStep);
    d.print(lines[i]);
  }
  d.setFont(nullptr);
}

static int measuredTextHeight(const char* text, const GFXfont* font) {
  int16_t x1, y1;
  uint16_t tw, th;
  measureText(text, font, x1, y1, tw, th);
  return (int)th;
}

static int smartLineStep(const GFXfont* font) {
  if (font == FONT_B12) return 21;
  if (font == FONT_B9) return 16;
  return fontLineHeight(font) + 3;
}

static int smartItemGap(const GFXfont* font, bool wrapped) {
  if (!wrapped) return (font == FONT_B9) ? 8 : 12;
  return (font == FONT_B9) ? 7 : 9;
}

static void appendReminderLabel(const char* title, const char* label, char* out, size_t outSize) {
  if (!out || outSize == 0) return;
  out[0] = '\0';
  if (!title) title = "";
  if (label && label[0]) snprintf(out, outSize, "%s  %s", title, label);
  else safeCopy(out, outSize, title);
}

static int wrapTextToLines(const char* src,
                           char lines[][128],
                           int maxLines,
                           int maxWidth,
                           const GFXfont* font) {
  if (!lines || maxLines <= 0) return 0;
  for (int i = 0; i < maxLines; i++) lines[i][0] = '\0';
  if (!src || !src[0]) return 0;

  char work[160];
  safeCopy(work, sizeof(work), src);

  int lineCount = 0;
  char current[128] = {0};

  char* save = nullptr;
  char* word = strtok_r(work, " ", &save);
  while (word) {
    char candidate[128];
    if (current[0]) snprintf(candidate, sizeof(candidate), "%s %s", current, word);
    else safeCopy(candidate, sizeof(candidate), word);

    if (textWidth(candidate, font) <= maxWidth) {
      safeCopy(current, sizeof(current), candidate);
    } else {
      if (current[0]) {
        safeCopy(lines[lineCount++], 128, current);
        current[0] = '\0';
        if (lineCount >= maxLines) break;
      }

      if (textWidth(word, font) <= maxWidth) {
        safeCopy(current, sizeof(current), word);
      } else {
        fitTextToWidth(word, lines[lineCount++], 128, maxWidth, font);
        current[0] = '\0';
        if (lineCount >= maxLines) break;
      }
    }

    word = strtok_r(nullptr, " ", &save);
  }

  if (lineCount < maxLines && current[0]) {
    safeCopy(lines[lineCount++], 128, current);
  }

  return lineCount;
}

struct SmartReminderLine {
  int itemIdx = -1;
  char title[128] = {0};
  char oneLine[160] = {0};
  char lines[5][128] = {{0}};
  int lineCount = 0;
};

struct SmartReminderLayout {
  bool fits = false;
  bool wrapped = false;
  bool includeLabel = false;
  const GFXfont* font = FONT_B12;
  int count = 0;
  int blockH = 0;
  int maxLineW = 0;
  int lineStep = 0;
  int itemGap = 0;
  SmartReminderLine items[4];
};

static SmartReminderLayout* g_smartLayoutScratch = nullptr;

static void resetSmartReminderLayout(SmartReminderLayout& layout) {
  memset(&layout, 0, sizeof(layout));
  layout.font = FONT_B12;

  for (int i = 0; i < 4; i++) {
    layout.items[i].itemIdx = -1;
  }
}

static bool ensureSmartReminderLayoutScratch() {
  if (g_smartLayoutScratch) return true;

  const size_t scratchBytes = sizeof(SmartReminderLayout) * 2;

  g_smartLayoutScratch =
    static_cast<SmartReminderLayout*>(
      heap_caps_malloc(scratchBytes, MALLOC_CAP_8BIT)
    );

  if (!g_smartLayoutScratch) {
    REM_LOG("smart layout heap allocation failed bytes=");
    REM_LOGLN(scratchBytes);
    return false;
  }

  resetSmartReminderLayout(g_smartLayoutScratch[0]);
  resetSmartReminderLayout(g_smartLayoutScratch[1]);

  REM_LOG("smart layout heap allocated bytes=");
  REM_LOGLN(scratchBytes);

  return true;
}

static bool buildSmartReminderLayout(const ReminderBucket& bucket,
                                     int count,
                                     int rotation,
                                     int maxTextW,
                                     int maxH,
                                     const char* label,
                                     const GFXfont* font,
                                     bool includeLabel,
                                     bool allowWrap,
                                     SmartReminderLayout& out) {
  resetSmartReminderLayout(out);
  out.font = font;
  out.count = count;
  out.includeLabel = includeLabel;
  out.wrapped = allowWrap;
  out.lineStep = smartLineStep(font);
  out.itemGap = smartItemGap(font, allowWrap);

  if (count <= 0 || bucket.count <= 0 || maxTextW <= 0 || maxH <= 0) return false;

  int totalH = 0;
  int maxLineW = 0;

  for (int i = 0; i < count; i++) {
    int pick = wrapIndex(rotation + i, bucket.count);
    int itemIdx = bucket.itemIdx[pick];
    if (itemIdx < 0 || itemIdx >= g_cache.count) return false;

    SmartReminderLine& item = out.items[i];
    item.itemIdx = itemIdx;
    buildReminderTitleWithTime(g_cache.items[itemIdx], item.title, sizeof(item.title));
    appendReminderLabel(item.title, includeLabel ? label : "", item.oneLine, sizeof(item.oneLine));

    if (!allowWrap) {
      if (textWidth(item.oneLine, font) > maxTextW) return false;
      safeCopy(item.lines[0], sizeof(item.lines[0]), item.oneLine);
      item.lineCount = 1;
      int lineW = textWidth(item.lines[0], font);
      if (lineW > maxLineW) maxLineW = lineW;
      totalH += measuredTextHeight(item.lines[0], font);
    } else {
      item.lineCount = wrapTextToLines(item.oneLine, item.lines, 5, maxTextW, font);
      if (item.lineCount <= 0) return false;
      for (int line = 0; line < item.lineCount; line++) {
        int lineW = textWidth(item.lines[line], font);
        if (lineW > maxLineW) maxLineW = lineW;
      }
      totalH += item.lineCount * out.lineStep;
    }

    if (i > 0) totalH += out.itemGap;
  }

  if (totalH > maxH) return false;

  out.blockH = totalH;
  out.maxLineW = maxLineW;
  out.fits = true;
  return true;
}

static bool findSmartReminderLayout(const ReminderBucket& bucket,
                                    int desiredCount,
                                    int maxTextW,
                                    int maxH,
                                    const char* label,
                                    SmartReminderLayout& out) {
  const int rotation = getRotationStep4h();

  for (int count = desiredCount; count >= 1; count--) {
    if (buildSmartReminderLayout(bucket, count, rotation, maxTextW, maxH, label,
                                 REMINDER_CONTENT_FONT, true, false, out)) return true;

    if (buildSmartReminderLayout(bucket, count, rotation, maxTextW, maxH, label,
                                 REMINDER_CONTENT_FONT, false, false, out)) return true;

    if (buildSmartReminderLayout(bucket, count, rotation, maxTextW, maxH, label,
                                 REMINDER_CONTENT_FONT, false, true, out)) return true;

    if (buildSmartReminderLayout(bucket, count, rotation, maxTextW, maxH, label,
                                 FONT_B9, false, true, out)) return true;
  }

  return false;
}

static bool buildEmergencyReminderLayout(const ReminderBucket& bucket,
                                         int rotation,
                                         int maxTextW,
                                         int maxH,
                                         SmartReminderLayout& out) {
  resetSmartReminderLayout(out);
  out.font = FONT_B9;
  out.count = 1;
  out.wrapped = false;
  out.includeLabel = false;
  out.lineStep = smartLineStep(FONT_B9);
  out.itemGap = 0;

  if (bucket.count <= 0 || maxTextW <= 0) return false;
  int itemIdx = bucket.itemIdx[wrapIndex(rotation, bucket.count)];
  if (itemIdx < 0 || itemIdx >= g_cache.count) return false;

  SmartReminderLine& item = out.items[0];
  item.itemIdx = itemIdx;
  buildReminderTitleWithTime(g_cache.items[itemIdx], item.title, sizeof(item.title));
  fitTextToWidth(item.title, item.lines[0], sizeof(item.lines[0]), maxTextW, FONT_B9);
  item.lineCount = item.lines[0][0] ? 1 : 0;
  if (item.lineCount <= 0) return false;

  out.blockH = measuredTextHeight(item.lines[0], FONT_B9);
  if (out.blockH > maxH) return false;

  out.maxLineW = textWidth(item.lines[0], FONT_B9);
  out.fits = true;
  return true;
}

static void drawBucketLinesCentered(const Cell& c,
                                    const ReminderBucket& bucket,
                                    int visibleCount,
                                    int yTop,
                                    int totalH,
                                    const GFXfont* lineFont) {
  logMemoryStats("before_smart_layout");
  (void)lineFont;
  if (visibleCount <= 0 || bucket.count <= 0 || totalH <= 0) return;

  const int dotR = 3;
  const int gap = 10;
  const int sidePad = 18;
  const int multiItemMaxTextW = c.w - sidePad * 2 - dotR * 2 - gap;
  const int singleItemMaxTextW = c.w - sidePad * 2;
  if (multiItemMaxTextW <= 20 || singleItemMaxTextW <= 20) return;

  if (!ensureSmartReminderLayoutScratch()) {
    REM_LOGLN("smart reminder rendering skipped: no heap scratch");
    return;
  }

  char label[32];
  buildRelativeDateText(bucket.daysUntil, bucket.isOverdue, label, sizeof(label));

  SmartReminderLayout& layout = g_smartLayoutScratch[0];
  resetSmartReminderLayout(layout);
  const int desiredCount = min(visibleCount, 4);
  const int initialMaxTextW = (desiredCount == 1) ? singleItemMaxTextW : multiItemMaxTextW;
  if (!findSmartReminderLayout(bucket, desiredCount, initialMaxTextW, totalH, label, layout)) {
    if (!buildEmergencyReminderLayout(bucket, getRotationStep4h(), singleItemMaxTextW, totalH, layout)) {
      return;
    }
  }

  if (layout.count == 1 && initialMaxTextW != singleItemMaxTextW) {
    SmartReminderLayout& singleLayout = g_smartLayoutScratch[1];
    resetSmartReminderLayout(singleLayout);
    if (findSmartReminderLayout(bucket, 1, singleItemMaxTextW, totalH, label, singleLayout)) {
      layout = singleLayout;
    } else if (buildEmergencyReminderLayout(bucket, getRotationStep4h(), singleItemMaxTextW, totalH, singleLayout)) {
      layout = singleLayout;
    }
  }
  logMemoryStats("after_smart_layout");

  const bool drawBullets = layout.count > 1;
  const int rowW = (drawBullets ? dotR * 2 + gap : 0) + layout.maxLineW;
  int textX = c.x + (c.w - rowW) / 2 + (drawBullets ? dotR * 2 + gap : 0);
  int minTextX = c.x + sidePad + (drawBullets ? dotR * 2 + gap : 0);
  if (textX < minTextX) textX = minTextX;
  int bulletX = drawBullets ? textX - gap - dotR : textX;

  int y = yTop + (totalH - layout.blockH) / 2;
  if (y < yTop) y = yTop;

  const uint16_t ink = Theme::ink();
  for (int i = 0; i < layout.count; i++) {
    SmartReminderLine& item = layout.items[i];
    if (item.lineCount <= 0) continue;

    int firstBaselineY;
    if (layout.wrapped) {
      firstBaselineY = y + layout.lineStep - 4;
    } else {
      int textH = measuredTextHeight(item.lines[0], layout.font);
      int16_t x1, y1; uint16_t tw, th;
      measureText(item.lines[0], layout.font, x1, y1, tw, th);
      firstBaselineY = y - y1;
      (void)textH;
    }

    drawBulletWrappedItem(bulletX, textX, firstBaselineY,
                          item.lines, item.lineCount, layout.font,
                          layout.lineStep, ink, drawBullets);

    int itemH = layout.wrapped ? item.lineCount * layout.lineStep
                               : measuredTextHeight(item.lines[0], layout.font);
    y += itemH + layout.itemGap;
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

        d.fillCircle(centerX, centerY, radius, Theme::fill());
        d.setTextColor(Theme::onFill());
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
  measureText("00.00", REMINDER_CONTENT_FONT, dx1, dy1, dtw, dth);
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
    fitTextToWidth(fullBuf, titleBuf, sizeof(titleBuf), maxNameW, REMINDER_CONTENT_FONT);

    int rowY = startY + i * lineH;
    int baselineY = rowY + lineH / 2;

    int16_t tx1, ty1; uint16_t tw, th;
    measureText(dateStr, REMINDER_CONTENT_FONT, tx1, ty1, tw, th);

    int dateX = startX + (dateColW - (int)tw);

    d.setFont(REMINDER_CONTENT_FONT);
    d.setTextColor(ink);
    d.setCursor(dateX - tx1, baselineY);
    d.print(dateStr);

    int nameX = startX + dateColW + gap;
    d.setFont(REMINDER_CONTENT_FONT);
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

  const bool showTomorrowNote = headerIsToday && isEveningHour();
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
                   REMINDER_CONTENT_FONT);

    int16_t tx1, ty1;
    uint16_t tw, th;
    measureText(titleBuf, REMINDER_CONTENT_FONT, tx1, ty1, tw, th);

    int cx = secX0 + secW / 2;
    int baselineY = contentTop + (contentH - (int)th) / 2 - ty1;

    d.setFont(REMINDER_CONTENT_FONT);
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

  const bool showTomorrowNote = headerIsToday && isEveningHour();

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

    d.fillRect(rectX, rectY, rectW, rectH, Theme::fill());

    int textX = rectX + (rectW - (int)bw) / 2;
    int textY = rectY + (rectH - (int)bh) / 2;

    d.setTextColor(Theme::onFill());
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
    drawBucketLinesCentered(c, bucket, visibleCount, contentTop, contentH, REMINDER_CONTENT_FONT);
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
// Adaptive physical composition mirrors app/lib/remindersResponsive.mjs. All
// regions are derived from the resolved pixel cell; no heap-backed containers
// or temporary String values are used by this renderer.
enum AdaptiveReminderFamily { REM_VERTICAL_LIST, REM_SHALLOW_HORIZONTAL, REM_SPLIT_SECTIONS };

struct AdaptiveReminderComposition {
  AdaptiveReminderFamily family = REM_VERTICAL_LIST;
  bool showHeading = false;
  bool showTomorrow = false;
  int todayItems = 0, tomorrowItems = 0;
  int todayOverflow = 0, tomorrowOverflow = 0;
  int splitPercent = 50;
  bool denseFont = false;
  int readabilityScore = 0;
};

struct ReminderRect { int x = 0, y = 0, w = 0, h = 0; };

struct AdaptiveReminderDensity {
  const GFXfont* font;
  int rowH;
  int rowGap;
  int timeW;
};

// Keep these pixel thresholds and metrics in sync with reminderDensity() in
// app/lib/remindersResponsive.mjs. B9 is the readability floor, not default.
static AdaptiveReminderDensity adaptiveReminderDensity(int availablePixels, int requiredRows) {
  const int pixelsPerRow = requiredRows > 0 ? availablePixels / requiredRows : availablePixels;
  if (pixelsPerRow >= 44) return {FONT_B12, 42, 5, 62};
  return {FONT_B9, 34, 4, 48};
}

static int adaptiveEstimatedTextWidth(const char* value, bool dense) {
  int units = 0;
  for (const uint8_t* p = (const uint8_t*)value; p && *p;) {
    const uint8_t lead = *p;
    // Decode only far enough to advance exactly one Unicode code point. The
    // weighting model distinguishes ASCII classes; every non-ASCII code point
    // intentionally receives the same six units as Studio.
    uint32_t codepoint = lead;
    int advance = 1;
    if ((lead & 0xE0) == 0xC0 && (p[1]&0xC0)==0x80) { codepoint=((lead&0x1F)<<6)|(p[1]&0x3F);advance=2; }
    else if ((lead & 0xF0) == 0xE0 && (p[1]&0xC0)==0x80 && (p[2]&0xC0)==0x80) { codepoint=((lead&0x0F)<<12)|((p[1]&0x3F)<<6)|(p[2]&0x3F);advance=3; }
    else if ((lead & 0xF8) == 0xF0 && (p[1]&0xC0)==0x80 && (p[2]&0xC0)==0x80 && (p[3]&0xC0)==0x80) { codepoint=((lead&7)<<18)|((p[1]&0x3F)<<12)|((p[2]&0x3F)<<6)|(p[3]&0x3F);advance=4; }
    p += advance;
    if (codepoint > 0x7F) { units += 6; continue; }
    const char ch = (char)codepoint;
    if (ch == ' ') units += 3;
    else if (strchr("ilI1.,:;!'|", ch)) units += 3;
    else if (strchr("MW@%&", ch)) units += 9;
    else if ((ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9')) units += 7;
    else units += 6;
  }
  return (units * (dense ? 108 : 142) + 99) / 100;
}

static int adaptiveUsefulTitleScore(const ReminderItem& item, int width, bool dense) {
  const int full = adaptiveEstimatedTextWidth(item.title, dense);
  if (width < 54 || full <= 0) return 0;
  const int fraction = min(100, (width * 100) / full);
  if (fraction < 28) return 0;
  return fraction < 42 ? (fraction * 35) / 100 : fraction;
}

static AdaptiveReminderComposition adaptiveComposition(const Cell& c, const ReminderBucket* today,
                                                        const ReminderBucket* tomorrow) {
  AdaptiveReminderComposition out;
  const int todayCount = today ? today->count : 0, tomorrowCount = tomorrow ? tomorrow->count : 0;
  const FrameLayout::Rect bounds = {c.x, c.y, c.w, c.h};
  const int pad = FrameLayout::clampMeasurement((int)lroundf(min(c.w, c.h) * .08f), 9, 18);
  const FrameLayout::Rect usable = FrameLayout::inset(bounds, pad, pad);
  const float ratio = c.h > 0 ? (float)c.w / (float)c.h : 1.0f;
  const bool landscape = ratio > 1.12f;
  const bool shallow = landscape && usable.height < 126;
  const bool split = !shallow && landscape && usable.width >= 464 && usable.height >= 164;
  out.family = shallow ? REM_SHALLOW_HORIZONTAL : split ? REM_SPLIT_SECTIONS : REM_VERTICAL_LIST;
  out.showHeading = !shallow && usable.height >= 104;

  const int totalCount = todayCount + tomorrowCount;
  const int headingH = out.showHeading ? 30 : 0;
  const int footerH = 24, rowH = 38, rowGap = 4, sectionGap = 10;
  if (shallow) {
    const int initial = FrameLayout::rowCapacity(usable.width, 142, 12);
    const bool canFitFooter = usable.width >= 142 + 12 + 42;
    const int contentWidth = usable.width - (totalCount > initial && canFitFooter ? 66 : 0);
    const int capacity = FrameLayout::rowCapacity(contentWidth, 142, 12);
    out.showTomorrow = todayCount == 0 && tomorrowCount > 0;
    out.todayItems = min(todayCount, capacity);
    out.tomorrowItems = out.showTomorrow ? min(tomorrowCount, capacity - out.todayItems) : 0;
  } else if (split) {
    out.showTomorrow = tomorrowCount > 0;
    // Evaluate both orientations, both permitted item fonts and deterministic
    // width splits using the real titles. A technically fitting row with only
    // a one-word prefix is rejected rather than rewarded as another item.
    int bestMinimum = -1, bestAverage = -1, bestFont = -1, bestToday = -1, bestCount = -1;
    const int splitPercents[] = {35, 40, 45, 50, 55, 60, 65};
    for (int dense = 0; dense <= 1; dense++) for (int vertical = 0; vertical <= 1; vertical++) {
      const AdaptiveReminderDensity density = dense ? AdaptiveReminderDensity{FONT_B9,34,4,48}
                                                     : AdaptiveReminderDensity{FONT_B12,42,5,62};
      const int ratioCount = vertical ? 1 : 7;
      for (int ratioIndex = 0; ratioIndex < ratioCount; ratioIndex++) {
        const int ratioPercent = vertical ? 100 : splitPercents[ratioIndex];
        for (int ti = todayCount; ti >= min(1, todayCount); ti--) for (int mi = tomorrowCount; mi >= min(1, tomorrowCount); mi--) {
          const int sections = (ti ? 1 : 0) + (mi ? 1 : 0), overflow = totalCount - ti - mi;
          const int footer = overflow ? footerH : 0;
          int todayTitleW, tomorrowTitleW, rowsSpace;
          if (!vertical) {
            const int contentW = usable.width - (sections == 2 ? 18 : 0);
            const int todayW = (contentW * ratioPercent + 50) / 100;
            todayTitleW = todayW - density.timeW - 11;
            tomorrowTitleW = contentW - todayW - density.timeW - 11;
            rowsSpace = usable.height - headingH - footer;
            if (max(ti, mi) * (density.rowH + density.rowGap) - density.rowGap > rowsSpace) continue;
          } else {
            todayTitleW = tomorrowTitleW = usable.width - density.timeW - 11;
            rowsSpace = usable.height - sections * headingH - (sections > 1 ? 10 : 0) - footer;
            if ((ti + mi) * (density.rowH + density.rowGap) - sections * density.rowGap > rowsSpace) continue;
          }
          int minimum = 101, readable = 0; bool useful = true;
          for (int i = 0; i < ti; i++) { const int s = adaptiveUsefulTitleScore(g_cache.items[today->itemIdx[i]], todayTitleW, dense); useful &= s > 0; minimum=min(minimum,s); readable += s; }
          for (int i = 0; i < mi; i++) { const int s = adaptiveUsefulTitleScore(g_cache.items[tomorrow->itemIdx[i]], tomorrowTitleW, dense); useful &= s > 0; minimum=min(minimum,s); readable += s; }
          if (!useful) continue;
          const int fontRank = dense ? 0 : 1, count = ti + mi, average = readable / max(1,count);
          // B12 receives a one-item calmness bonus. Dense B9 wins only when it
          // exposes at least two more useful reminders than the best B12 option.
          const int informationRank = count + fontRank;
          const int bestInformationRank = bestCount + bestFont;
          const bool better = informationRank > bestInformationRank || (informationRank == bestInformationRank &&
            (fontRank > bestFont || (fontRank == bestFont && (count > bestCount ||
            (count == bestCount && (minimum > bestMinimum || (minimum == bestMinimum &&
            (average > bestAverage || (average == bestAverage && ti > bestToday)))))))));
          if (better) { bestMinimum=minimum;bestAverage=average;bestFont=fontRank;bestToday=ti;bestCount=count;
            out.family=vertical?REM_VERTICAL_LIST:REM_SPLIT_SECTIONS;out.splitPercent=ratioPercent;out.denseFont=dense;
            out.todayItems=ti;out.tomorrowItems=mi;out.readabilityScore=readable; }
        }
      }
    }
    if (bestCount < 0) {
      // Extremely long text may fail every fit threshold. Never render a blank
      // module: use the widest dense vertical fallback and preserve chronology.
      const AdaptiveReminderDensity density = {FONT_B9,34,4,48};
      const int sections = (todayCount && tomorrowCount) ? 2 : 1;
      const int rowsSpace = usable.height - sections * headingH - (sections > 1 ? 10 : 0) - footerH;
      const bool twoSections = sections == 2 && 2 * density.rowH <= rowsSpace;
      out.family=REM_VERTICAL_LIST;out.denseFont=true;out.splitPercent=100;
      out.todayItems=todayCount?1:0;out.tomorrowItems=tomorrowCount&&(!todayCount||twoSections)?1:0;
    }
  } else {
    out.showTomorrow = tomorrowCount > 0;
    int sectionCount = (todayCount > 0 ? 1 : 0) + (out.showTomorrow ? 1 : 0);
    int chrome = sectionCount * headingH + (sectionCount > 1 ? sectionGap : 0);
    int initial = FrameLayout::rowCapacity(usable.height - chrome, rowH, rowGap);
    int footerReserve = totalCount > initial ? footerH + 6 : 0;
    int capacity = FrameLayout::rowCapacity(usable.height - chrome - footerReserve, rowH, rowGap);

    // If two complete sections cannot meet their quality floors, Today retains
    // priority. Otherwise spend pixel-derived rows in Today-first rounds so
    // neither useful section is starved.
    if (todayCount > 0 && out.showTomorrow && capacity < 2) {
      out.showTomorrow = false;
      sectionCount = 1;
      chrome = headingH;
      initial = FrameLayout::rowCapacity(usable.height - chrome, rowH, rowGap);
      footerReserve = totalCount > initial ? footerH + 6 : 0;
      capacity = FrameLayout::rowCapacity(usable.height - chrome - footerReserve, rowH, rowGap);
    }
    int remaining = capacity;
    while (remaining > 0) {
      bool spent = false;
      if (out.todayItems < todayCount && remaining > 0) {
        out.todayItems++; remaining--; spent = true;
      }
      if (out.showTomorrow && out.tomorrowItems < tomorrowCount && remaining > 0) {
        out.tomorrowItems++; remaining--; spent = true;
      }
      if (!spent) break;
    }
  }
  out.todayOverflow = max(0, todayCount - out.todayItems);
  out.tomorrowOverflow = max(0, tomorrowCount - out.tomorrowItems);
  return out;
}

static void drawAdaptiveLabel(const ReminderRect& rect, const char* label, const GFXfont* font) {
  if (rect.w <= 0 || rect.h <= 0 || !label || !label[0]) return;
  int16_t x1, y1; uint16_t tw, th; measureText(label, font, x1, y1, tw, th);
  const int baseline = rect.y + max(0, (rect.h - (int)th) / 2) - y1;
  drawLeft(rect.x, baseline, label, font, Theme::ink());
}

static void drawAdaptiveItem(const ReminderItem& item, const ReminderRect& row, bool stacked,
                             const AdaptiveReminderDensity& density) {
  if (row.w < 1 || row.h < 1) return;
  const int inset = 2, x = row.x + inset, y = row.y + inset;
  const int w = max(1, row.w - inset * 2), h = max(1, row.h - inset * 2);
  ReminderRect timeRect, titleRect;
  if (stacked) {
    const int timeH = min(18, max(1, (h * 38) / 100));
    timeRect = {x, y, w, timeH}; titleRect = {x, y + timeH, w, max(1, h - timeH)};
  } else {
    // timeW covers HH:MM at this profile's font; adaptive non-stacked cells
    // retain the remaining width for the fitted title.
    const int timeW = density.timeW, gap = 7;
    timeRect = {x, y, timeW, h}; titleRect = {x + timeW + gap, y, max(1, w - timeW - gap), h};
  }
  if (item.time[0]) drawAdaptiveLabel(timeRect, item.time, density.font);
  char fitted[96]; fitAdaptiveText(item.title, fitted, sizeof(fitted), titleRect.w, density.font);
  drawAdaptiveLabel(titleRect, fitted, density.font);
}

static void drawAdaptiveOverflow(const ReminderRect& rect, int count) {
  if (count <= 0 || rect.w <= 0 || rect.h <= 0) return;
  char text[20]; snprintf(text, sizeof(text), "+%d more", count);
  drawAdaptiveLabel(rect, text, FONT_B9);
}

static void drawAdaptiveSection(const ReminderBucket* bucket, int visible, int overflow,
                                const ReminderRect& rect, bool heading, bool stacked,
                                const char* headingText, bool sectionFooter,
                                const AdaptiveReminderDensity* selectedDensity = nullptr) {
  if (!bucket || visible <= 0 || rect.w <= 0 || rect.h <= 0) return;
  const int headingH = heading ? 30 : 0;
  const int footerH = sectionFooter && overflow ? 24 : 0;
  if (heading) drawAdaptiveLabel({rect.x, rect.y, rect.w, headingH}, headingText, FONT_B12);
  const int available = max(1, rect.h - headingH - footerH);
  const AdaptiveReminderDensity density = selectedDensity
    ? *selectedDensity : adaptiveReminderDensity(available, visible);
  const int rowGap = density.rowGap;
  const int rowH = min(density.rowH,
    max(1, (available - max(0, visible - 1) * rowGap) / visible));
  for (int i = 0; i < visible; i++) {
    const int y0 = rect.y + headingH + i * (rowH + rowGap);
    const int itemIdx = bucket->itemIdx[i];
    if (itemIdx >= 0 && itemIdx < g_cache.count)
      drawAdaptiveItem(g_cache.items[itemIdx], {rect.x, y0, rect.w, rowH}, stacked, density);
  }
  if (footerH) drawAdaptiveOverflow({rect.x, rect.y + rect.h - footerH, rect.w, footerH}, overflow);
}

static void buildAdaptiveFallbackHeading(const ReminderBucket& bucket, char* out, size_t outSize) {
  if (!out || outSize == 0) return;
  out[0] = '\0';
  if (bucket.isOverdue || bucket.daysUntil < 0) {
    buildRelativeDateText(bucket.daysUntil, true, out, outSize);
    return;
  }
  const int firstItemIdx = bucket.count > 0 ? bucket.itemIdx[0] : -1;
  if (firstItemIdx >= 0 && firstItemIdx < g_cache.count) {
    const ReminderItem& item = g_cache.items[firstItemIdx];
    int y = 0, m = 0, day = 0;
    if (parseYMD10(item.occurrenceDate, y, m, day)) {
      const char* weekday = weekdayNameFull(weekdayIndexYMD(y, m, day));
      if (bucket.daysUntil <= 7) snprintf(out, outSize, "On %s", weekday);
      else if (bucket.daysUntil <= 14) snprintf(out, outSize, "%s next week", weekday);
      else if (item.displayDate[0]) safeCopy(out, outSize, item.displayDate);
    } else if (item.displayDate[0]) {
      safeCopy(out, outSize, item.displayDate);
    }
  }
  if (!out[0]) buildRelativeDateText(bucket.daysUntil, false, out, outSize);
  if (!out[0]) safeCopy(out, outSize, "Upcoming");
}

static void renderAdaptiveFallbackBucket(const Cell& c, const ReminderBucket& bucket) {
  const int pad = max(9, min(18, (int)lroundf(min(c.w, c.h) * .08f)));
  ReminderRect inner = {c.x + pad, c.y + pad, max(1, c.w - pad * 2), max(1, c.h - pad * 2)};
  const bool shallow = c.h <= 150 && c.w > c.h;
  const int capacity = shallow
    ? FrameLayout::rowCapacity(inner.w, 142, 12)
    : FrameLayout::rowCapacity(inner.h - min(30, max(20, inner.h / 4)), 38, 4);
  const int visible = min(bucket.count, capacity), overflow = max(0, bucket.count - visible);
  const int headingH = min(30, max(20, inner.h / 4));
  char heading[40]; buildAdaptiveFallbackHeading(bucket, heading, sizeof(heading));
  drawAdaptiveLabel({inner.x, inner.y, inner.w, headingH}, heading, FONT_B12);
  const int footerH = overflow ? 22 : 0;
  ReminderRect content = {inner.x, inner.y + headingH, inner.w,
                          max(1, inner.h - headingH - footerH - (footerH ? 4 : 0))};
  if (shallow) {
    const int gap = visible > 1 ? 12 : 0;
    const AdaptiveReminderDensity density = adaptiveReminderDensity(content.h, 1);
    for (int i = 0; i < visible; i++) {
      const int x0 = content.x + (content.w * i) / visible + (i ? gap / 2 : 0);
      const int x1 = content.x + (content.w * (i + 1)) / visible - (i + 1 < visible ? gap / 2 : 0);
      const int itemIdx = bucket.itemIdx[i];
      if (itemIdx >= 0 && itemIdx < g_cache.count)
        drawAdaptiveItem(g_cache.items[itemIdx], {x0, content.y, x1 - x0, content.h}, false, density);
    }
  } else {
    drawAdaptiveSection(&bucket, visible, 0, content, false, c.w < 230, heading, false);
  }
  drawAdaptiveOverflow({inner.x, inner.y + inner.h - footerH, inner.w, footerH}, overflow);
}

static void renderAdaptiveReminders(const Cell& c, const ReminderBucket* buckets, int bucketCount) {
  if (!g_cache.ok) { drawEmptyState(c, "No reminders", "Fetch failed"); return; }
  if (bucketCount == 0) { drawEmptyState(c, "No reminders", "Nothing upcoming"); return; }
  const int todayIdx = findBucketByDaysUntil(buckets, bucketCount, 0);
  const int tomorrowIdx = findBucketByDaysUntil(buckets, bucketCount, 1);
  const int todayCount = todayIdx >= 0 ? buckets[todayIdx].count : 0;
  const int tomorrowCount = tomorrowIdx >= 0 ? buckets[tomorrowIdx].count : 0;
  if (todayCount + tomorrowCount == 0) {
    const int primaryIdx = findPrimaryBucketIndex(buckets, bucketCount);
    if (primaryIdx >= 0) renderAdaptiveFallbackBucket(c, buckets[primaryIdx]);
    return;
  }
  const ReminderBucket* today = todayIdx >= 0 ? &buckets[todayIdx] : nullptr;
  const ReminderBucket* tomorrow = tomorrowIdx >= 0 ? &buckets[tomorrowIdx] : nullptr;
  const AdaptiveReminderComposition comp = adaptiveComposition(c, today, tomorrow);
  const int pad = max(9, min(18, (int)lroundf(min(c.w, c.h) * .08f)));
  ReminderRect inner = {c.x + pad, c.y + pad, max(1, c.w - pad * 2), max(1, c.h - pad * 2)};
  if (comp.family == REM_SPLIT_SECTIONS) {
    const bool hasToday = comp.todayItems > 0, hasTomorrow = comp.tomorrowItems > 0;
    const int gap = hasToday && hasTomorrow ? 18 : 0;
    const int todayWidth = !hasToday ? 0 : !hasTomorrow ? inner.w :
      ((inner.w - gap) * comp.splitPercent + 50) / 100;
    ReminderRect left = {inner.x, inner.y, todayWidth, inner.h};
    ReminderRect right = {inner.x + todayWidth + gap, inner.y, max(0, inner.w - todayWidth - gap), inner.h};
    const AdaptiveReminderDensity selected = comp.denseFont ? AdaptiveReminderDensity{FONT_B9,34,4,48} : AdaptiveReminderDensity{FONT_B12,42,5,62};
    drawAdaptiveSection(today, comp.todayItems, comp.todayOverflow, left, comp.showHeading, false, "Today", true, &selected);
    drawAdaptiveSection(tomorrow, comp.tomorrowItems, comp.tomorrowOverflow, right, comp.showHeading, false, "Tomorrow", true, &selected);
    return;
  }
  const int overflow = comp.todayOverflow + comp.tomorrowOverflow;
  if (comp.family == REM_SHALLOW_HORIZONTAL) {
    const bool footerFits = inner.w >= 142 + 12 + 42;
    const int footerW = overflow && footerFits ? min(58, max(42, (inner.w * 13) / 100)) : 0;
    const int contentW = max(1, inner.w - footerW - (footerW ? 8 : 0));
    const int count = max(1, comp.todayItems + comp.tomorrowItems), gap = count > 1 ? 12 : 0;
    const AdaptiveReminderDensity density = adaptiveReminderDensity(inner.h, 1);
    int drawn = 0;
    for (int i = 0; i < comp.todayItems; i++, drawn++) {
      int x0 = inner.x + (contentW * drawn) / count + (drawn ? gap / 2 : 0);
      int x1 = inner.x + (contentW * (drawn + 1)) / count - (drawn + 1 < count ? gap / 2 : 0);
      drawAdaptiveItem(g_cache.items[today->itemIdx[i]], {x0, inner.y, x1 - x0, inner.h}, false, density);
    }
    for (int i = 0; i < comp.tomorrowItems; i++, drawn++) {
      int x0 = inner.x + (contentW * drawn) / count + (drawn ? gap / 2 : 0);
      int x1 = inner.x + (contentW * (drawn + 1)) / count - (drawn + 1 < count ? gap / 2 : 0);
      drawAdaptiveItem(g_cache.items[tomorrow->itemIdx[i]], {x0, inner.y, x1 - x0, inner.h}, false, density);
    }
    drawAdaptiveOverflow({inner.x + inner.w - footerW, inner.y, footerW, inner.h}, overflow); return;
  }
  const int footerH = overflow ? 22 : 0, contentH = max(1, inner.h - footerH - (footerH ? 6 : 0));
  const int headingH = comp.showHeading ? 30 : 0;
  const int sectionCount = (comp.todayItems ? 1 : 0) + (comp.tomorrowItems ? 1 : 0);
  const int sectionGap = sectionCount > 1 ? 10 : 0;
  const int totalRows = comp.todayItems + comp.tomorrowItems;
  const int rowsAvailable = max(1, contentH - sectionCount * headingH - sectionGap);
  const AdaptiveReminderDensity density = comp.denseFont ? AdaptiveReminderDensity{FONT_B9,34,4,48}
                                                         : (comp.readabilityScore ? AdaptiveReminderDensity{FONT_B12,42,5,62} : adaptiveReminderDensity(rowsAvailable, totalRows));
  const int sharedRowH = min(density.rowH,
    max(1, (rowsAvailable - max(0, totalRows - sectionCount) * density.rowGap) / totalRows));
  const int todayH = comp.todayItems
    ? headingH + comp.todayItems * sharedRowH + max(0, comp.todayItems - 1) * density.rowGap : 0;
  const int tomorrowH = comp.tomorrowItems
    ? headingH + comp.tomorrowItems * sharedRowH + max(0, comp.tomorrowItems - 1) * density.rowGap : 0;
  const bool stacked = c.w < 230;
  drawAdaptiveSection(today, comp.todayItems, 0, {inner.x, inner.y, inner.w, todayH}, comp.showHeading, stacked, "Today", false, &density);
  drawAdaptiveSection(tomorrow, comp.tomorrowItems, 0, {inner.x, inner.y + todayH + sectionGap, inner.w, tomorrowH}, comp.showHeading, stacked, "Tomorrow", false, &density);
  drawAdaptiveOverflow({inner.x, inner.y + inner.h - footerH, inner.w, footerH}, overflow);
}

void setConfig(const FrameConfig* cfg) {
  g_cfg = cfg;
  (void)g_cfg;
  clearCache();
}

void preload() {
  ensureLoaded();
}

void render(const Cell& c, const String& moduleName) {
  (void)moduleName;

  Serial.println("REM render start");
  logMemoryStats("render_start");
  ensureLoaded();

  ReminderBucket buckets[MAX_BUCKETS];
  int bucketCount = buildBuckets(buckets, MAX_BUCKETS);
  int primaryIdx = findPrimaryBucketIndex(buckets, bucketCount);
  logMemoryStats("after_buckets");

  if (c.size == CELL_ADAPTIVE) {
    renderAdaptiveReminders(c, buckets, bucketCount);
    Serial.println("REM render complete");
    return;
  }

  if (c.size == CELL_SMALL) {
    renderSmall(c, buckets, bucketCount, primaryIdx);
    Serial.println("REM render complete");
    return;
  }

  if (c.size == CELL_MEDIUM) {
    renderMedium(c, buckets, bucketCount, primaryIdx);
    Serial.println("REM render complete");
    return;
  }

  if (c.size == CELL_LARGE) {
    renderLarge(c, buckets, bucketCount, primaryIdx);
    Serial.println("REM render complete");
    return;
  }

  if (c.size == CELL_XL) {
    renderXL(c, buckets, bucketCount, primaryIdx);
    Serial.println("REM render complete");
    return;
  }

  renderMedium(c, buckets, bucketCount, primaryIdx);
  Serial.println("REM render complete");
}

} // namespace ModuleReminders
