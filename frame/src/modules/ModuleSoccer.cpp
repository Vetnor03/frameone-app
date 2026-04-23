// ===============================
// ModuleSoccer.cpp
// FULL REPLACEMENT
// ===============================
#include "ModuleSoccer.h"
#include "DisplayCore.h"
#include "Theme.h"
#include "NetClient.h"
#include "Config.h"

#include <ArduinoJson.h>
#include <math.h>
#include <string.h>
#include <stdio.h>
#include <time.h>

#include "Fonts/FreeSans9ptNO.h"
#include "Fonts/FreeSans12pt7b.h"
#include "Fonts/FreeSansBold12ptNO.h"
#include "Fonts/FreeSansBold18ptNO.h"

#define FONT_B9  (&FreeSans9pt8b)
#define FONT_R12 (&FreeSans12pt7b)
#define FONT_B12 (&FreeSansBold12pt8b)
#define FONT_B18 (&FreeSansBold18pt8b)

static const FrameConfig* g_cfg = nullptr;
static const int MAX_INSTANCES = 4;
static const int MAX_TABLE_ROWS = 24;
static const int DETAIL_LEFT_PAD = 8; // easy to tweak XL bottom-left left padding

static DynamicJsonDocument g_soccerDoc(16384);

struct SoccerInstanceConfig {
  uint8_t id = 1;
  char teamId[40] = {0};
  char teamName[48] = {0};
  char competitionId[24] = {0};
  char competitionName[48] = {0};
  uint32_t refreshMs = 1800000UL; // 30 min
};

struct SoccerTableRow {
  int position = -1;
  char teamShort[8] = {0};
  int points = -1;
  int goalDifference = 0;
  bool hasGoalDifference = false;
  int gap = 0;
  bool hasGap = false;
  bool isSelected = false;
};

struct SoccerCache {
  bool valid = false;
  uint32_t fetchedAtMs = 0;

  char teamName[48] = {0};
  char competitionName[48] = {0};

  bool hasNext = false;
  bool nextHome = true;
  char nextHomeShort[48] = {0};
  char nextAwayShort[48] = {0};
  char nextKickoffIso[32] = {0};
  char nextKickoffPretty[32] = {0};

  bool hasPrev = false;
  bool prevHome = true;
  char prevHomeShort[48] = {0};
  char prevAwayShort[48] = {0};
  int prevGoalsFor = -1;
  int prevGoalsAgainst = -1;
  int prevGoalsHome = -1;
  int prevGoalsAway = -1;

  bool hasStanding = false;
  int position = -1;
  int played = -1;
  int points = -1;
  int won = -1;
  int draw = -1;
  int lost = -1;
  int goalsFor = -1;
  int goalsAgainst = -1;
  int goalDifference = -999;
  int gapAbove = 0;
  int gapBelow = 0;
  bool hasGapAbove = false;
  bool hasGapBelow = false;
  char form[24] = {0};
  char teamAbove[48] = {0};
  char teamBelow[48] = {0};

  int tableCount = 0;
  int selectedTableIndex = -1;
  SoccerTableRow table[MAX_TABLE_ROWS];

  bool hasTopScorer = false;
  char topScorerName[48] = {0};
  int topScorerGoals = -1;

  char lastScorers[80] = {0};
};

static SoccerInstanceConfig g_inst[MAX_INSTANCES];
static SoccerCache g_cache[MAX_INSTANCES];

static uint8_t parseInstanceId(const String& moduleName) {
  int idx = moduleName.indexOf(':');
  if (idx < 0) return 1;
  int id = moduleName.substring(idx + 1).toInt();
  if (id < 1) id = 1;
  if (id > 255) id = 255;
  return (uint8_t)id;
}

static int instIndex(uint8_t id) {
  if (id < 1) id = 1;
  if (id > MAX_INSTANCES) id = MAX_INSTANCES;
  return (int)id - 1;
}

static void measureText(const char* text, const GFXfont* font,
                        int16_t& x1, int16_t& y1, uint16_t& w, uint16_t& h) {
  auto& d = DisplayCore::get();
  d.setFont(font);
  d.setTextSize(1);
  d.getTextBounds(text ? text : "", 0, 0, &x1, &y1, &w, &h);
}

static void drawCenteredBox(int x, int y, int w, int h,
                            const char* text, const GFXfont* font, uint16_t col) {
  auto& d = DisplayCore::get();
  int16_t x1, y1; uint16_t tw, th;
  measureText(text, font, x1, y1, tw, th);

  int cx = x + (w - (int)tw) / 2 - x1;
  int cy = y + (h - (int)th) / 2 - y1;

  d.setFont(font);
  d.setTextColor(col);
  d.setCursor(cx, cy);
  d.print(text ? text : "");
  d.setFont(nullptr);
}

static void drawTextCenteredAt(int cx, int baselineY,
                               const char* txt, const GFXfont* font, uint16_t ink) {
  auto& d = DisplayCore::get();
  int16_t x1, y1; uint16_t tw, th;
  (void)th;
  measureText(txt, font, x1, y1, tw, th);
  d.setFont(font);
  d.setTextColor(ink);
  d.setCursor(cx - (int)tw / 2 - x1, baselineY);
  d.print(txt ? txt : "");
  d.setFont(nullptr);
}

static void drawCenteredTextInRect(int x, int y, int w, int h,
                                   const char* text, const GFXfont* font, uint16_t col) {
  auto& d = DisplayCore::get();
  int16_t x1, y1; uint16_t tw, th;
  measureText(text ? text : "", font, x1, y1, tw, th);
  int baseline = y + (h - (int)th) / 2 - y1;
  int startX = x + (w - (int)tw) / 2 - x1;
  d.setFont(font);
  d.setTextColor(col);
  d.setCursor(startX, baseline);
  d.print(text ? text : "");
  d.setFont(nullptr);
}

static void drawLeftTextInRect(int x, int y, int w, int h,
                               const char* text, const GFXfont* font,
                               uint16_t col, int leftPad = 6) {
  auto& d = DisplayCore::get();
  int16_t x1, y1; uint16_t tw, th;
  (void)w; (void)tw;
  measureText(text ? text : "", font, x1, y1, tw, th);
  int baseline = y + (h - (int)th) / 2 - y1;
  int startX = x + leftPad - x1;
  d.setFont(font);
  d.setTextColor(col);
  d.setCursor(startX, baseline);
  d.print(text ? text : "");
  d.setFont(nullptr);
}

static void fontBoxMetrics(const GFXfont* font, int16_t& y1, uint16_t& h) {
  int16_t x1, _y1; uint16_t w, _h;
  measureText("Ag", font, x1, _y1, w, _h);
  y1 = _y1;
  h  = _h;
}

static void drawDividerAtXShort(int x, int baselineY, const GFXfont* font, uint16_t col) {
  auto& d = DisplayCore::get();

  int16_t y1; uint16_t h;
  fontBoxMetrics(font, y1, h);

  int boxTop = baselineY + (int)y1;
  int boxBot = boxTop + (int)h;
  int mid    = (boxTop + boxBot) / 2;

  int desiredH = (int)lroundf((float)h * 1.05f);
  if (desiredH < 10) desiredH = 10;

  int yTop = mid - desiredH / 2;
  d.drawFastVLine(x, yTop, desiredH, col);
}

static void ensureDefaultsOnce() {
  static bool inited = false;
  if (inited) return;
  inited = true;

  for (int i = 0; i < MAX_INSTANCES; i++) {
    g_inst[i] = SoccerInstanceConfig();
    g_inst[i].id = (uint8_t)(i + 1);
    g_cache[i] = SoccerCache();
  }
}

static SoccerInstanceConfig makeInactiveSoccerInstance(uint8_t id) {
  SoccerInstanceConfig cfg;
  cfg.id = id;
  cfg.teamId[0] = 0;
  cfg.teamName[0] = 0;
  cfg.competitionId[0] = 0;
  cfg.competitionName[0] = 0;
  cfg.refreshMs = 1800000UL;
  return cfg;
}

static bool cfgChanged(const SoccerInstanceConfig& oldCfg,
                       const char* teamId,
                       const char* teamName,
                       const char* competitionId,
                       const char* competitionName,
                       uint32_t refreshMs) {
  if (strcmp(oldCfg.teamId, teamId ? teamId : "") != 0) return true;
  if (strcmp(oldCfg.teamName, teamName ? teamName : "") != 0) return true;
  if (strcmp(oldCfg.competitionId, competitionId ? competitionId : "") != 0) return true;
  if (strcmp(oldCfg.competitionName, competitionName ? competitionName : "") != 0) return true;
  if (oldCfg.refreshMs != refreshMs) return true;
  return false;
}

static void applyConfigFromFrameConfig() {
  if (!g_cfg) return;
  ensureDefaultsOnce();

  static SoccerInstanceConfig oldInst[MAX_INSTANCES];
  for (int i = 0; i < MAX_INSTANCES; i++) {
    oldInst[i] = g_inst[i];
    g_inst[i] = makeInactiveSoccerInstance((uint8_t)(i + 1));
  }

  for (int i = 0; i < (int)g_cfg->soccerCount && i < MAX_INSTANCES; i++) {
    const SoccerModuleConfig& src = g_cfg->soccer[i];
    if (src.id < 1) continue;

    int idx = instIndex(src.id);
    SoccerInstanceConfig& dst = g_inst[idx];
    const SoccerInstanceConfig& oldCfg = oldInst[idx];

    bool changed = cfgChanged(
      oldCfg,
      src.teamId,
      src.teamName,
      src.competitionId,
      src.competitionName,
      src.refreshMs
    );

    dst.id = src.id;
    strlcpy(dst.teamId, src.teamId, sizeof(dst.teamId));
    strlcpy(dst.teamName, src.teamName, sizeof(dst.teamName));
    strlcpy(dst.competitionId, src.competitionId, sizeof(dst.competitionId));
    strlcpy(dst.competitionName, src.competitionName, sizeof(dst.competitionName));
    dst.refreshMs = src.refreshMs ? src.refreshMs : 1800000UL;

    if (changed) {
      g_cache[idx] = SoccerCache();
    }
  }
}

static void copySafe(char* dst, size_t n, const char* src) {
  if (!dst || n == 0) return;
  strlcpy(dst, (src && src[0]) ? src : "", n);
}

static int weekdayFromYMD(int y, int m, int d) {
  static const int t[] = {0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4};
  if (m < 3) y -= 1;
  int wd = (y + y/4 - y/100 + y/400 + t[m - 1] + d) % 7;
  return wd;
}

static const char* weekdayNameFull(int wd) {
  static const char* names[] = {
    "Sunday", "Monday", "Tuesday", "Wednesday",
    "Thursday", "Friday", "Saturday"
  };
  if (wd < 0 || wd > 6) return "--";
  return names[wd];
}

static int64_t daysFromCivil(int y, unsigned m, unsigned d) {
  y -= (m <= 2);
  const int era = (y >= 0 ? y : y - 399) / 400;
  const unsigned yoe = (unsigned)(y - era * 400);
  const unsigned doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return era * 146097 + (int64_t)doe - 719468;
}

static void civilFromDays(int64_t z, int& y, unsigned& m, unsigned& d) {
  z += 719468;
  const int era = (z >= 0 ? z : z - 146096) / 146097;
  const unsigned doe = (unsigned)(z - era * 146097);
  const unsigned yoe = (doe - doe/1460 + doe/36524 - doe/146096) / 365;
  y = (int)yoe + era * 400;
  const unsigned doy = doe - (365 * yoe + yoe/4 - yoe/100);
  const unsigned mp = (5 * doy + 2) / 153;
  d = doy - (153 * mp + 2) / 5 + 1;
  m = mp + (mp < 10 ? 3 : -9);
  y += (m <= 2);
}

static int lastSundayOfMonth(int year, int month) {
  static const int dim[] = {31,28,31,30,31,30,31,31,30,31,30,31};
  int days = dim[month - 1];
  bool leap = ((year % 4 == 0) && (year % 100 != 0)) || (year % 400 == 0);
  if (month == 2 && leap) days = 29;

  int wd = weekdayFromYMD(year, month, days);
  return days - wd;
}

static bool isOsloDstAtUtc(int year, int month, int day, int hourUtc) {
  if (month < 3 || month > 10) return false;
  if (month > 3 && month < 10) return true;

  if (month == 3) {
    int lastSunday = lastSundayOfMonth(year, 3);
    if (day > lastSunday) return true;
    if (day < lastSunday) return false;
    return hourUtc >= 1;
  }

  int lastSunday = lastSundayOfMonth(year, 10);
  if (day < lastSunday) return true;
  if (day > lastSunday) return false;
  return hourUtc < 1;
}

static bool parseIsoUtcParts(const char* iso, int& y, int& mo, int& d, int& hh, int& mi, int& ss) {
  y = mo = d = hh = mi = ss = 0;
  if (!iso || !iso[0]) return false;

  int parsed = sscanf(iso, "%4d-%2d-%2dT%2d:%2d:%2d", &y, &mo, &d, &hh, &mi, &ss);
  if (parsed >= 5) {
    if (parsed == 5) ss = 0;
    return true;
  }

  parsed = sscanf(iso, "%4d-%2d-%2d %2d:%2d:%2d", &y, &mo, &d, &hh, &mi, &ss);
  if (parsed >= 5) {
    if (parsed == 5) ss = 0;
    return true;
  }

  return false;
}

static bool isoUtcToOsloTm(const char* iso, struct tm& outLocal) {
  int y = 0, mo = 0, d = 0, hh = 0, mi = 0, ss = 0;
  if (!parseIsoUtcParts(iso, y, mo, d, hh, mi, ss)) return false;

  int offsetHours = isOsloDstAtUtc(y, mo, d, hh) ? 2 : 1;

  int64_t utcDays = daysFromCivil(y, (unsigned)mo, (unsigned)d);
  int64_t utcEpoch = utcDays * 86400LL + hh * 3600LL + mi * 60LL + ss;
  int64_t localEpoch = utcEpoch + (int64_t)offsetHours * 3600LL;

  int64_t localDays = localEpoch / 86400LL;
  int64_t secsOfDay = localEpoch % 86400LL;
  if (secsOfDay < 0) {
    secsOfDay += 86400LL;
    localDays -= 1;
  }

  int ly = 0;
  unsigned lmo = 0, ld = 0;
  civilFromDays(localDays, ly, lmo, ld);

  memset(&outLocal, 0, sizeof(outLocal));
  outLocal.tm_year = ly - 1900;
  outLocal.tm_mon  = (int)lmo - 1;
  outLocal.tm_mday = (int)ld;
  outLocal.tm_hour = (int)(secsOfDay / 3600LL);
  outLocal.tm_min  = (int)((secsOfDay % 3600LL) / 60LL);
  outLocal.tm_sec  = (int)(secsOfDay % 60LL);
  outLocal.tm_wday = (int)((localDays + 4) % 7);
  if (outLocal.tm_wday < 0) outLocal.tm_wday += 7;
  outLocal.tm_isdst = offsetHours == 2 ? 1 : 0;

  return true;
}

static void formatIsoKickoffPretty(const char* iso, char* out, size_t n) {
  if (!out || n == 0) return;
  out[0] = 0;

  struct tm tmLocal;
  if (!isoUtcToOsloTm(iso, tmLocal)) {
    strlcpy(out, "--", n);
    return;
  }

  snprintf(out, n, "%s %02d:%02d",
           weekdayNameFull(tmLocal.tm_wday),
           tmLocal.tm_hour,
           tmLocal.tm_min);
}

static void splitKickoffDayTime(const char* iso, char* dayOut, size_t dayN, char* timeOut, size_t timeN) {
  if (dayOut && dayN) dayOut[0] = 0;
  if (timeOut && timeN) timeOut[0] = 0;

  struct tm tmLocal;
  if (!isoUtcToOsloTm(iso, tmLocal)) {
    if (dayOut && dayN) strlcpy(dayOut, "--", dayN);
    if (timeOut && timeN) strlcpy(timeOut, "--:--", timeN);
    return;
  }

  if (dayOut && dayN) strlcpy(dayOut, weekdayNameFull(tmLocal.tm_wday), dayN);
  if (timeOut && timeN) snprintf(timeOut, timeN, "%02d:%02d", tmLocal.tm_hour, tmLocal.tm_min);
}

static void toOfficialish3(const char* in, char* out, size_t n) {
  if (!out || n == 0) return;
  out[0] = 0;

  if (!in || !in[0]) {
    strlcpy(out, "---", n);
    return;
  }

  if (strstr(in, "AFC Bournemouth") || strstr(in, "Bournemouth"))         { strlcpy(out, "BOU", n); return; }
  if (strstr(in, "Arsenal"))                                               { strlcpy(out, "ARS", n); return; }
  if (strstr(in, "Aston Villa"))                                           { strlcpy(out, "AVL", n); return; }
  if (strstr(in, "Brentford"))                                             { strlcpy(out, "BRE", n); return; }
  if (strstr(in, "Brighton") || strstr(in, "Brighton & Hove Albion"))      { strlcpy(out, "BHA", n); return; }
  if (strstr(in, "Burnley"))                                               { strlcpy(out, "BUR", n); return; }
  if (strstr(in, "Chelsea"))                                               { strlcpy(out, "CHE", n); return; }
  if (strstr(in, "Crystal Palace"))                                        { strlcpy(out, "CRY", n); return; }
  if (strstr(in, "Everton"))                                               { strlcpy(out, "EVE", n); return; }
  if (strstr(in, "Fulham"))                                                { strlcpy(out, "FUL", n); return; }
  if (strstr(in, "Leeds"))                                                 { strlcpy(out, "LEE", n); return; }
  if (strstr(in, "Liverpool"))                                             { strlcpy(out, "LIV", n); return; }
  if (strstr(in, "Manchester City") || strstr(in, "Man City"))             { strlcpy(out, "MCI", n); return; }
  if (strstr(in, "Manchester United") || strstr(in, "Man Utd") || strstr(in, "Man United")) {
    strlcpy(out, "MUN", n); return;
  }
  if (strstr(in, "Newcastle"))                                             { strlcpy(out, "NEW", n); return; }
  if (strstr(in, "Nottingham Forest"))                                     { strlcpy(out, "NFO", n); return; }
  if (strstr(in, "Sunderland"))                                            { strlcpy(out, "SUN", n); return; }
  if (strstr(in, "Tottenham") || strstr(in, "Tottenham Hotspur"))          { strlcpy(out, "TOT", n); return; }
  if (strstr(in, "West Ham"))                                              { strlcpy(out, "WHU", n); return; }
  if (strstr(in, "Wolverhampton") || strstr(in, "Wolves"))                 { strlcpy(out, "WOL", n); return; }

  if (strcmp(in, "BOU") == 0 || strcmp(in, "ARS") == 0 || strcmp(in, "AVL") == 0 ||
      strcmp(in, "BRE") == 0 || strcmp(in, "BHA") == 0 || strcmp(in, "BUR") == 0 ||
      strcmp(in, "CHE") == 0 || strcmp(in, "CRY") == 0 || strcmp(in, "EVE") == 0 ||
      strcmp(in, "FUL") == 0 || strcmp(in, "LEE") == 0 || strcmp(in, "LIV") == 0 ||
      strcmp(in, "MCI") == 0 || strcmp(in, "MUN") == 0 || strcmp(in, "NEW") == 0 ||
      strcmp(in, "NFO") == 0 || strcmp(in, "SUN") == 0 || strcmp(in, "TOT") == 0 ||
      strcmp(in, "WHU") == 0 || strcmp(in, "WOL") == 0) {
    strlcpy(out, in, n);
    return;
  }

  int j = 0;
  for (int i = 0; in[i] && j < 3; i++) {
    char c = in[i];
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) {
      if (c >= 'a' && c <= 'z') c -= 32;
      out[j++] = c;
    }
  }

  while (j < 3 && j < (int)n - 1) out[j++] = '-';
  out[j] = 0;
}

static void buildSmallKickoffLabel(const SoccerCache& data, char* out, size_t n) {
  if (!out || n == 0) return;
  out[0] = 0;

  if (!data.hasNext) {
    strlcpy(out, "-- --:--", n);
    return;
  }

  struct tm tmKick;
  if (!isoUtcToOsloTm(data.nextKickoffIso, tmKick)) {
    strlcpy(out, "-- --:--", n);
    return;
  }

  char dayTxt[16] = {0};

  time_t now = time(nullptr);
  struct tm tmNow;
  localtime_r(&now, &tmNow);

  if (tmNow.tm_year == tmKick.tm_year &&
      tmNow.tm_mon  == tmKick.tm_mon &&
      tmNow.tm_mday == tmKick.tm_mday) {
    strlcpy(dayTxt, "Today", sizeof(dayTxt));
  } else {
    time_t tomorrowTs = now + 24 * 60 * 60;
    struct tm tmTomorrow;
    localtime_r(&tomorrowTs, &tmTomorrow);

    if (tmTomorrow.tm_year == tmKick.tm_year &&
        tmTomorrow.tm_mon  == tmKick.tm_mon &&
        tmTomorrow.tm_mday == tmKick.tm_mday) {
      strlcpy(dayTxt, "Tomorrow", sizeof(dayTxt));
    } else {
      strlcpy(dayTxt, weekdayNameFull(tmKick.tm_wday), sizeof(dayTxt));
    }
  }

  snprintf(out, n, "%s %02d:%02d", dayTxt, tmKick.tm_hour, tmKick.tm_min);
}

static void buildSmallFixtureLine(const SoccerCache& data, char* out, size_t n) {
  if (!out || n == 0) return;
  out[0] = 0;

  if (!data.hasNext) {
    strlcpy(out, "--- vs ---", n);
    return;
  }

  char home3[8] = {0};
  char away3[8] = {0};
  toOfficialish3(data.nextHomeShort, home3, sizeof(home3));
  toOfficialish3(data.nextAwayShort, away3, sizeof(away3));

  snprintf(out, n, "%s vs %s", home3, away3);
}

static void parseScoreString(const char* score, bool isHome, int& gf, int& ga) {
  gf = -1;
  ga = -1;
  if (!score || !score[0]) return;

  int a = -1, b = -1;
  if (sscanf(score, "%d-%d", &a, &b) == 2) {
    if (isHome) { gf = a; ga = b; }
    else        { gf = b; ga = a; }
  }
}

static void parseScoreHomeAway(const char* score, int& homeGoals, int& awayGoals) {
  homeGoals = -1;
  awayGoals = -1;
  if (!score || !score[0]) return;

  int a = -1, b = -1;
  if (sscanf(score, "%d-%d", &a, &b) == 2) {
    homeGoals = a;
    awayGoals = b;
  }
}

static void parseLastScorers(JsonVariant v, char* out, size_t n) {
  if (!out || n == 0) return;
  out[0] = 0;

  if (v.isNull()) return;

  if (v.is<const char*>()) {
    copySafe(out, n, v.as<const char*>());
    return;
  }

  if (v.is<JsonArray>()) {
    JsonArray arr = v.as<JsonArray>();
    bool first = true;
    for (JsonVariant item : arr) {
      if (item.is<JsonObject>()) {
        const char* name = item["name"] | "";
        if (!name || !name[0]) continue;
        if (!first) strlcat(out, ", ", n);
        strlcat(out, name, n);
        first = false;
      } else {
        const char* s = item.as<const char*>();
        if (!s || !s[0]) continue;
        if (!first) strlcat(out, ", ", n);
        strlcat(out, s, n);
        first = false;
      }
    }
  }
}

static void buildFormString(JsonVariant v, char* out, size_t n) {
  if (!out || n == 0) return;
  out[0] = 0;

  if (v.isNull()) return;

  if (v.is<const char*>()) {
    copySafe(out, n, v.as<const char*>());
    return;
  }

  if (v.is<JsonArray>()) {
    JsonArray arr = v.as<JsonArray>();
    bool first = true;
    for (JsonVariant item : arr) {
      const char* s = item.as<const char*>();
      if (!s || !s[0]) continue;
      if (!first) strlcat(out, " ", n);
      strlcat(out, s, n);
      first = false;
    }
  }
}

static const GFXfont* bestFitFont(const char* txt, int maxW,
                                  const GFXfont* primary,
                                  const GFXfont* fallback) {
  int16_t x1, y1; uint16_t w, h;
  measureText(txt, primary, x1, y1, w, h);
  if ((int)w <= maxW) return primary;
  return fallback;
}

static void drawCenteredBestFit(int x, int y, int w, int h,
                                const char* text,
                                const GFXfont* primary,
                                const GFXfont* fallback,
                                uint16_t col) {
  const GFXfont* f = bestFitFont(text, w - 4, primary, fallback);
  drawCenteredBox(x, y, w, h, text, f, col);
}

static void drawLeftBestFit(int x, int y, int w, int h,
                            const char* text,
                            const GFXfont* primary,
                            const GFXfont* fallback,
                            uint16_t col,
                            int leftPad = 6) {
  const GFXfont* f = bestFitFont(text, w - leftPad - 2, primary, fallback);
  drawLeftTextInRect(x, y, w, h, text, f, col, leftPad);
}

static void drawHDivider90(int x, int y, int w, uint16_t col) {
  auto& d = DisplayCore::get();
  int lineW = (int)lroundf((float)w * 0.90f);
  if (lineW < 12) lineW = w;
  int lx = x + (w - lineW) / 2;
  d.drawFastHLine(lx, y, lineW, col);
}

static int findSelectedTableIndex(const SoccerCache& data) {
  if (data.selectedTableIndex >= 0 && data.selectedTableIndex < data.tableCount) {
    return data.selectedTableIndex;
  }
  for (int i = 0; i < data.tableCount; i++) {
    if (data.table[i].isSelected) return i;
  }
  return -1;
}

static void getTableWindow(const SoccerCache& data, int rowsWanted, int& startIdx, int& count) {
  startIdx = 0;
  count = 0;
  if (data.tableCount <= 0 || rowsWanted <= 0) return;

  count = data.tableCount < rowsWanted ? data.tableCount : rowsWanted;
  int sel = findSelectedTableIndex(data);

  if (sel < 0) {
    startIdx = 0;
    return;
  }

  int half = count / 2;
  startIdx = sel - half;
  if (startIdx < 0) startIdx = 0;
  if (startIdx + count > data.tableCount) startIdx = data.tableCount - count;
  if (startIdx < 0) startIdx = 0;
}

static bool fetchFrameData(const SoccerInstanceConfig& cfg, SoccerCache& out) {
  if (!cfg.teamId[0]) return false;

  String url = String(BASE_URL) + "/api/soccer/frame?teamId=" + String(cfg.teamId);
  if (cfg.competitionId[0]) url += "&competitionId=" + String(cfg.competitionId);

  int httpCode = 0;
  String body;
  bool ok = NetClient::httpGet(url, httpCode, body);
  if (!ok || httpCode != 200) {
    Serial.printf("[soccer] GET failed ok=%d http=%d\n", ok ? 1 : 0, httpCode);
    if (body.length() > 0) {
      Serial.printf("[soccer] body=%s\n", body.c_str());
    }
    return false;
  }

  Serial.printf("[soccer] body len=%d\n", body.length());

  g_soccerDoc.clear();
  DeserializationError err = deserializeJson(g_soccerDoc, body);
  if (err) {
    Serial.printf("[soccer] json err: %s\n", err.c_str());
    return false;
  }

  copySafe(out.teamName, sizeof(out.teamName),
           g_soccerDoc["teamName"] | g_soccerDoc["teamKey"] | cfg.teamName);
  copySafe(out.competitionName, sizeof(out.competitionName),
           g_soccerDoc["competitionName"] | g_soccerDoc["domesticCompetitionCode"] | cfg.competitionName);

  JsonObject nextMatch = g_soccerDoc["next"];
  out.hasNext = !nextMatch.isNull();
  if (out.hasNext) {
    out.nextHome = nextMatch["isHome"] | true;
    copySafe(out.nextHomeShort, sizeof(out.nextHomeShort), nextMatch["homeShort"] | nextMatch["home"] | "--");
    copySafe(out.nextAwayShort, sizeof(out.nextAwayShort), nextMatch["awayShort"] | nextMatch["away"] | "--");
    copySafe(out.nextKickoffIso, sizeof(out.nextKickoffIso), nextMatch["utc"] | "");
    formatIsoKickoffPretty(out.nextKickoffIso, out.nextKickoffPretty, sizeof(out.nextKickoffPretty));
  } else {
    out.nextHomeShort[0] = 0;
    out.nextAwayShort[0] = 0;
    out.nextKickoffIso[0] = 0;
    out.nextKickoffPretty[0] = 0;
    out.nextHome = true;
  }

  JsonObject prevMatch = g_soccerDoc["last"];
  out.hasPrev = !prevMatch.isNull();
  if (out.hasPrev) {
    out.prevHome = prevMatch["isHome"] | true;
    copySafe(out.prevHomeShort, sizeof(out.prevHomeShort), prevMatch["homeShort"] | prevMatch["home"] | "--");
    copySafe(out.prevAwayShort, sizeof(out.prevAwayShort), prevMatch["awayShort"] | prevMatch["away"] | "--");
    parseScoreString(prevMatch["score"] | "", out.prevHome, out.prevGoalsFor, out.prevGoalsAgainst);
    parseScoreHomeAway(prevMatch["score"] | "", out.prevGoalsHome, out.prevGoalsAway);
  } else {
    out.prevHomeShort[0] = 0;
    out.prevAwayShort[0] = 0;
    out.prevHome = true;
    out.prevGoalsFor = -1;
    out.prevGoalsAgainst = -1;
    out.prevGoalsHome = -1;
    out.prevGoalsAway = -1;
  }

  JsonObject standing = g_soccerDoc["standing"];
  out.hasStanding = !standing.isNull();
  if (out.hasStanding) {
    out.position = standing["position"] | -1;
    out.played   = standing["playedGames"] | standing["played"] | -1;
    out.points   = standing["points"] | -1;
    out.won      = standing["won"] | -1;
    out.draw     = standing["draw"] | -1;
    out.lost     = standing["lost"] | -1;
    out.goalsFor = standing["goalsFor"] | -1;
    out.goalsAgainst = standing["goalsAgainst"] | -1;
    out.goalDifference = standing["goalDifference"] | -999;

    out.hasGapAbove = !standing["gapAbove"].isNull();
    out.hasGapBelow = !standing["gapBelow"].isNull();
    out.gapAbove = standing["gapAbove"] | 0;
    out.gapBelow = standing["gapBelow"] | 0;

    copySafe(out.teamAbove, sizeof(out.teamAbove), standing["teamAbove"] | "");
    copySafe(out.teamBelow, sizeof(out.teamBelow), standing["teamBelow"] | "");
    buildFormString(standing["form"], out.form, sizeof(out.form));
  } else {
    out.position = -1;
    out.played = -1;
    out.points = -1;
    out.won = -1;
    out.draw = -1;
    out.lost = -1;
    out.goalsFor = -1;
    out.goalsAgainst = -1;
    out.goalDifference = -999;
    out.hasGapAbove = false;
    out.hasGapBelow = false;
    out.gapAbove = 0;
    out.gapBelow = 0;
    out.form[0] = 0;
    out.teamAbove[0] = 0;
    out.teamBelow[0] = 0;
  }

  out.tableCount = 0;
  out.selectedTableIndex = -1;
  JsonArray tbl = g_soccerDoc["table"].as<JsonArray>();
  if (!tbl.isNull()) {
    for (JsonVariant row : tbl) {
      if (out.tableCount >= MAX_TABLE_ROWS) break;
      SoccerTableRow& r = out.table[out.tableCount];
      r = SoccerTableRow();
      r.position = row["position"] | -1;
      copySafe(r.teamShort, sizeof(r.teamShort), row["teamShort"] | "--");
      r.points = row["points"] | -1;
      r.hasGoalDifference = !row["goalDifference"].isNull();
      r.goalDifference = row["goalDifference"] | 0;
      r.hasGap = !row["gap"].isNull();
      r.gap = row["gap"] | 0;
      r.isSelected = row["isSelected"] | false;
      if (r.isSelected) out.selectedTableIndex = out.tableCount;
      out.tableCount++;
    }
  }

  JsonObject topScorer = g_soccerDoc["topScorer"];
  out.hasTopScorer = !topScorer.isNull();
  if (out.hasTopScorer) {
    copySafe(out.topScorerName, sizeof(out.topScorerName), topScorer["name"] | "--");
    out.topScorerGoals = topScorer["goals"] | -1;
  } else {
    out.topScorerName[0] = 0;
    out.topScorerGoals = -1;
  }

  parseLastScorers(g_soccerDoc["lastScorers"], out.lastScorers, sizeof(out.lastScorers));
  return true;
}

static void tick(int idx) {
  SoccerInstanceConfig& cfg = g_inst[idx];
  SoccerCache& cache = g_cache[idx];

  if (!cfg.teamId[0]) return;

  uint32_t now = millis();
  bool needs = (!cache.valid) || ((now - cache.fetchedAtMs) > cfg.refreshMs);
  if (!needs) return;

  SoccerCache fresh = cache;
  if (fetchFrameData(cfg, fresh)) {
    fresh.valid = true;
    fresh.fetchedAtMs = now;
    cache = fresh;
  }
}

static const char* safeTeamTitle(const SoccerInstanceConfig& cfg, const SoccerCache& data) {
  if (cfg.teamName[0]) return cfg.teamName;
  if (data.teamName[0]) return data.teamName;
  return "Team";
}

static void drawTripleStatSmall(const Cell& c,
                                const SoccerCache& data,
                                uint16_t ink,
                                int baseline) {
  int secW = c.w / 3;
  int x0 = c.x;
  int x1 = c.x + secW;
  int x2 = c.x + secW * 2;
  int x3 = c.x + c.w;

  int cxL = (x0 + x1) / 2;
  int cxM = (x1 + x2) / 2;
  int cxR = (x2 + x3) / 2;

  char leftTxt[32]  = "-- --:--";
  char midTxt[24]   = "Position: --";
  char rightTxt[24] = "Points: --";

  buildSmallKickoffLabel(data, leftTxt, sizeof(leftTxt));

  if (data.hasStanding && data.position > 0) snprintf(midTxt, sizeof(midTxt), "Position: %d", data.position);
  if (data.hasStanding && data.points >= 0) snprintf(rightTxt, sizeof(rightTxt), "Points: %d", data.points);

  drawTextCenteredAt(cxL, baseline, leftTxt, FONT_B9, ink);
  drawTextCenteredAt(cxM, baseline, midTxt, FONT_B9, ink);
  drawTextCenteredAt(cxR, baseline, rightTxt, FONT_B9, ink);

  if (c.w > 90) {
    drawDividerAtXShort(x1, baseline, FONT_B9, ink);
    drawDividerAtXShort(x2, baseline, FONT_B9, ink);
  }
}

static void renderSmall(const Cell& c,
                        const SoccerInstanceConfig& cfg,
                        const SoccerCache& data) {
  uint16_t ink = Theme::ink();

  if (!data.valid) {
    drawCenteredBox(c.x, c.y, c.w, c.h, "Soccer", FONT_B12, ink);
    return;
  }

  char fixture[32] = {0};
  buildSmallFixtureLine(data, fixture, sizeof(fixture));
  if (!data.hasNext) strlcpy(fixture, safeTeamTitle(cfg, data), sizeof(fixture));

  int16_t y1a, y1b;
  uint16_t hA, hB;
  fontBoxMetrics(FONT_B12, y1a, hA);
  fontBoxMetrics(FONT_B9,  y1b, hB);

  int gap = 18;
  int totalH = hA + gap + hB;
  int top = c.y + (c.h - totalH) / 2;

  int baseline1 = top - y1a;
  int baseline2 = top + hA + gap - y1b;

  drawTextCenteredAt(c.x + c.w / 2, baseline1, fixture, FONT_B12, ink);
  drawTripleStatSmall(c, data, ink, baseline2);
}

static void drawEvenSpacedTextPieces(int x, int y, int w, int rowH,
                                     const char* a, const char* b,
                                     const GFXfont* font, uint16_t ink) {
  char line[64];
  snprintf(line, sizeof(line), "%s %s",
           (a && a[0]) ? a : "--",
           (b && b[0]) ? b : "--");
  drawCenteredBox(x, y, w, rowH, line, font, ink);
}

static void drawEvenSpacedThreePartLine(int x, int y, int w, int rowH,
                                        const char* left,
                                        const char* mid,
                                        const char* right,
                                        const GFXfont* font, uint16_t ink) {
  auto& d = DisplayCore::get();
  const char* a = (left  && left[0])  ? left  : "--";
  const char* b = (mid   && mid[0])   ? mid   : "--";
  const char* c = (right && right[0]) ? right : "--";

  int16_t x1a, y1a, x1b, y1b, x1c, y1c;
  uint16_t wa, ha, wb, hb, wc, hc;
  measureText(a, font, x1a, y1a, wa, ha);
  measureText(b, font, x1b, y1b, wb, hb);
  measureText(c, font, x1c, y1c, wc, hc);

  uint16_t fh = ha;
  int16_t fy1 = y1a;
  if (hb > fh) { fh = hb; fy1 = y1b; }
  if (hc > fh) { fh = hc; fy1 = y1c; }

  int baseline = y + (rowH - (int)fh) / 2 - fy1;

  int cx1 = x + (w * 10) / 32;
  int cx2 = x + (w * 16) / 32;
  int cx3 = x + (w * 22) / 32;

  d.setFont(font);
  d.setTextColor(ink);
  d.setCursor(cx1 - (int)wa / 2 - x1a, baseline); d.print(a);
  d.setCursor(cx2 - (int)wb / 2 - x1b, baseline); d.print(b);
  d.setCursor(cx3 - (int)wc / 2 - x1c, baseline); d.print(c);
  d.setFont(nullptr);
}

static void drawMediumStatRow(int x, int y, int w, int rowH,
                              const SoccerCache& data,
                              uint16_t ink) {
  auto& d = DisplayCore::get();

  char leftTxt[28];
  char rightTxt[28];

  if (data.hasStanding && data.position > 0) snprintf(leftTxt, sizeof(leftTxt), "Position: %d", data.position);
  else snprintf(leftTxt, sizeof(leftTxt), "Position: --");

  if (data.hasStanding && data.points >= 0) snprintf(rightTxt, sizeof(rightTxt), "Points: %d", data.points);
  else snprintf(rightTxt, sizeof(rightTxt), "Points: --");

  int16_t x1l, y1l, x1r, y1r;
  uint16_t wl, hl, wr, hr;
  measureText(leftTxt, FONT_B9, x1l, y1l, wl, hl);
  measureText(rightTxt, FONT_B9, x1r, y1r, wr, hr);

  uint16_t fh = hl > hr ? hl : hr;
  int16_t fy1 = (hl >= hr) ? y1l : y1r;
  int baseline = y + (rowH - (int)fh) / 2 - fy1;

  int dividerX = x + w / 2;
  const int gapFromDivider = 26;

  int leftRightEdge = dividerX - gapFromDivider;
  int rightLeftEdge = dividerX + gapFromDivider;

  int leftX  = leftRightEdge - (int)wl - x1l;
  int rightX = rightLeftEdge - x1r;

  d.setFont(FONT_B9);
  d.setTextColor(ink);
  d.setCursor(leftX, baseline);
  d.print(leftTxt);
  d.setCursor(rightX, baseline);
  d.print(rightTxt);
  d.setFont(nullptr);

  drawDividerAtXShort(dividerX, baseline, FONT_B9, ink);
}

static void drawMediumPanel(int x, int y, int w, int h,
                            const SoccerInstanceConfig& cfg,
                            const SoccerCache& data,
                            uint16_t ink) {
  (void)cfg;

  const int rows = 7;
  if (h < rows * 10) {
    drawCenteredBox(x, y, w, h, "Soccer", FONT_B12, ink);
    return;
  }

  const int vPad = 15;
  int innerY = y + vPad;
  int innerH = h - (vPad * 2);
  if (innerH < rows * 8) {
    innerY = y + 3;
    innerH = h - 6;
  }

  int lineY[rows + 1];
  for (int i = 0; i <= rows; i++) {
    lineY[i] = innerY + (int)lroundf((float)innerH * ((float)i / (float)rows));
  }

  char nextDay[20] = "--";
  char nextTime[16] = "--:--";
  char nextHome3[8] = "---";
  char nextAway3[8] = "---";

  char prevHome3[8] = "---";
  char prevAway3[8] = "---";
  char prevHomeGoals[8] = "--";
  char prevAwayGoals[8] = "--";

  if (data.hasNext) {
    splitKickoffDayTime(data.nextKickoffIso, nextDay, sizeof(nextDay), nextTime, sizeof(nextTime));
    toOfficialish3(data.nextHomeShort, nextHome3, sizeof(nextHome3));
    toOfficialish3(data.nextAwayShort, nextAway3, sizeof(nextAway3));
  }

  if (data.hasPrev) {
    toOfficialish3(data.prevHomeShort, prevHome3, sizeof(prevHome3));
    toOfficialish3(data.prevAwayShort, prevAway3, sizeof(prevAway3));
    if (data.prevGoalsHome >= 0) snprintf(prevHomeGoals, sizeof(prevHomeGoals), "%d", data.prevGoalsHome);
    if (data.prevGoalsAway >= 0) snprintf(prevAwayGoals, sizeof(prevAwayGoals), "%d", data.prevGoalsAway);
  }

  drawEvenSpacedTextPieces(x, lineY[0], w, lineY[1] - lineY[0],
                           nextDay, nextTime, FONT_B9, ink);

  drawEvenSpacedThreePartLine(x, lineY[1], w, lineY[2] - lineY[1],
                              nextHome3, "vs", nextAway3, FONT_B12, ink);

  drawMediumStatRow(x, lineY[2], w, lineY[3] - lineY[2], data, ink);

  drawHDivider90(x, (lineY[3] + lineY[4]) / 2, w, ink);

  drawCenteredBox(x, lineY[4], w, lineY[5] - lineY[4], "Last", FONT_B9, ink);

  drawEvenSpacedThreePartLine(x, lineY[5], w, lineY[6] - lineY[5],
                              prevHome3, "vs", prevAway3, FONT_B9, ink);

  drawEvenSpacedThreePartLine(x, lineY[6], w, lineY[7] - lineY[6],
                              prevHomeGoals, "-", prevAwayGoals, FONT_B9, ink);
}

static void renderMedium(const Cell& c,
                         const SoccerInstanceConfig& cfg,
                         const SoccerCache& data) {
  uint16_t ink = Theme::ink();

  if (!data.valid) {
    drawCenteredBox(c.x, c.y, c.w, c.h, "Soccer", FONT_B12, ink);
    return;
  }

  drawMediumPanel(c.x, c.y, c.w, c.h, cfg, data, ink);
}

static void drawStandingsTable(int x, int y, int w, int h,
                               const SoccerCache& data,
                               int rowsWanted,
                               uint16_t ink) {
  if (data.tableCount <= 0 || h < 24 || w < 80) {
    drawCenteredBox(x, y, w, h, "No table", FONT_B9, ink);
    return;
  }

  int startIdx = 0, count = 0;
  getTableWindow(data, rowsWanted, startIdx, count);
  if (count <= 0) {
    drawCenteredBox(x, y, w, h, "No table", FONT_B9, ink);
    return;
  }

  int bands = count + 1; // header + visible rows
  if (bands < 2) bands = 2;
  if (bands > MAX_TABLE_ROWS + 1) bands = MAX_TABLE_ROWS + 1;

  const int vPad = 8;
  int innerY = y + vPad;
  int innerH = h - (vPad * 2);
  if (innerH < bands * 8) {
    innerY = y + 2;
    innerH = h - 4;
  }

  int lineY[MAX_TABLE_ROWS + 2];
  for (int i = 0; i <= bands; i++) {
    lineY[i] = innerY + (int)lroundf((float)innerH * ((float)i / (float)bands));
  }

  const int colGap = 3;
  int colW = (w - (colGap * 4)) / 5;
  if (colW < 10) colW = 10;

  int rem = w - (colW * 5 + colGap * 4);

  int c1x = x;
  int c2x = c1x + colW + colGap;
  int c3x = c2x + colW + colGap;
  int c4x = c3x + colW + colGap;
  int c5x = c4x + colW + colGap;

  int c1w = colW;
  int c2w = colW;
  int c3w = colW;
  int c4w = colW;
  int c5w = colW + rem;

  int headerY = lineY[0];
  int headerH = lineY[1] - lineY[0];

  drawCenteredTextInRect(c1x, headerY, c1w, headerH, "P",    FONT_B9, ink);
  drawCenteredTextInRect(c2x, headerY, c2w, headerH, "Team", FONT_B9, ink);
  drawCenteredTextInRect(c3x, headerY, c3w, headerH, "Pts",  FONT_B9, ink);
  drawCenteredTextInRect(c4x, headerY, c4w, headerH, "Gap",  FONT_B9, ink);
  drawCenteredTextInRect(c5x, headerY, c5w, headerH, "GD",   FONT_B9, ink);

  for (int i = 0; i < count; i++) {
    const SoccerTableRow& r = data.table[startIdx + i];

    int rowY = lineY[i + 1];
    int rowH = lineY[i + 2] - lineY[i + 1];

    if (r.isSelected) {
      auto& d = DisplayCore::get();
      int lineW = (int)lroundf((float)w * 0.92f);
      int lx = x + (w - lineW) / 2;
      d.drawFastHLine(lx, rowY, lineW, ink);
      d.drawFastHLine(lx, rowY + rowH - 1, lineW, ink);
    }

    char posTxt[8] = "--";
    char ptsTxt[8] = "--";
    char gdTxt[10] = "--";
    char gapTxt[10] = "--";

    if (r.position > 0) snprintf(posTxt, sizeof(posTxt), "%d", r.position);
    if (r.points >= 0) snprintf(ptsTxt, sizeof(ptsTxt), "%d", r.points);

    if (r.hasGoalDifference) {
      snprintf(gdTxt, sizeof(gdTxt), "%+d", r.goalDifference);
    }

    if (r.isSelected) {
      gapTxt[0] = 0;
    } else if (r.hasGap) {
      if (r.gap > 0) snprintf(gapTxt, sizeof(gapTxt), "+%d", r.gap);
      else snprintf(gapTxt, sizeof(gapTxt), "%d", r.gap);
    } else {
      gapTxt[0] = 0;
    }

    drawCenteredTextInRect(c1x, rowY, c1w, rowH, posTxt, FONT_B9, ink);
    drawCenteredTextInRect(c2x, rowY, c2w, rowH, r.teamShort[0] ? r.teamShort : "--", FONT_B9, ink);
    drawCenteredTextInRect(c3x, rowY, c3w, rowH, ptsTxt, FONT_B9, ink);
    drawCenteredTextInRect(c4x, rowY, c4w, rowH, gapTxt, FONT_B9, ink);
    drawCenteredTextInRect(c5x, rowY, c5w, rowH, gdTxt, FONT_B9, ink);
  }
}

static void renderLarge(const Cell& c,
                        const SoccerInstanceConfig& cfg,
                        const SoccerCache& data) {
  uint16_t ink = Theme::ink();

  if (!data.valid) {
    drawCenteredBox(c.x, c.y, c.w, c.h, "Soccer", FONT_B12, ink);
    return;
  }

  int gap = 12;
  int leftW = (c.w * 49) / 100;
  int rightW = c.w - leftW - gap;
  if (rightW < 70) rightW = c.w - leftW - 6;

  int leftX = c.x;
  int rightX = leftX + leftW + gap;

  drawMediumPanel(leftX, c.y, leftW, c.h, cfg, data, ink);
  drawStandingsTable(rightX, c.y, rightW, c.h, data, 6, ink);
}

static void drawDetailBlock(int x, int y, int w, int h,
                            const SoccerInstanceConfig& cfg,
                            const SoccerCache& data,
                            uint16_t ink) {
  if (h < 40) return;

  char title[64] = {0};
  char l1[96] = {0};
  char l2[96] = {0};
  char l3[96] = {0};
  char l4[96] = {0};

  copySafe(title, sizeof(title), safeTeamTitle(cfg, data));

  if (data.competitionName[0]) strlcpy(l1, data.competitionName, sizeof(l1));
  else strlcpy(l1, "--", sizeof(l1));

  if (data.hasTopScorer) snprintf(l2, sizeof(l2), "Top scorer: %s (%d)", data.topScorerName, data.topScorerGoals);
  else strlcpy(l2, "Top scorer: --", sizeof(l2));

  if (data.hasStanding && data.won >= 0 && data.draw >= 0 && data.lost >= 0) {
    snprintf(l3, sizeof(l3), "Record: %dW %dD %dL", data.won, data.draw, data.lost);
  } else {
    strlcpy(l3, "Record: --", sizeof(l3));
  }

  if (data.hasStanding && data.goalsFor >= 0 && data.goalsAgainst >= 0) {
    if (data.goalDifference != -999) {
      snprintf(l4, sizeof(l4), "Goals: %d-%d  GD %+d", data.goalsFor, data.goalsAgainst, data.goalDifference);
    } else {
      snprintf(l4, sizeof(l4), "Goals: %d-%d", data.goalsFor, data.goalsAgainst);
    }
  } else if (data.form[0]) {
    snprintf(l4, sizeof(l4), "Form: %s", data.form);
  } else {
    strlcpy(l4, "Form: --", sizeof(l4));
  }

  const int rowGap = 6;

  int16_t y1t, y1b9;
  uint16_t hT, hB9;
  fontBoxMetrics(FONT_B12, y1t, hT);
  fontBoxMetrics(FONT_B9,  y1b9, hB9);

  int lineHTitle = (int)hT + 2;
  int lineHBody  = (int)hB9 + 2;

  int totalH = lineHTitle + rowGap + lineHBody + rowGap + lineHBody + rowGap + lineHBody + rowGap + lineHBody;
  if (totalH > h) {
    lineHTitle = (int)hT;
    lineHBody  = (int)hB9;
    totalH = lineHTitle + rowGap + lineHBody + rowGap + lineHBody + rowGap + lineHBody + rowGap + lineHBody;
  }

  int top = y + (h - totalH) / 2;
  if (top < y) top = y;

  int r1y = top;
  int r2y = r1y + lineHTitle + rowGap;
  int r3y = r2y + lineHBody  + rowGap;
  int r4y = r3y + lineHBody  + rowGap;
  int r5y = r4y + lineHBody  + rowGap;

  drawCenteredBestFit(x, r1y, w, lineHTitle, title, FONT_B12, FONT_B9, ink);
  drawCenteredBestFit(x, r2y, w, lineHBody,  l1,    FONT_B9,  FONT_B9, ink);
  drawCenteredBestFit(x, r3y, w, lineHBody,  l2,    FONT_B9,  FONT_B9, ink);
  drawCenteredBestFit(x, r4y, w, lineHBody,  l3,    FONT_B9,  FONT_B9, ink);
  drawCenteredBestFit(x, r5y, w, lineHBody,  l4,    FONT_B9,  FONT_B9, ink);
}

static void drawXLUnifiedLeft(int x, int y, int w, int h,
                              const SoccerInstanceConfig& cfg,
                              const SoccerCache& data,
                              uint16_t ink) {
  auto& d = DisplayCore::get();

  if (h < 120 || w < 120) {
    drawMediumPanel(x, y, w, h, cfg, data, ink);
    return;
  }

  const char* title = safeTeamTitle(cfg, data);

  char nextDay[20] = "--";
  char nextTime[16] = "--:--";
  char nextHome3[8] = "---";
  char nextAway3[8] = "---";

  char prevHome3[8] = "---";
  char prevAway3[8] = "---";
  char prevHomeGoals[8] = "--";
  char prevAwayGoals[8] = "--";

  if (data.hasNext) {
    splitKickoffDayTime(data.nextKickoffIso, nextDay, sizeof(nextDay), nextTime, sizeof(nextTime));
    toOfficialish3(data.nextHomeShort, nextHome3, sizeof(nextHome3));
    toOfficialish3(data.nextAwayShort, nextAway3, sizeof(nextAway3));
  }

  if (data.hasPrev) {
    toOfficialish3(data.prevHomeShort, prevHome3, sizeof(prevHome3));
    toOfficialish3(data.prevAwayShort, prevAway3, sizeof(prevAway3));
    if (data.prevGoalsHome >= 0) snprintf(prevHomeGoals, sizeof(prevHomeGoals), "%d", data.prevGoalsHome);
    if (data.prevGoalsAway >= 0) snprintf(prevAwayGoals, sizeof(prevAwayGoals), "%d", data.prevGoalsAway);
  }

  char leagueLine[64] = {0};
  if (data.competitionName[0]) strlcpy(leagueLine, data.competitionName, sizeof(leagueLine));
  else strlcpy(leagueLine, "Premier League", sizeof(leagueLine));

  char scorerLine[96] = {0};
  if (data.hasTopScorer) snprintf(scorerLine, sizeof(scorerLine), "Top scorer: %s (%d)", data.topScorerName, data.topScorerGoals);
  else strlcpy(scorerLine, "Top scorer: --", sizeof(scorerLine));

  char recordLine[96] = {0};
  if (data.hasStanding && data.won >= 0 && data.draw >= 0 && data.lost >= 0) {
    snprintf(recordLine, sizeof(recordLine), "Record: %dW %dD %dL", data.won, data.draw, data.lost);
  } else {
    strlcpy(recordLine, "Record: --", sizeof(recordLine));
  }

  char goalsLine[96] = {0};
  if (data.hasStanding && data.goalsFor >= 0 && data.goalsAgainst >= 0) {
    if (data.goalDifference != -999) {
      snprintf(goalsLine, sizeof(goalsLine), "Goals: %d-%d  GD %+d", data.goalsFor, data.goalsAgainst, data.goalDifference);
    } else {
      snprintf(goalsLine, sizeof(goalsLine), "Goals: %d-%d", data.goalsFor, data.goalsAgainst);
    }
  } else if (data.form[0]) {
    snprintf(goalsLine, sizeof(goalsLine), "Form: %s", data.form);
  } else {
    strlcpy(goalsLine, "Goals: --", sizeof(goalsLine));
  }

  int16_t y1B12, y1B9;
  uint16_t hB12, hB9;
  fontBoxMetrics(FONT_B12, y1B12, hB12);
  fontBoxMetrics(FONT_B9,  y1B9,  hB9);

  const int outerPad = 14;
  const int groupGap = 12;
  const int titleH = (int)hB12 + 4;

  const int midRows = 7;
  int midRowH = (int)hB9 + 4;
  int midContentH = midRowH * midRows;

  const int botRows = 4;
  int botRowH = (int)hB9 + 4;
  int botContentH = botRowH * botRows;

  int freeH = h - (outerPad * 2) - titleH - midContentH - botContentH - (groupGap * 2);
  if (freeH < 0) freeH = 0;

  int titleExtraTop = freeH / 4;
  int betweenTitleAndMid = freeH / 4;
  int betweenMidAndBot = freeH / 4;
  int bottomExtra = freeH - titleExtraTop - betweenTitleAndMid - betweenMidAndBot;

  int topY = y + outerPad + titleExtraTop;
  int midY = topY + titleH + groupGap + betweenTitleAndMid;
  int botY = midY + midContentH + groupGap + betweenMidAndBot;

  drawCenteredBestFit(x, topY, w, titleH, title, FONT_B12, FONT_B9, ink);

  int rowY = midY;
  drawEvenSpacedTextPieces(x, rowY, w, midRowH, nextDay, nextTime, FONT_B9, ink);
  rowY += midRowH;

  drawEvenSpacedThreePartLine(x, rowY, w, midRowH, nextHome3, "vs", nextAway3, FONT_B12, ink);
  rowY += midRowH;

  drawMediumStatRow(x, rowY, w, midRowH, data, ink);
  rowY += midRowH;

  drawHDivider90(x, rowY + midRowH / 2, w, ink);
  rowY += midRowH;

  drawCenteredBox(x, rowY, w, midRowH, "Last", FONT_B9, ink);
  rowY += midRowH;

  drawEvenSpacedThreePartLine(x, rowY, w, midRowH, prevHome3, "vs", prevAway3, FONT_B9, ink);
  rowY += midRowH;

  drawEvenSpacedThreePartLine(x, rowY, w, midRowH, prevHomeGoals, "-", prevAwayGoals, FONT_B9, ink);

  int detailRowY = botY;
  drawCenteredBestFit(x, detailRowY, w, botRowH, leagueLine, FONT_B9, FONT_B9, ink);
  detailRowY += botRowH;
  drawCenteredBestFit(x, detailRowY, w, botRowH, scorerLine, FONT_B9, FONT_B9, ink);
  detailRowY += botRowH;
  drawCenteredBestFit(x, detailRowY, w, botRowH, recordLine, FONT_B9, FONT_B9, ink);
  detailRowY += botRowH;
  drawCenteredBestFit(x, detailRowY, w, botRowH, goalsLine, FONT_B9, FONT_B9, ink);

  (void)d;
  (void)bottomExtra;
}

static void renderXL(const Cell& c,
                     const SoccerInstanceConfig& cfg,
                     const SoccerCache& data) {
  uint16_t ink = Theme::ink();

  if (!data.valid) {
    drawCenteredBox(c.x, c.y, c.w, c.h, "Soccer", FONT_B12, ink);
    return;
  }

  int gap = 10;
  int leftW = (c.w * 49) / 100;
  int rightW = c.w - leftW - gap;
  int leftX = c.x;
  int rightX = leftX + leftW + gap;

  drawXLUnifiedLeft(leftX, c.y, leftW, c.h, cfg, data, ink);
  drawStandingsTable(rightX, c.y, rightW, c.h, data, 12, ink);
}

namespace ModuleSoccer {

void setConfig(const FrameConfig* cfg) {
  g_cfg = cfg;
  ensureDefaultsOnce();
  applyConfigFromFrameConfig();
}

void render(const Cell& c, const String& moduleName) {
  ensureDefaultsOnce();

  uint8_t id = parseInstanceId(moduleName);
  int idx = instIndex(id);

  tick(idx);

  const SoccerInstanceConfig& cfg = g_inst[idx];
  const SoccerCache& data = g_cache[idx];

  if (!cfg.teamId[0]) {
    drawCenteredBox(c.x, c.y, c.w, c.h, "Set team", FONT_B12, Theme::ink());
    return;
  }

  if (c.size == CELL_SMALL)       renderSmall(c, cfg, data);
  else if (c.size == CELL_MEDIUM) renderMedium(c, cfg, data);
  else if (c.size == CELL_LARGE)  renderLarge(c, cfg, data);
  else if (c.size == CELL_XL)     renderXL(c, cfg, data);
  else                            renderMedium(c, cfg, data);
}

} // namespace ModuleSoccer