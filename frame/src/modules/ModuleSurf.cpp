// ===============================
// ModuleSurf.cpp (FULL FILE - copy/paste)
// ===============================
#include "ModuleSurf.h"
#include "DisplayCore.h"
#include "Theme.h"
#include "DeviceIdentity.h"
#include "NetClient.h"
#include "Config.h"
#include "ModuleIcons.h"

#include <ArduinoJson.h>
#include <math.h>
#include <string.h>

#include "Fonts/FreeSans9ptNO.h"
#include "Fonts/FreeSansBold12ptNO.h"
#include "Fonts/FreeSansBold18ptNO.h"

#define FONT_B9  (&FreeSans9pt8b)
#define FONT_B12 (&FreeSansBold12pt8b)
#define FONT_B18 (&FreeSansBold18pt8b)

#define SURF_DEBUG 1

#if SURF_DEBUG
  #define SURF_LOG(x) Serial.print(x)
  #define SURF_LOGLN(x) Serial.println(x)
#else
  #define SURF_LOG(x) do {} while (0)
  #define SURF_LOGLN(x) do {} while (0)
#endif

// =========================================================
// TAB 1 — Config + cache
// =========================================================
static const FrameConfig* g_cfg = nullptr;

static const int MAX_INSTANCES = 4;

static const char* TODAYS_BEST_ID    = "__todays_best__";
static const char* TODAYS_BEST_LABEL = "Today's Best";

struct SurfInstanceConfig {
  uint8_t id = 1;
  char spotId[32] = {0};
  char spot[48] = {0};
  uint32_t refreshMs = 1800000UL;
};

struct SurfDayPart {
  bool  valid = false;
  int   rating = -1;
  bool  ratingFromExperience = false;
  int   experienceDiceValue = -1;
  char  waveRange[24] = {0};
  float periodS = NAN;
  float windSpeedMs = NAN;
};

struct SurfDaily {
  bool  valid = false;
  char  label[16] = {0};
  int   rating = -1;
  bool  ratingFromExperience = false;
  int   experienceDiceValue = -1;
  char  waveRange[24] = {0};
  float periodS = NAN;
  float windSpeedMs = NAN;
};

struct SurfCache {
  bool valid = false;
  uint32_t fetchedAtMs = 0;

  int rating = -1;
  int score  = -1;
  bool ratingFromExperience = false;
  int experienceDiceValue = -1;

  char line1[32] = {0};
  char line2[24] = {0};

  char waveRangeNext[24] = {0};

  char spotLabel[48] = {0};
  char spotIdResolved[32] = {0};

  float swellHeightM = NAN;
  float swellPeriodS = NAN;
  float swellDirDegFrom = NAN;
  float windSpeedMs = NAN;
  float windDirDegFrom = NAN;

  SurfDayPart day[4];
  bool hasDayparts = false;

  SurfDaily daily[5];
  bool hasDaily = false;

  char sunrise[8] = {0};
  char sunset[8]  = {0};

  float airTempC = NAN;
  float airMinC  = NAN;
  float airMaxC  = NAN;

  float waterMinC = NAN;
  float waterMaxC = NAN;

  int weatherWmo = -1;
  char weatherLabel[24] = {0};
};

static SurfInstanceConfig g_inst[MAX_INSTANCES];
static SurfCache g_cache[MAX_INSTANCES];

static inline int clampi(int v, int lo, int hi) { return (v < lo) ? lo : (v > hi) ? hi : v; }

// =========================================================
// TAB 2 — Instance helpers
// =========================================================
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

// =========================================================
// TAB 3 — Text + JSON utilities
// =========================================================
static void utf8ToLatin1(char* out, size_t n, const char* in) {
  if (!out || n == 0) return;
  size_t oi = 0;

  for (size_t i = 0; in && in[i] && oi + 1 < n; i++) {
    uint8_t c = (uint8_t)in[i];

    if (c < 0x80) { out[oi++] = (char)c; continue; }

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

static void measureText(const char* text, const GFXfont* font,
                        int16_t& x1, int16_t& y1, uint16_t& w, uint16_t& h) {
  auto& d = DisplayCore::get();
  d.setFont(font);
  d.setTextSize(1);
  d.getTextBounds(text, 0, 0, &x1, &y1, &w, &h);
}

static void fontBoxMetrics(const GFXfont* font, int16_t& y1, uint16_t& h) {
  int16_t x1, _y1; uint16_t w, _h;
  measureText("Ag", font, x1, _y1, w, _h);
  y1 = _y1;
  h  = _h;
}

static void drawCenteredBox(int x, int y, int w, int h,
                            const char* text, const GFXfont* font, uint16_t col) {
  auto& d = DisplayCore::get();
  int16_t x1, y1; uint16_t tw, th;
  measureText(text, font, x1, y1, tw, th);

  int cx = x + (w - (int)tw)/2 - x1;
  int cy = y + (h - (int)th)/2 - y1;

  d.setFont(font);
  d.setTextColor(col);
  d.setCursor(cx, cy);
  d.print(text);
  d.setFont(nullptr);
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

static String urlEncode(const char* s) {
  if (!s) return "";
  String out;
  const char* hex = "0123456789ABCDEF";
  for (size_t i = 0; s[i]; i++) {
    uint8_t c = (uint8_t)s[i];
    bool safe =
      (c >= 'a' && c <= 'z') ||
      (c >= 'A' && c <= 'Z') ||
      (c >= '0' && c <= '9') ||
      c == '-' || c == '_' || c == '.' || c == '~';
    if (safe) out += (char)c;
    else {
      out += '%';
      out += hex[(c >> 4) & 0xF];
      out += hex[c & 0xF];
    }
  }
  return out;
}

static void sanitizeAsciiInPlace(char* s) {
  if (!s) return;
  for (size_t i = 0; s[i]; i++) {
    uint8_t c = (uint8_t)s[i];
    if (c >= 0x20 && c <= 0x7E) continue;
    s[i] = '-';
  }
}

static void stripUnderscoresToSpaces(char* dst, size_t n, const char* src) {
  if (!dst || n == 0) return;
  dst[0] = 0;
  if (!src || !src[0]) return;
  size_t oi = 0;
  for (size_t i = 0; src[i] && oi + 1 < n; i++) {
    char c = src[i];
    if (c == '_') c = ' ';
    dst[oi++] = c;
  }
  dst[oi] = 0;
}

static void normalizeWaveRangeLabelInPlace(char* s) {
  if (!s || !s[0]) return;

  char out[32] = {0};
  size_t oi = 0;

  for (size_t i = 0; s[i] && oi + 1 < sizeof(out); i++) {
    char c = s[i];

    if (c == '-') {
      if (oi > 0 && out[oi - 1] != ' ') out[oi++] = ' ';
      if (oi + 1 < sizeof(out)) out[oi++] = '-';
      if (oi + 1 < sizeof(out)) out[oi++] = ' ';
      while (s[i + 1] == ' ') i++;
      continue;
    }

    out[oi++] = c;
  }
  out[oi] = 0;

  while (oi > 0 && out[oi - 1] == ' ') { out[--oi] = 0; }

  if (oi >= 1 && out[oi - 1] == 'm') {
    if (oi >= 2 && out[oi - 2] != ' ') {
      if (oi + 1 < sizeof(out)) {
        out[oi] = out[oi - 1];
        out[oi - 1] = ' ';
        out[oi + 1] = 0;
      }
    }
  }

  strlcpy(s, out, 32);
}

static String fmtFloat6(float v) {
  if (!isfinite(v)) return "0";
  return String(v, 6);
}

static int jsonToInt(JsonVariantConst v, int defVal) {
  if (v.is<int>()) return v.as<int>();
  if (v.is<long>()) return (int)v.as<long>();
  if (v.is<float>()) return (int)lroundf(v.as<float>());
  if (v.is<double>()) return (int)lround(v.as<double>());
  if (v.is<const char*>()) {
    const char* s = v.as<const char*>();
    if (!s || !s[0]) return defVal;
    return atoi(s);
  }
  return defVal;
}

static bool jsonToBoolLoose(JsonVariantConst v, bool defVal = false) {
  if (v.is<bool>()) return v.as<bool>();
  if (v.is<int>()) return v.as<int>() != 0;
  if (v.is<long>()) return v.as<long>() != 0;
  if (v.is<const char*>()) {
    const char* s = v.as<const char*>();
    if (!s || !s[0]) return defVal;
    if (!strcasecmp(s, "1")) return true;
    if (!strcasecmp(s, "true")) return true;
    if (!strcasecmp(s, "yes")) return true;
    if (!strcasecmp(s, "on")) return true;
    if (!strcasecmp(s, "0")) return false;
    if (!strcasecmp(s, "false")) return false;
    if (!strcasecmp(s, "no")) return false;
    if (!strcasecmp(s, "off")) return false;
  }
  return defVal;
}

static bool sourceStringLooksExperience(const char* s) {
  if (!s || !s[0]) return false;

  char buf[64] = {0};
  size_t n = strlen(s);
  if (n >= sizeof(buf)) n = sizeof(buf) - 1;

  for (size_t i = 0; i < n; i++) {
    char c = s[i];
    if (c >= 'A' && c <= 'Z') c = (char)(c - 'A' + 'a');
    buf[i] = c;
  }
  buf[n] = 0;

  return (strstr(buf, "experience") != nullptr) ||
         (strstr(buf, "manual") != nullptr) ||
         (strstr(buf, "local") != nullptr) ||
         (strstr(buf, "human") != nullptr);
}

static int jsonObjectFinalRating1to6(JsonObjectConst obj) {
  if (!obj) return -1;

  int v = jsonToInt(obj["rating"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(obj["score"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(obj["stars"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(obj["breakdown"]["experience"]["blended_rating_1_6"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(obj["experience"]["blended_rating_1_6"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(obj["picked"]["rating"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(obj["picked"]["score"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(obj["picked"]["stars"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(obj["picked"]["breakdown"]["experience"]["blended_rating_1_6"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(obj["picked"]["experience"]["blended_rating_1_6"], -1);
  if (v >= 1 && v <= 6) return v;

  return -1;
}

static int jsonDocFinalRating1to6(const JsonDocument& doc) {
  int v = jsonToInt(doc["rating"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(doc["score"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(doc["stars"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(doc["breakdown"]["experience"]["blended_rating_1_6"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(doc["experience"]["blended_rating_1_6"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(doc["picked"]["rating"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(doc["picked"]["score"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(doc["picked"]["stars"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(doc["picked"]["breakdown"]["experience"]["blended_rating_1_6"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(doc["picked"]["experience"]["blended_rating_1_6"], -1);
  if (v >= 1 && v <= 6) return v;

  return -1;
}

static bool jsonObjectRatingFromExperience(JsonObjectConst obj) {
  if (!obj) return false;

  // STRICT RULE:
  // Only show experience-style dice when backend explicitly says matched=true.
  if (jsonToBoolLoose(obj["breakdown"]["experience"]["matched"])) return true;
  if (jsonToBoolLoose(obj["experience"]["matched"])) return true;
  if (jsonToBoolLoose(obj["picked"]["breakdown"]["experience"]["matched"])) return true;
  if (jsonToBoolLoose(obj["picked"]["experience"]["matched"])) return true;

  return false;
}

static bool jsonDocRatingFromExperience(const JsonDocument& doc) {
  // STRICT RULE:
  // Only show experience-style dice when backend explicitly says matched=true.
  if (jsonToBoolLoose(doc["breakdown"]["experience"]["matched"])) return true;
  if (jsonToBoolLoose(doc["experience"]["matched"])) return true;
  if (jsonToBoolLoose(doc["picked"]["breakdown"]["experience"]["matched"])) return true;
  if (jsonToBoolLoose(doc["picked"]["experience"]["matched"])) return true;

  return false;
}

static int jsonDocExperienceDiceValue(const JsonDocument& doc) {
  const bool fromExperience = jsonDocRatingFromExperience(doc);
  if (!fromExperience) return -1;

  // Prefer final visible rating
  int v = jsonDocFinalRating1to6(doc);
  if (v >= 1 && v <= 6) return v;

  // Then blended rating if final rating is missing
  v = jsonToInt(doc["breakdown"]["experience"]["blended_rating_1_6"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(doc["experience"]["blended_rating_1_6"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(doc["picked"]["breakdown"]["experience"]["blended_rating_1_6"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(doc["picked"]["experience"]["blended_rating_1_6"], -1);
  if (v >= 1 && v <= 6) return v;

  // Final fallback only if matched=true but final/blended rating is missing
  v = jsonToInt(doc["breakdown"]["experience"]["rating_1_6"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(doc["experience"]["rating_1_6"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(doc["picked"]["breakdown"]["experience"]["rating_1_6"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(doc["picked"]["experience"]["rating_1_6"], -1);
  if (v >= 1 && v <= 6) return v;

  return -1;
}

static int jsonObjectExperienceDiceValue(JsonObjectConst obj) {
  if (!obj) return -1;

  const bool fromExperience = jsonObjectRatingFromExperience(obj);
  if (!fromExperience) return -1;

  // Prefer final visible rating
  int v = jsonObjectFinalRating1to6(obj);
  if (v >= 1 && v <= 6) return v;

  // Then blended rating if final rating is missing
  v = jsonToInt(obj["breakdown"]["experience"]["blended_rating_1_6"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(obj["experience"]["blended_rating_1_6"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(obj["picked"]["breakdown"]["experience"]["blended_rating_1_6"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(obj["picked"]["experience"]["blended_rating_1_6"], -1);
  if (v >= 1 && v <= 6) return v;

  // Final fallback only if matched=true but final/blended rating is missing
  v = jsonToInt(obj["breakdown"]["experience"]["rating_1_6"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(obj["experience"]["rating_1_6"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(obj["picked"]["breakdown"]["experience"]["rating_1_6"], -1);
  if (v >= 1 && v <= 6) return v;

  v = jsonToInt(obj["picked"]["experience"]["rating_1_6"], -1);
  if (v >= 1 && v <= 6) return v;

  return -1;
}

static void normalizeExperienceDisplayMain(SurfCache& out) {
  if (!out.ratingFromExperience) {
    out.experienceDiceValue = -1;
    return;
  }

  if (out.rating >= 1 && out.rating <= 6) {
    out.experienceDiceValue = out.rating;
    return;
  }

  if (out.experienceDiceValue < 1 || out.experienceDiceValue > 6) {
    out.experienceDiceValue = -1;
  }
}

static void normalizeExperienceDisplayDayPart(SurfDayPart& dp) {
  if (!dp.ratingFromExperience) {
    dp.experienceDiceValue = -1;
    return;
  }

  if (dp.rating >= 1 && dp.rating <= 6) {
    dp.experienceDiceValue = dp.rating;
    return;
  }

  if (dp.experienceDiceValue < 1 || dp.experienceDiceValue > 6) {
    dp.experienceDiceValue = -1;
  }
}

static void normalizeExperienceDisplayDaily(SurfDaily& dd) {
  if (!dd.ratingFromExperience) {
    dd.experienceDiceValue = -1;
    return;
  }

  if (dd.rating >= 1 && dd.rating <= 6) {
    dd.experienceDiceValue = dd.rating;
    return;
  }

  if (dd.experienceDiceValue < 1 || dd.experienceDiceValue > 6) {
    dd.experienceDiceValue = -1;
  }
}

static void clearDaily(SurfCache& out) {
  for (int i = 0; i < 5; i++) out.daily[i] = SurfDaily();
  out.hasDaily = false;
}

static void clearDayParts(SurfCache& out) {
  for (int i = 0; i < 4; i++) out.day[i] = SurfDayPart();
  out.hasDayparts = false;
}

static void tryParseDayPartsFromJson(const JsonDocument& doc, SurfCache& out) {
  clearDayParts(out);

  JsonArrayConst arr;
  if (doc["dayparts"].is<JsonArrayConst>()) {
    arr = doc["dayparts"].as<JsonArrayConst>();
  } else if (doc["forecast"]["dayparts"].is<JsonArrayConst>()) {
    arr = doc["forecast"]["dayparts"].as<JsonArrayConst>();
  } else if (doc["forecast"]["parts"].is<JsonArrayConst>()) {
    arr = doc["forecast"]["parts"].as<JsonArrayConst>();
  }

  if (!arr || arr.size() < 4) return;

  out.hasDayparts = true;

  for (int i = 0; i < 4; i++) {
    JsonObjectConst p = arr[i].as<JsonObjectConst>();
    if (!p) continue;

    SurfDayPart dp;

    int r = jsonObjectFinalRating1to6(p);
    if (r >= 1 && r <= 6) dp.rating = r;

    dp.ratingFromExperience = jsonObjectRatingFromExperience(p);
    dp.experienceDiceValue  = jsonObjectExperienceDiceValue(p);

    if (dp.experienceDiceValue >= 1 && dp.experienceDiceValue <= 6) {
      dp.ratingFromExperience = true;
      if (dp.rating < 1 || dp.rating > 6) dp.rating = dp.experienceDiceValue;
    }

    normalizeExperienceDisplayDayPart(dp);

    const char* wr =
      p["wave_height_range_label"] |
      p["waveRange"] |
      p["wave_range"] |
      p["picked"]["wave_height_range_label"] |
      p["picked"]["waveRange"] |
      p["picked"]["wave_range"] |
      "";

    if (wr && wr[0]) strlcpy(dp.waveRange, wr, sizeof(dp.waveRange));

    float per =
      p["swell_period_s"] |
      p["period_s"] |
      p["period"] |
      p["picked"]["swell_period_s"] |
      p["picked"]["period_s"] |
      p["picked"]["period"] |
      NAN;

    if (isfinite(per) && per > 0.0f) dp.periodS = per;

    float ws =
      p["wind_speed_ms"] |
      p["wind_ms"] |
      p["wind"] |
      p["picked"]["wind_speed_ms"] |
      p["picked"]["wind_ms"] |
      p["picked"]["wind"] |
      NAN;

    if (isfinite(ws) && ws >= 0.0f) dp.windSpeedMs = ws;

    if ((dp.rating >= 1 && dp.rating <= 6) ||
        dp.waveRange[0] ||
        isfinite(dp.periodS) ||
        isfinite(dp.windSpeedMs) ||
        dp.ratingFromExperience ||
        (dp.experienceDiceValue >= 1 && dp.experienceDiceValue <= 6)) {
      dp.valid = true;
      out.day[i] = dp;

#if SURF_DEBUG
      Serial.print("DAYPART["); Serial.print(i); Serial.println("]");
      Serial.print("  raw.rating="); Serial.println(jsonToInt(p["rating"], -1));
      Serial.print("  raw.exp.matched="); Serial.println(jsonToBoolLoose(p["breakdown"]["experience"]["matched"]) ? "true" : "false");
      Serial.print("  raw.exp.rating_1_6="); Serial.println(jsonToInt(p["breakdown"]["experience"]["rating_1_6"], -1));
      Serial.print("  raw.exp.blended_rating_1_6="); Serial.println(jsonToInt(p["breakdown"]["experience"]["blended_rating_1_6"], -1));
      Serial.print("  cached.rating="); Serial.println(dp.rating);
      Serial.print("  cached.ratingFromExperience="); Serial.println(dp.ratingFromExperience ? "true" : "false");
      Serial.print("  cached.experienceDiceValue="); Serial.println(dp.experienceDiceValue);
#endif
    }
  }

  for (int i = 0; i < 4; i++) sanitizeAsciiInPlace(out.day[i].waveRange);
}

static void tryParseDailyFromJson(const JsonDocument& doc, SurfCache& out) {
  clearDaily(out);

  JsonArrayConst arr;
  if (doc["daily"].is<JsonArrayConst>()) {
    arr = doc["daily"].as<JsonArrayConst>();
  } else if (doc["forecast"]["daily"].is<JsonArrayConst>()) {
    arr = doc["forecast"]["daily"].as<JsonArrayConst>();
  }

  if (!arr || arr.size() < 2) return;

  int n = (int)arr.size();
  if (n > 5) n = 5;

  out.hasDaily = true;

  for (int i = 0; i < n; i++) {
    JsonObjectConst p = arr[i].as<JsonObjectConst>();
    if (!p) continue;

    SurfDaily dd;

    const char* lab =
      p["label"] |
      p["day"] |
      p["dow"] |
      p["date"] |
      p["picked"]["label"] |
      p["picked"]["day"] |
      p["picked"]["dow"] |
      p["picked"]["date"] |
      "";

    if (lab && lab[0]) strlcpy(dd.label, lab, sizeof(dd.label));

    int r = jsonObjectFinalRating1to6(p);
    if (r >= 1 && r <= 6) dd.rating = r;

    dd.ratingFromExperience = jsonObjectRatingFromExperience(p);
    dd.experienceDiceValue  = jsonObjectExperienceDiceValue(p);

    if (dd.experienceDiceValue >= 1 && dd.experienceDiceValue <= 6) {
      dd.ratingFromExperience = true;
      if (dd.rating < 1 || dd.rating > 6) dd.rating = dd.experienceDiceValue;
    }

    normalizeExperienceDisplayDaily(dd);

    const char* wr =
      p["wave_height_range_label"] |
      p["waveRange"] |
      p["wave_range"] |
      p["picked"]["wave_height_range_label"] |
      p["picked"]["waveRange"] |
      p["picked"]["wave_range"] |
      "";

    if (wr && wr[0]) strlcpy(dd.waveRange, wr, sizeof(dd.waveRange));

    float per =
      p["swell_period_s"] |
      p["period_s"] |
      p["period"] |
      p["picked"]["swell_period_s"] |
      p["picked"]["period_s"] |
      p["picked"]["period"] |
      NAN;

    if (isfinite(per) && per > 0.0f) dd.periodS = per;

    float ws =
      p["wind_speed_ms"] |
      p["wind_ms"] |
      p["wind"] |
      p["picked"]["wind_speed_ms"] |
      p["picked"]["wind_ms"] |
      p["picked"]["wind"] |
      NAN;

    if (isfinite(ws) && ws >= 0.0f) dd.windSpeedMs = ws;

    if ((dd.rating >= 1 && dd.rating <= 6) ||
        dd.waveRange[0] ||
        isfinite(dd.periodS) ||
        isfinite(dd.windSpeedMs) ||
        dd.label[0] ||
        dd.ratingFromExperience ||
        (dd.experienceDiceValue >= 1 && dd.experienceDiceValue <= 6)) {
      dd.valid = true;
      out.daily[i] = dd;

#if SURF_DEBUG
      Serial.print("DAILY["); Serial.print(i); Serial.println("]");
      Serial.print("  label="); Serial.println(dd.label);
      Serial.print("  raw.rating="); Serial.println(jsonToInt(p["rating"], -1));
      Serial.print("  raw.exp.matched="); Serial.println(jsonToBoolLoose(p["breakdown"]["experience"]["matched"]) ? "true" : "false");
      Serial.print("  raw.exp.rating_1_6="); Serial.println(jsonToInt(p["breakdown"]["experience"]["rating_1_6"], -1));
      Serial.print("  raw.exp.blended_rating_1_6="); Serial.println(jsonToInt(p["breakdown"]["experience"]["blended_rating_1_6"], -1));
      Serial.print("  cached.rating="); Serial.println(dd.rating);
      Serial.print("  cached.ratingFromExperience="); Serial.println(dd.ratingFromExperience ? "true" : "false");
      Serial.print("  cached.experienceDiceValue="); Serial.println(dd.experienceDiceValue);
#endif
    }
  }

  for (int i = 0; i < 5; i++) sanitizeAsciiInPlace(out.daily[i].waveRange);
}

// =========================================================
// TAB 4 — Config apply
// =========================================================
static void ensureDefaultsOnce() {
  static bool inited = false;
  if (inited) return;
  inited = true;

  for (int i = 0; i < MAX_INSTANCES; i++) {
    g_inst[i] = SurfInstanceConfig();
    g_inst[i].id = (uint8_t)(i + 1);
    g_cache[i] = SurfCache();
  }
}

static SurfInstanceConfig makeInactiveSurfInstance(uint8_t id) {
  SurfInstanceConfig cfg;
  cfg.id = id;
  cfg.spotId[0] = 0;
  cfg.spot[0] = 0;
  cfg.refreshMs = 1800000UL;
  return cfg;
}

static bool cfgChanged(const SurfInstanceConfig& oldCfg,
                       const char* spotId,
                       const char* spot,
                       uint32_t refreshMs) {
  if (strcmp(oldCfg.spotId, spotId ? spotId : "") != 0) return true;
  if (strcmp(oldCfg.spot, spot ? spot : "") != 0) return true;
  if (oldCfg.refreshMs != refreshMs) return true;
  return false;
}

static void applyConfigFromFrameConfig() {
  if (!g_cfg) return;
  ensureDefaultsOnce();

  SurfInstanceConfig oldInst[MAX_INSTANCES];
  for (int i = 0; i < MAX_INSTANCES; i++) {
    oldInst[i] = g_inst[i];
    g_inst[i] = makeInactiveSurfInstance((uint8_t)(i + 1));
  }

  for (int i = 0; i < (int)g_cfg->surfCount && i < MAX_INSTANCES; i++) {
    const SurfModuleConfig& src = g_cfg->surf[i];
    if (src.id < 1) continue;

    int idx = instIndex(src.id);
    SurfInstanceConfig& dst = g_inst[idx];
    const SurfInstanceConfig& oldCfg = oldInst[idx];

    char spotLatin1[48] = {0};
    if (src.spot[0]) utf8ToLatin1(spotLatin1, sizeof(spotLatin1), src.spot);

    bool changed = cfgChanged(oldCfg, src.spotId, spotLatin1, src.refreshMs);

    dst.id = src.id;
    dst.refreshMs = src.refreshMs;

    if (src.spotId[0]) strlcpy(dst.spotId, src.spotId, sizeof(dst.spotId));
    if (spotLatin1[0]) strlcpy(dst.spot, spotLatin1, sizeof(dst.spot));

    if (changed) {
      g_cache[idx] = SurfCache();
    }
  }
}

// =========================================================
// TAB 5 — "Today's Best" detection
// =========================================================
static bool isTodaysBestConfig(const SurfInstanceConfig& cfg) {
  if (cfg.spotId[0] && strcasecmp(cfg.spotId, TODAYS_BEST_ID) == 0) return true;
  if (cfg.spot[0] && strcasecmp(cfg.spot, TODAYS_BEST_LABEL) == 0) return true;
  return false;
}

// =========================================================
// TAB 6 — HTTP helpers
// =========================================================
static bool httpGetJson(const String& url, StaticJsonDocument<24576>& docOut) {
  int httpCode = 0;
  String body;

  String token = "";
  if (DeviceIdentity::hasToken()) {
    token = DeviceIdentity::getToken();
  }

  Serial.print("SURF URL = ");
  Serial.println(url);
  Serial.print("USING AUTH = ");
  Serial.println(token.length() > 0 ? "yes" : "no");

  bool ok;
  if (token.length() > 0) ok = NetClient::httpGetAuth(url, token, httpCode, body);
  else                    ok = NetClient::httpGet(url, httpCode, body);

#if SURF_DEBUG
  Serial.println("=== SURF HTTP GET ===");
  Serial.println(url);
  Serial.print("HTTP code: ");
  Serial.println(httpCode);
#endif

  if (!ok || httpCode != 200) return false;

  DeserializationError err = deserializeJson(docOut, body);
  if (err) {
    Serial.print("Surf JSON deserialize failed: ");
    Serial.println(err.c_str());
    Serial.print("Body bytes=");
    Serial.println(body.length());
    return false;
  }

  return true;
}

static String buildSurfUrlBase(const SurfInstanceConfig& cfg, const char* spotIdOverrideOrNull) {
  bool hasSpotId = cfg.spotId[0] != 0;
  bool hasSpot   = cfg.spot[0] != 0;

  String url = String(BASE_URL) + "/api/surf/score?";

  if (spotIdOverrideOrNull && spotIdOverrideOrNull[0]) {
    url += "spotId=" + urlEncode(spotIdOverrideOrNull);
  } else if (hasSpotId) {
    url += "spotId=" + urlEncode(cfg.spotId);
  } else if (hasSpot) {
    url += "spot=" + urlEncode(cfg.spot);
  } else {
    url += "spot=Surf";
  }

  url += "&hours=4";
  return url;
}

static void appendFuelPenaltyParamsIfNeeded(const SurfInstanceConfig& cfg, String& url) {
  if (!isTodaysBestConfig(cfg)) return;
  if (!g_cfg) return;

  const bool fp = g_cfg->surfSettings.fuelPenalty;
  const bool hasHome = g_cfg->surfSettings.hasHome();

  url += "&fuelPenalty=";
  url += (fp ? "1" : "0");

  if (fp && hasHome) {
    url += "&homeLat=" + fmtFloat6(g_cfg->surfSettings.homeLat);
    url += "&homeLon=" + fmtFloat6(g_cfg->surfSettings.homeLon);
  }
}

static void appendDailyParamsIfWanted(String& url) {
  url += "&daily=1&days=5";
}

static bool parseScoreResponseIntoCache(const StaticJsonDocument<24576>& doc, SurfCache& out) {
  int rating = jsonDocFinalRating1to6(doc);
  if (rating < 1 || rating > 6) return false;

  int totalScore = jsonToInt(doc["score"], -1);
  if (totalScore < 0) totalScore = -1;

  out.rating = rating;
  out.score  = totalScore;
  out.ratingFromExperience = jsonDocRatingFromExperience(doc);
  out.experienceDiceValue  = jsonDocExperienceDiceValue(doc);

  if (out.experienceDiceValue >= 1 && out.experienceDiceValue <= 6) {
    out.ratingFromExperience = true;
  }

  normalizeExperienceDisplayMain(out);

  const char* l1 = doc["line1"] | doc["summary"] | doc["picked"]["line1"] | doc["picked"]["summary"] | "";
  const char* l2 = doc["line2"] | doc["detail"]  | doc["picked"]["line2"] | doc["picked"]["detail"]  | "";

  if (l1 && l1[0]) strlcpy(out.line1, l1, sizeof(out.line1));
  else out.line1[0] = 0;

  if (l2 && l2[0]) strlcpy(out.line2, l2, sizeof(out.line2));
  else out.line2[0] = 0;

  const char* wr =
    doc["forecast"]["wave_height_range_label"] |
    doc["picked"]["wave_height_range_label"] |
    doc["picked"]["forecast"]["wave_height_range_label"] |
    "";
  if (wr && wr[0]) strlcpy(out.waveRangeNext, wr, sizeof(out.waveRangeNext));
  else out.waveRangeNext[0] = 0;

  const char* spotName = doc["spot"] | doc["picked"]["spot"] | "";
  if (spotName && spotName[0]) {
    char tmp[48] = {0};
    utf8ToLatin1(tmp, sizeof(tmp), spotName);
    strlcpy(out.spotLabel, tmp, sizeof(out.spotLabel));
  } else {
    out.spotLabel[0] = 0;
  }

  const char* sid = doc["spotId"] | doc["picked"]["spotId"] | "";
  if (sid && sid[0]) strlcpy(out.spotIdResolved, sid, sizeof(out.spotIdResolved));
  else out.spotIdResolved[0] = 0;

  out.swellHeightM    = doc["inputs"]["swell_height_m"]      | doc["picked"]["inputs"]["swell_height_m"]      | NAN;
  out.swellPeriodS    = doc["inputs"]["swell_period_s"]      | doc["picked"]["inputs"]["swell_period_s"]      | NAN;
  out.swellDirDegFrom = doc["inputs"]["swell_direction_deg"] | doc["picked"]["inputs"]["swell_direction_deg"] | NAN;
  out.windSpeedMs     = doc["inputs"]["wind_speed_ms"]       | doc["picked"]["inputs"]["wind_speed_ms"]       | NAN;
  out.windDirDegFrom  = doc["inputs"]["wind_direction_deg"]  | doc["picked"]["inputs"]["wind_direction_deg"]  | NAN;

  const char* sr =
    doc["sun"]["sunrise"] |
    doc["sunrise"] |
    doc["forecast"]["sunrise"] |
    doc["picked"]["sun"]["sunrise"] |
    doc["picked"]["sunrise"] |
    doc["picked"]["forecast"]["sunrise"] |
    "";

  const char* ss =
    doc["sun"]["sunset"] |
    doc["sunset"] |
    doc["forecast"]["sunset"] |
    doc["picked"]["sun"]["sunset"] |
    doc["picked"]["sunset"] |
    doc["picked"]["forecast"]["sunset"] |
    "";

  if (sr && sr[0]) strlcpy(out.sunrise, sr, sizeof(out.sunrise)); else out.sunrise[0] = 0;
  if (ss && ss[0]) strlcpy(out.sunset,  ss, sizeof(out.sunset));  else out.sunset[0]  = 0;

  out.airTempC =
    doc["temp_c"] |
    doc["air"]["temp_c"] |
    doc["weather"]["temp_c"] |
    doc["picked"]["temp_c"] |
    doc["picked"]["air"]["temp_c"] |
    doc["picked"]["weather"]["temp_c"] |
    NAN;

  out.airMinC =
    doc["air"]["temp_min_c"] |
    doc["weather"]["temp_min_c"] |
    doc["forecast"]["temp_min_c"] |
    doc["temp_min_c"] |
    doc["temps"]["air_min_c"] |
    doc["picked"]["air"]["temp_min_c"] |
    doc["picked"]["weather"]["temp_min_c"] |
    doc["picked"]["forecast"]["temp_min_c"] |
    doc["picked"]["temp_min_c"] |
    doc["picked"]["temps"]["air_min_c"] |
    NAN;

  out.airMaxC =
    doc["air"]["temp_max_c"] |
    doc["weather"]["temp_max_c"] |
    doc["forecast"]["temp_max_c"] |
    doc["temp_max_c"] |
    doc["temps"]["air_max_c"] |
    doc["picked"]["air"]["temp_max_c"] |
    doc["picked"]["weather"]["temp_max_c"] |
    doc["picked"]["forecast"]["temp_max_c"] |
    doc["picked"]["temp_max_c"] |
    doc["picked"]["temps"]["air_max_c"] |
    NAN;

  out.waterMinC =
    doc["water"]["temp_min_c"] |
    doc["forecast"]["water_temp_min_c"] |
    doc["water_temp_min_c"] |
    doc["temps"]["water_min_c"] |
    doc["picked"]["water"]["temp_min_c"] |
    doc["picked"]["forecast"]["water_temp_min_c"] |
    doc["picked"]["water_temp_min_c"] |
    doc["picked"]["temps"]["water_min_c"] |
    NAN;

  out.waterMaxC =
    doc["water"]["temp_max_c"] |
    doc["forecast"]["water_temp_max_c"] |
    doc["water_temp_max_c"] |
    doc["temps"]["water_max_c"] |
    doc["picked"]["water"]["temp_max_c"] |
    doc["picked"]["forecast"]["water_temp_max_c"] |
    doc["picked"]["water_temp_max_c"] |
    doc["picked"]["temps"]["water_max_c"] |
    NAN;

  out.weatherWmo =
    doc["weather"]["code"] |
    doc["weather"]["wmo"] |
    doc["forecast"]["wmo"] |
    doc["wmo"] |
    doc["weather_code"] |
    doc["picked"]["weather"]["code"] |
    doc["picked"]["weather"]["wmo"] |
    doc["picked"]["forecast"]["wmo"] |
    doc["picked"]["wmo"] |
    doc["picked"]["weather_code"] |
    -1;

  const char* wl =
    doc["weather_label"] |
    doc["forecast"]["weather_label"] |
    doc["weather"]["label"] |
    doc["weather"]["main"] |
    doc["picked"]["weather_label"] |
    doc["picked"]["forecast"]["weather_label"] |
    doc["picked"]["weather"]["label"] |
    doc["picked"]["weather"]["main"] |
    "";
  if (wl && wl[0]) strlcpy(out.weatherLabel, wl, sizeof(out.weatherLabel)); else out.weatherLabel[0] = 0;

  sanitizeAsciiInPlace(out.waveRangeNext);

#if SURF_DEBUG
  Serial.println("=== SURF MAIN PARSE ===");
  Serial.print("spot="); Serial.println(out.spotLabel);
  Serial.print("spotIdResolved="); Serial.println(out.spotIdResolved);
  Serial.print("doc.rating="); Serial.println(jsonToInt(doc["rating"], -1));
  Serial.print("doc.breakdown.experience.matched="); Serial.println(jsonToBoolLoose(doc["breakdown"]["experience"]["matched"]) ? "true" : "false");
  Serial.print("doc.breakdown.experience.rating_1_6="); Serial.println(jsonToInt(doc["breakdown"]["experience"]["rating_1_6"], -1));
  Serial.print("doc.breakdown.experience.blended_rating_1_6="); Serial.println(jsonToInt(doc["breakdown"]["experience"]["blended_rating_1_6"], -1));
  Serial.print("cached.rating="); Serial.println(out.rating);
  Serial.print("cached.ratingFromExperience="); Serial.println(out.ratingFromExperience ? "true" : "false");
  Serial.print("cached.experienceDiceValue="); Serial.println(out.experienceDiceValue);
#endif

  return true;
}

// =========================================================
// TAB 6B — Main fetch logic
// =========================================================
static bool fetchSurfScore2(const SurfInstanceConfig& cfg,
                            SurfCache& out,
                            bool wantDayparts,
                            bool wantDaily) {
  bool hasSpotId = cfg.spotId[0] != 0;
  bool hasSpot   = cfg.spot[0] != 0;
  if (!hasSpotId && !hasSpot) return false;

  const bool isBest = isTodaysBestConfig(cfg);

  if (!isBest) {
    StaticJsonDocument<24576> doc;
    String url = buildSurfUrlBase(cfg, nullptr);
    if (wantDayparts) url += "&dayparts=1";
    if (wantDaily) appendDailyParamsIfWanted(url);

    if (!httpGetJson(url, doc)) return false;
    if (!parseScoreResponseIntoCache(doc, out)) return false;

    if (wantDayparts) tryParseDayPartsFromJson(doc, out);
    else clearDayParts(out);

    if (wantDaily) tryParseDailyFromJson(doc, out);
    else clearDaily(out);

    return true;
  }

  const bool needsSecond = (wantDayparts || wantDaily);

  if (!needsSecond) {
    StaticJsonDocument<24576> doc;
    String url = buildSurfUrlBase(cfg, nullptr);
    appendFuelPenaltyParamsIfNeeded(cfg, url);

    if (!httpGetJson(url, doc)) return false;
    if (!parseScoreResponseIntoCache(doc, out)) return false;

    clearDayParts(out);
    clearDaily(out);
    return true;
  }

  StaticJsonDocument<24576> docTB;
  String urlTB = buildSurfUrlBase(cfg, nullptr);
  appendFuelPenaltyParamsIfNeeded(cfg, urlTB);

  if (!httpGetJson(urlTB, docTB)) return false;
  if (!parseScoreResponseIntoCache(docTB, out)) return false;

#if SURF_DEBUG
  Serial.println("=== TODAYS BEST FIRST PASS ===");
  Serial.print("resolved winner spotId="); Serial.println(out.spotIdResolved);
  Serial.print("main rating="); Serial.println(out.rating);
  Serial.print("main ratingFromExperience="); Serial.println(out.ratingFromExperience ? "true" : "false");
  Serial.print("main experienceDiceValue="); Serial.println(out.experienceDiceValue);
#endif

  if (!out.spotIdResolved[0]) {
    clearDayParts(out);
    clearDaily(out);
    return true;
  }

  StaticJsonDocument<24576> docWinner;
  String urlW = String(BASE_URL) + "/api/surf/score?";
  urlW += "spotId=" + urlEncode(out.spotIdResolved);
  urlW += "&hours=4";
  if (wantDayparts) urlW += "&dayparts=1";
  if (wantDaily) appendDailyParamsIfWanted(urlW);

  if (httpGetJson(urlW, docWinner)) {
    parseScoreResponseIntoCache(docWinner, out);

#if SURF_DEBUG
    Serial.println("=== TODAYS BEST WINNER REFETCH ===");
    Serial.print("winner spotId="); Serial.println(out.spotIdResolved);
    Serial.print("winner main rating="); Serial.println(out.rating);
    Serial.print("winner main ratingFromExperience="); Serial.println(out.ratingFromExperience ? "true" : "false");
    Serial.print("winner main experienceDiceValue="); Serial.println(out.experienceDiceValue);
#endif

    if (wantDayparts) tryParseDayPartsFromJson(docWinner, out);
    else clearDayParts(out);

    if (wantDaily) tryParseDailyFromJson(docWinner, out);
    else clearDaily(out);
  } else {
    clearDayParts(out);
    clearDaily(out);
  }

  return true;
}

static void tick(int idx, CellSize wantSize) {
  SurfInstanceConfig& cfg = g_inst[idx];
  SurfCache& cache = g_cache[idx];

  const uint32_t now = millis();

  const bool wantDayparts = (wantSize == CELL_LARGE);
  const bool wantDaily = (wantSize == CELL_XL);

  bool needs = (!cache.valid) || ((now - cache.fetchedAtMs) > cfg.refreshMs);

  if (!needs && wantDayparts && !cache.hasDayparts) needs = true;
  if (!needs && wantDaily && !cache.hasDaily) needs = true;

  if (!needs) return;

  SurfCache fresh = cache;
  if (fetchSurfScore2(cfg, fresh, wantDayparts, wantDaily)) {
    fresh.valid = true;
    fresh.fetchedAtMs = now;
    cache = fresh;
  }
}

// =========================================================
// TAB 7 — Drawing helpers
// =========================================================
static const char* ratingToWord(int rating1to6) {
  switch (rating1to6) {
    case 1: return "Flat";
    case 2: return "Poor";
    case 3: return "Poor to Fair";
    case 4: return "Fair";
    case 5: return "Good";
    case 6: return "Epic";
    default: return "--";
  }
}

static int ratingToFilled6(int rating1to6) {
  if (rating1to6 <= 0) return 0;
  if (rating1to6 >= 6) return 6;
  return rating1to6;
}

static void drawRatingRectsInlineSized(int x, int yTop, int rating1to6, uint16_t col,
                                       int boxW, int boxH, int gap, int r) {
  auto& d = DisplayCore::get();
  int filled = ratingToFilled6(rating1to6);

  for (int i = 0; i < 6; i++) {
    int rx = x + i * (boxW + gap);
    d.drawRoundRect(rx, yTop, boxW, boxH, r, col);
    if (i < filled) d.fillRoundRect(rx, yTop, boxW, boxH, r, col);
  }
}

static int blocksWidthPxSized(int boxW, int gap) {
  return 6 * boxW + 5 * gap;
}

struct RatingVisualSizing {
  int rectW;
  int rectH;
  int rectGap;
  int rr;
  int diceSize;
};

static RatingVisualSizing getRatingVisualSizing(CellSize size, bool xlMainToday = false) {
  RatingVisualSizing s;

  switch (size) {
    case CELL_SMALL:
      // untouched
      s.rectW = 18;
      s.rectH = 12;
      s.rectGap = 5;
      s.rr = 2;
      s.diceSize = 22;
      break;

    case CELL_MEDIUM:
      // slightly smaller rectangles, same dice
      s.rectW = 20;
      s.rectH = 14;
      s.rectGap = 6;
      s.rr = 3;
      s.diceSize = 52;
      break;

    case CELL_LARGE:
      // slightly smaller rectangles, same dice
      s.rectW = 18;
      s.rectH = 13;
      s.rectGap = 6;
      s.rr = 3;
      s.diceSize = 26;
      break;

    case CELL_XL:
      if (xlMainToday) {
        // slightly smaller rectangles, same dice
        s.rectW = 24;
        s.rectH = 17;
        s.rectGap = 8;
        s.rr = 3;
        s.diceSize = 30;
      } else {
        // slightly smaller rectangles, same dice
        s.rectW = 18;
        s.rectH = 13;
        s.rectGap = 6;
        s.rr = 3;
        s.diceSize = 26;
      }
      break;

    default:
      s.rectW = 18;
      s.rectH = 12;
      s.rectGap = 5;
      s.rr = 2;
      s.diceSize = 22;
      break;
  }

  return s;
}

// =========================================================
// Experience dice strip helpers
// =========================================================
static int experienceDiceStripWidthPxSized(int rectW, int gap) {
  return blocksWidthPxSized(rectW, gap);
}

static int experienceDiceStripHeightPxSized(int rectH) {
  return rectH;
}

static int experienceDiceCellSizePxSized(int rectW, int rectH, int gap) {
  int totalW = experienceDiceStripWidthPxSized(rectW, gap);
  int s = (totalW - 5 * gap) / 6;

  if (s > rectH) s = rectH;
  if (s < 8) s = 8;

  return s;
}

static void drawDiePipsAt(int x, int y, int size, int value, uint16_t col) {
  auto& d = DisplayCore::get();

  if (value < 1 || value > 6) return;

  int cx = x + size / 2;
  int cy = y + size / 2;

  int off = clampi(size / 4, 2, 8);
  int r   = clampi(size / 8, 1, 3);

  int left   = cx - off;
  int midX   = cx;
  int right  = cx + off;

  int top    = cy - off;
  int midY   = cy;
  int bottom = cy + off;

  auto pip = [&](int px, int py) {
    d.fillCircle(px, py, r, col);
  };

  switch (value) {
    case 1: pip(midX, midY); break;
    case 2: pip(left, top); pip(right, bottom); break;
    case 3: pip(left, top); pip(midX, midY); pip(right, bottom); break;
    case 4: pip(left, top); pip(right, top); pip(left, bottom); pip(right, bottom); break;
    case 5: pip(left, top); pip(right, top); pip(midX, midY); pip(left, bottom); pip(right, bottom); break;
    case 6:
      pip(left, top); pip(left, midY); pip(left, bottom);
      pip(right, top); pip(right, midY); pip(right, bottom);
      break;
  }
}

static void drawExperienceDiceStripSized(int x, int yTop,
                                         int diceValue,
                                         uint16_t col,
                                         int rectW, int rectH, int gap) {
  auto& d = DisplayCore::get();

  const int stripW = experienceDiceStripWidthPxSized(rectW, gap);
  const int stripH = experienceDiceStripHeightPxSized(rectH);
  const int dieS   = experienceDiceCellSizePxSized(rectW, rectH, gap);

  int filled = diceValue;
  if (filled < 0) filled = 0;
  if (filled > 6) filled = 6;

  uint16_t bg = Theme::paper();

  const int dieY = yTop + (stripH - dieS) / 2;
  const int usedW = 6 * dieS + 5 * gap;
  const int startX = x + (stripW - usedW) / 2;
  const int rr = clampi(dieS / 4, 2, 6);

  for (int i = 0; i < 6; i++) {
    int rx = startX + i * (dieS + gap);

    if (i < filled) {
      d.fillRoundRect(rx, dieY, dieS, dieS, rr, col);
      drawDiePipsAt(rx, dieY, dieS, i + 1, bg);
    } else {
      d.drawRoundRect(rx, dieY, dieS, dieS, rr, col);
    }
  }
}

static int ratingVisualWidthPxSized(bool fromExperience, int rectW, int gap, int diceSize) {
  (void)diceSize;
  return fromExperience ? experienceDiceStripWidthPxSized(rectW, gap)
                        : blocksWidthPxSized(rectW, gap);
}

static int ratingVisualHeightPxSized(bool fromExperience, int rectH, int diceSize) {
  (void)diceSize;
  return fromExperience ? experienceDiceStripHeightPxSized(rectH)
                        : rectH;
}

static void drawRatingVisualSized(int x, int yTop,
                                  int textRating,
                                  bool fromExperience,
                                  int diceValue,
                                  uint16_t col,
                                  int rectW, int rectH, int gap, int r, int diceSize) {
  (void)r;
  (void)diceSize;

  if (fromExperience) {
    int filled = diceValue;
    if (filled < 1 || filled > 6) filled = clampi(textRating, 0, 6);
    drawExperienceDiceStripSized(x, yTop, filled, col, rectW, rectH, gap);
  } else {
    drawRatingRectsInlineSized(x, yTop, textRating, col, rectW, rectH, gap, r);
  }
}

static void drawCelsiusMark(int x, int baselineY, uint16_t col) {
  auto& d = DisplayCore::get();

  d.setFont(FONT_B12);
  d.setTextColor(col);
  d.setCursor(x, baselineY);
  d.print("c");

  int16_t x1, y1; uint16_t w, h;
  measureText("c", FONT_B12, x1, y1, w, h);

  int left = x + (int)x1;
  int top  = baselineY + (int)y1;

  int r = 2;
  int dotX = left - 2;
  int dotY = top + 2;

  d.fillCircle(dotX, dotY, r, col);
  d.setFont(nullptr);
}

static void fillQuad(int x0,int y0,int x1,int y1,int x2,int y2,int x3,int y3,uint16_t col) {
  auto& d = DisplayCore::get();
  d.fillTriangle(x0,y0, x1,y1, x2,y2, col);
  d.fillTriangle(x0,y0, x2,y2, x3,y3, col);
}

static void drawArrowFlatTailCentered(int cx, int cy, int len, float degTo, int thickness, uint16_t col) {
  auto& d = DisplayCore::get();

  int L = clampi(len, 18, 120);
  int t = clampi(thickness, 2, 10);

  float a = degTo * (float)M_PI / 180.0f;
  float dx = sinf(a);
  float dy = -cosf(a);

  int headLen  = clampi(L / 3, 10, 22);
  int shaftLen = L - headLen;

  int xTailEnd = cx - (int)lroundf(dx * (float)shaftLen * 0.5f);
  int yTailEnd = cy - (int)lroundf(dy * (float)shaftLen * 0.5f);

  int xShaftFront = cx + (int)lroundf(dx * (float)shaftLen * 0.5f);
  int yShaftFront = cy + (int)lroundf(dy * (float)shaftLen * 0.5f);

  int xTip = xShaftFront + (int)lroundf(dx * (float)headLen);
  int yTip = yShaftFront + (int)lroundf(dy * (float)headLen);

  float px = -dy;
  float py = dx;

  int ox = (int)lroundf(px * (float)(t * 0.50f));
  int oy = (int)lroundf(py * (float)(t * 0.50f));

  int x0 = xTailEnd - ox, y0 = yTailEnd - oy;
  int x1 = xTailEnd + ox, y1 = yTailEnd + oy;
  int x2 = xShaftFront + ox, y2 = yShaftFront + oy;
  int x3 = xShaftFront - ox, y3 = yShaftFront - oy;
  fillQuad(x0,y0, x1,y1, x2,y2, x3,y3, col);

  int headW = clampi(t + 3, t + 2, t + 10);
  int hx = (int)lroundf(px * (float)(headW));
  int hy = (int)lroundf(py * (float)(headW));
  int xL = xShaftFront + hx, yL = yShaftFront + hy;
  int xR = xShaftFront - hx, yR = yShaftFront - hy;
  d.fillTriangle(xTip, yTip, xL, yL, xR, yR, col);
}

static void drawTextCenteredInRect(int x, int y, int w, int h,
                                   const char* txt, const GFXfont* font, uint16_t ink) {
  auto& d = DisplayCore::get();
  int16_t x1, y1; uint16_t tw, th;
  measureText(txt, font, x1, y1, tw, th);
  int baseline = y + (h - (int)th) / 2 - y1;
  int drawX = x + (w - (int)tw) / 2 - x1;
  d.setFont(font);
  d.setTextColor(ink);
  d.setCursor(drawX, baseline);
  d.print(txt);
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
  d.print(txt);
  d.setFont(nullptr);
}

static void getDisplaySpotName(const SurfInstanceConfig& cfg,
                               const SurfCache& data,
                               char* out, size_t n) {
  if (!out || n == 0) return;
  out[0] = 0;

  if (isTodaysBestConfig(cfg)) {
    if (data.spotLabel[0]) stripUnderscoresToSpaces(out, n, data.spotLabel);
    else strlcpy(out, "--", n);
    return;
  }

  if (cfg.spot[0]) {
    stripUnderscoresToSpaces(out, n, cfg.spot);
    return;
  }

  if (data.spotLabel[0]) {
    stripUnderscoresToSpaces(out, n, data.spotLabel);
    return;
  }

  strlcpy(out, "--", n);
}

static void getWaveRangeLabel(const SurfCache& data, char* out, size_t n) {
  if (!out || n == 0) return;
  out[0] = 0;

  if (data.waveRangeNext[0]) strlcpy(out, data.waveRangeNext, n);
  else if (data.line1[0])    strlcpy(out, data.line1, n);
  else                       strlcpy(out, "--", n);

  sanitizeAsciiInPlace(out);
  normalizeWaveRangeLabelInPlace(out);
}

static void drawTodaysBestOverlay(const Cell& c, const SurfCache& data, uint16_t ink) {
  auto& d = DisplayCore::get();
  (void)data;

  const int padX = 16;
  const int padY = 10;

  d.setFont(FONT_B9);
  d.setTextColor(ink);
  d.setCursor(c.x + padX, c.y + padY + 8);
  d.print("Best next 4h:");
  d.setFont(nullptr);
}

static void drawSmallRatingLine(int x, int w, int baselineY,
                                const SurfCache& data,
                                const char* waveRange,
                                uint16_t ink) {
  auto& d = DisplayCore::get();

  const char* word = ratingToWord(data.rating);
  const bool useExperienceDice = data.ratingFromExperience;

  // Keep original small sizes exactly as before
  const int boxW = useExperienceDice ? 24 : 18;
  const int boxH = useExperienceDice ? 20 : 12;
  const int boxGap = useExperienceDice ? 4 : 5;
  const int rr = useExperienceDice ? 3 : 2;
  const int diceSize = 22;

  const int visualW = ratingVisualWidthPxSized(useExperienceDice, boxW, boxGap, diceSize);
  const int visualH = ratingVisualHeightPxSized(useExperienceDice, boxH, diceSize);

  const int thirdW = w / 3;
  const int leftX  = x;
  const int midX   = x + thirdW;
  const int rightX = x + thirdW * 2;
  const int rightW = w - thirdW * 2;

  const int leftCx  = leftX  + thirdW / 2;
  const int midCx   = midX   + thirdW / 2;
  const int rightCx = rightX + rightW / 2;

  // Same short vertical divider style as weather/reminders small
  drawDividerAtXShort(x + thirdW, baselineY, FONT_B12, ink);
  drawDividerAtXShort(x + thirdW * 2, baselineY, FONT_B12, ink);

  // Left: rating text
  drawTextCenteredAt(leftCx, baselineY, word, FONT_B12, ink);

  // Middle: rating rectangles/dices
  int16_t sampleX1, sampleY1; uint16_t sampleW, sampleH;
  measureText("Ag", FONT_B12, sampleX1, sampleY1, sampleW, sampleH);
  int visualY = baselineY + sampleY1 + (((int)sampleH - visualH) / 2);

  drawRatingVisualSized(midCx - visualW / 2, visualY,
                        data.rating, useExperienceDice, data.experienceDiceValue,
                        ink, boxW, boxH, boxGap, rr, diceSize);

  // Right: wave range
  drawTextCenteredAt(rightCx, baselineY, waveRange, FONT_B12, ink);
}

static void drawMediumDetailsHalf(int x, int y, int w, int h,
                                  const SurfCache& data,
                                  int headerBaselineY,
                                  int ratingCenterY,
                                  int bottomTextBaselineY,
                                  uint16_t ink) {
  auto& d = DisplayCore::get();
  (void)y;
  (void)h;

  const int padX = 12;
  const int innerX = x + padX;
  const int innerW = w - 2 * padX;

  const int colGap = 12;
  int slotW = (innerW - colGap) / 2;
  int waveX = innerX;
  int windX = waveX + slotW + colGap;
  int windW = innerW - slotW - colGap;

  drawTextCenteredAt(x + w / 2, headerBaselineY, "Details:", FONT_B12, ink);

  const int arrowLenWave = clampi(slotW - 14, 22, 48);
  const int arrowLenWind = clampi(windW - 14, 22, 48);

  int waveArrowCx = waveX + slotW / 2;
  int windArrowCx = windX + windW / 2;

  const int arrowY = ratingCenterY - 10;

  if (isfinite(data.swellDirDegFrom)) drawArrowFlatTailCentered(waveArrowCx, arrowY, arrowLenWave, data.swellDirDegFrom + 180.0f, 3, ink);
  else d.drawFastHLine(waveArrowCx - arrowLenWave / 2, arrowY, arrowLenWave, ink);

  if (isfinite(data.windDirDegFrom)) drawArrowFlatTailCentered(windArrowCx, arrowY, arrowLenWind, data.windDirDegFrom + 180.0f, 3, ink);
  else d.drawFastHLine(windArrowCx - arrowLenWind / 2, arrowY, arrowLenWind, ink);

  char perTxt[12] = {0};
  if (isfinite(data.swellPeriodS) && data.swellPeriodS > 0) snprintf(perTxt, sizeof(perTxt), "%.0f s", data.swellPeriodS);
  else strlcpy(perTxt, "--", sizeof(perTxt));

  char windTxt[12] = {0};
  if (isfinite(data.windSpeedMs) && data.windSpeedMs >= 0) snprintf(windTxt, sizeof(windTxt), "%.0f m/s", data.windSpeedMs);
  else strlcpy(windTxt, "--", sizeof(windTxt));

  int16_t py1; uint16_t ph;
  int16_t wy1; uint16_t wh;
  fontBoxMetrics(FONT_B9, py1, ph);
  fontBoxMetrics(FONT_B9, wy1, wh);

  int textTop = bottomTextBaselineY + py1;
  int iconBottom = textTop - 8;
  int iconH = 18;
  int iconTop = iconBottom - iconH;

  if (iconTop < headerBaselineY + 12) iconTop = headerBaselineY + 12;

  const int waveIconW = 28;
  const int windIconW = 36;

  const int waveIconX = waveArrowCx - waveIconW / 2;
  const int windIconX = windArrowCx - windIconW / 2;

  ModuleIcons::drawSurfWavePeriodIcon(waveIconX, iconTop, waveIconW, iconH, data.swellPeriodS);
  ModuleIcons::drawWindIconBox(windIconX, iconTop, windIconW, iconH, 2);

  const int waveTextCx = waveIconX + waveIconW / 2;
  const int windTextCx = windIconX + windIconW / 2;

  drawTextCenteredAt(waveTextCx + 10, bottomTextBaselineY, perTxt, FONT_B9, ink);
  drawTextCenteredAt(windTextCx, bottomTextBaselineY, windTxt, FONT_B9, ink);
}

// =========================================================
// TAB 8 — Rendering
// =========================================================
static void renderCommon(const Cell& c,
                         const SurfInstanceConfig& cfg,
                         const SurfCache& data,
                         const String& moduleName) {
  uint16_t ink = Theme::ink();
  auto& d = DisplayCore::get();
  (void)moduleName;

  const int headerNudgeDown = 4;

  if (!cfg.spot[0] && !cfg.spotId[0]) {
    drawCenteredBox(c.x, c.y, c.w, c.h, "Set spot", FONT_B12, ink);
    return;
  }

  const bool isBest = isTodaysBestConfig(cfg);

  if (!data.valid) {
    drawCenteredBox(c.x, c.y, c.w, c.h, "Surf", FONT_B12, ink);
    if (isBest) drawTodaysBestOverlay(c, data, ink);
    return;
  }

  if (isBest) drawTodaysBestOverlay(c, data, ink);

  // ===============================
  // SMALL
  // ===============================
  if (c.size == CELL_SMALL) {
    char spotName[64] = {0};
    getDisplaySpotName(cfg, data, spotName, sizeof(spotName));

    char waveRange[24] = {0};
    getWaveRangeLabel(data, waveRange, sizeof(waveRange));

    int16_t sx1, sy1; uint16_t sw, sh;
    int16_t ly1; uint16_t lh;
    measureText(spotName, FONT_B12, sx1, sy1, sw, sh);
    fontBoxMetrics(FONT_B12, ly1, lh);

    const int underlineGap = 4;
    const int underlineH = 2;
    const int lineGap = 20;

    int totalH = (int)sh + underlineGap + underlineH + lineGap + (int)lh;
    int topY = c.y + (c.h - totalH) / 2;

    int spotBaseline = topY - sy1 + headerNudgeDown;

    drawTextCenteredAt(c.x + c.w / 2, spotBaseline, spotName, FONT_B12, ink);

    {
      int underlineY = topY + (int)sh + underlineGap + headerNudgeDown;
      int underlineX = c.x + c.w / 2 - (int)sw / 2;
      d.fillRect(underlineX, underlineY, (int)sw, underlineH, ink);
    }

    int lineBaseline = topY + (int)sh + underlineGap + underlineH + lineGap - ly1;
    drawSmallRatingLine(c.x, c.w, lineBaseline, data, waveRange, ink);
    return;
  }

  // ===============================
  // MEDIUM
  // ===============================
  if (c.size == CELL_MEDIUM) {
    char spotName[64] = {0};
    getDisplaySpotName(cfg, data, spotName, sizeof(spotName));

    char waveRange[24] = {0};
    getWaveRangeLabel(data, waveRange, sizeof(waveRange));

    const int leftX  = c.x;
    const int leftW  = c.w / 2;
    const int rightX = c.x + leftW;
    const int rightW = c.w - leftW;

    const int topPad = 20;
    const int titleUnderlineGap = 4;
    const int titleUnderlineH = 2;

    int16_t tx1, ty1; uint16_t tw, th;
    measureText(spotName, FONT_B12, tx1, ty1, tw, th);

    int titleBaseline = c.y + topPad - ty1 + headerNudgeDown;
    drawTextCenteredAt(c.x + c.w / 2, titleBaseline, spotName, FONT_B12, ink);

    {
      int underlineY = (titleBaseline + ty1) + (int)th + titleUnderlineGap;
      int underlineX = c.x + c.w / 2 - (int)tw / 2;
      d.fillRect(underlineX, underlineY, (int)tw, titleUnderlineH, ink);
    }

    int16_t wordY1; uint16_t wordH;
    int16_t waveY1; uint16_t waveH;
    fontBoxMetrics(FONT_B12, wordY1, wordH);
    fontBoxMetrics(FONT_B9, waveY1, waveH);

    const RatingVisualSizing vs = getRatingVisualSizing(CELL_MEDIUM);
    const int rectW = vs.rectW;
    const int rectH = vs.rectH;
    const int rectGap = vs.rectGap;
    const int rr = vs.rr;
    const int diceSize = vs.diceSize;

    int visualW = ratingVisualWidthPxSized(data.ratingFromExperience, rectW, rectGap, diceSize);
    int visualH = ratingVisualHeightPxSized(data.ratingFromExperience, rectH, diceSize);

    const int bottomPad = 35;
    const int gapHeaderToVisual = 40;
    const int gapVisualToWave   = 40;

    int bottomWaveBaseline = c.y + c.h - bottomPad - waveY1;

    int waveTopY = bottomWaveBaseline + waveY1;
    int visualY = waveTopY - gapVisualToWave - visualH;
    int visualCenterY = visualY + visualH / 2;

    int headerTopY = visualY - gapHeaderToVisual - (int)wordH;
    int headerBaselineY = headerTopY - wordY1;

    int dividerY = headerTopY;
    int dividerBottom = bottomWaveBaseline + waveY1 + waveH;
    int dividerH = dividerBottom - dividerY;
    if (dividerH > 0) d.drawFastVLine(c.x + c.w / 2, dividerY, dividerH, ink);

    int cxLeft = leftX + leftW / 2;

    drawTextCenteredAt(cxLeft, headerBaselineY, ratingToWord(data.rating), FONT_B12, ink);

    drawRatingVisualSized(cxLeft - visualW / 2, visualY,
                          data.rating, data.ratingFromExperience, data.experienceDiceValue,
                          ink, rectW, rectH, rectGap, rr, diceSize);

    drawTextCenteredAt(cxLeft, bottomWaveBaseline, waveRange, FONT_B9, ink);

    drawMediumDetailsHalf(rightX, dividerY, rightW, c.h - (dividerY - c.y),
                          data, headerBaselineY, visualCenterY, bottomWaveBaseline, ink);
    return;
  }

  // ===============================
  // LARGE
  // ===============================
  if (c.size == CELL_LARGE) {
    char spotName[64] = {0};
    getDisplaySpotName(cfg, data, spotName, sizeof(spotName));

    const int topPad = 22;
    const int titleUnderlineGap = 4;
    const int titleUnderlineH = 2;

    int16_t stx1, sty1; uint16_t stw, sth;
    measureText(spotName, FONT_B12, stx1, sty1, stw, sth);

    int spotBaseline = c.y + topPad - sty1 + headerNudgeDown;
    drawTextCenteredAt(c.x + c.w / 2, spotBaseline, spotName, FONT_B12, ink);

    int spotUnderlineY = (spotBaseline + sty1) + (int)sth + titleUnderlineGap;
    int spotUnderlineX = c.x + c.w / 2 - (int)stw / 2;
    d.fillRect(spotUnderlineX, spotUnderlineY, (int)stw, titleUnderlineH, ink);

    int regionTop = spotUnderlineY + titleUnderlineH + 12;
    int regionBot = c.y + c.h - 10;
    int regionH   = regionBot - regionTop;
    if (regionH < 80) return;

    const int cols = 4;
    int baseColW = c.w / cols;
    int extra = c.w - baseColW * cols;

    const char* titles[4] = { "Morning", "Noon", "Afternoon", "Evening" };

    const int bottomPad = 35;
    const int lineGap = 20;

    int16_t headY1; uint16_t headH;
    int16_t ratingY1; uint16_t ratingH;
    int16_t waveY1; uint16_t waveH;
    fontBoxMetrics(FONT_B12, headY1, headH);
    fontBoxMetrics(FONT_B9,  ratingY1, ratingH);
    fontBoxMetrics(FONT_B9,  waveY1, waveH);

    const RatingVisualSizing vs = getRatingVisualSizing(CELL_LARGE);
    const int rectW = vs.rectW;
    const int rectH = vs.rectH;
    const int rectGap = vs.rectGap;
    const int rr = vs.rr;
    const int diceSize = vs.diceSize;

    int sharedDividerTop = regionTop;
    int sharedDividerBottom = regionBot;

    for (int i = 0; i < 4; i++) {
      bool rExp = false;
      if (data.day[i].valid) {
        rExp = data.day[i].ratingFromExperience ||
               (data.day[i].experienceDiceValue >= 1 && data.day[i].experienceDiceValue <= 6);
      }

      int visualH = ratingVisualHeightPxSized(rExp, rectH, diceSize);

      int waveBaselineY = regionTop + regionH - bottomPad - waveY1;
      int waveTopY = waveBaselineY + waveY1;

      int visualY = waveTopY - lineGap - visualH;
      int ratingTopY = visualY - lineGap - (int)ratingH;
      int headerTopY = ratingTopY - lineGap - (int)headH;

      int dividerTop = headerTopY;
      int dividerBottom = waveBaselineY + waveY1 + waveH;

      if (i == 0 || dividerTop < sharedDividerTop) sharedDividerTop = dividerTop;
      if (i == 0 || dividerBottom > sharedDividerBottom) sharedDividerBottom = dividerBottom;
    }

    for (int i = 1; i < cols; i++) {
      int dx = c.x + i * baseColW + ((i <= extra) ? i : extra);
      int lineY = sharedDividerTop;
      int lineH = sharedDividerBottom - sharedDividerTop;
      if (lineH > 0) d.drawFastVLine(dx, lineY, lineH, ink);
    }

    for (int i = 0; i < 4; i++) {
      int colX = c.x + i * baseColW + ((i < extra) ? i : extra);
      int colW = baseColW + ((i < extra) ? 1 : 0);
      int colCx = colX + colW / 2;

      int r = (data.day[i].valid && data.day[i].rating >= 1) ? data.day[i].rating : data.rating;

      int diceVal = -1;
      bool rExp = false;

      if (data.day[i].valid) {
        if (data.day[i].experienceDiceValue >= 1 && data.day[i].experienceDiceValue <= 6) {
          diceVal = data.day[i].experienceDiceValue;
          rExp = true;
        } else if (data.day[i].ratingFromExperience) {
          rExp = true;
          diceVal = (data.day[i].rating >= 1 && data.day[i].rating <= 6) ? data.day[i].rating : -1;
        }
      }

      if (!rExp &&
          data.ratingFromExperience &&
          data.experienceDiceValue >= 1 && data.experienceDiceValue <= 6 &&
          data.day[i].valid &&
          data.day[i].rating == data.rating) {
        rExp = true;
        diceVal = data.experienceDiceValue;
      }

      char waveRange[24] = {0};
      if (data.day[i].valid && data.day[i].waveRange[0]) strlcpy(waveRange, data.day[i].waveRange, sizeof(waveRange));
      else if (data.waveRangeNext[0]) strlcpy(waveRange, data.waveRangeNext, sizeof(waveRange));
      else if (data.line1[0]) strlcpy(waveRange, data.line1, sizeof(waveRange));
      else strlcpy(waveRange, "--", sizeof(waveRange));
      sanitizeAsciiInPlace(waveRange);
      normalizeWaveRangeLabelInPlace(waveRange);

      int visualW = ratingVisualWidthPxSized(rExp, rectW, rectGap, diceSize);
      int visualH = ratingVisualHeightPxSized(rExp, rectH, diceSize);

      int waveBaselineY = regionTop + regionH - bottomPad - waveY1;
      int waveTopY = waveBaselineY + waveY1;

      int visualY = waveTopY - lineGap - visualH;
      int ratingTopY = visualY - lineGap - (int)ratingH;
      int ratingBaselineY = ratingTopY - ratingY1;
      int headerTopY = ratingTopY - lineGap - (int)headH;
      int headerBaselineY = headerTopY - headY1;

      drawTextCenteredAt(colCx, headerBaselineY, titles[i], FONT_B12, ink);
      drawTextCenteredAt(colCx, ratingBaselineY, ratingToWord(r), FONT_B9, ink);

      drawRatingVisualSized(colCx - visualW / 2, visualY,
                            r, rExp, diceVal,
                            ink, rectW, rectH, rectGap, rr, diceSize);

      drawTextCenteredAt(colCx, waveBaselineY, waveRange, FONT_B9, ink);
    }

    return;
  }

  // ===============================
  // XL
  // ===============================
  if (c.size == CELL_XL) {
    char spotName[64] = {0};
    getDisplaySpotName(cfg, data, spotName, sizeof(spotName));

    {
      char topLabel[96] = {0};
      if (isBest) snprintf(topLabel, sizeof(topLabel), "Best next 4hrs: %s", spotName);
      else strlcpy(topLabel, spotName, sizeof(topLabel));

      auto& dd = DisplayCore::get();
      dd.setFont(FONT_B9);
      dd.setTextColor(ink);
      dd.setCursor(c.x + 16, c.y + 18 + headerNudgeDown);
      dd.print(topLabel);
      dd.setFont(nullptr);
    }

    int topY = c.y;
    int topH = c.h / 2;
    int botY = c.y + topH;
    int botH = c.h - topH;

    d.drawFastHLine(c.x + 10, botY, c.w - 20, ink);

    int baseW = c.w / 3;
    int extra = c.w - baseW * 3;

    int colX0 = c.x;
    int colW0 = baseW + (extra > 0 ? 1 : 0);

    int colX1 = colX0 + colW0;
    int colW1 = baseW + (extra > 1 ? 1 : 0);

    int colX2 = colX1 + colW1;
    int colW2 = (c.x + c.w) - colX2;

    int middleRatingBaseline = 0;
    int middleVisualY = 0;
    int middleVisualCenterY = 0;
    int middleWaveBaseline = 0;
    int middleRatingTopY = 0;
    int middleWaveBottomY = 0;

    {
      const int x = colX1;
      const int w = colW1;
      const int cx = x + w / 2;

      const char* title = "Today";
      int16_t t_x1, t_y1; uint16_t t_w, t_h;
      measureText(title, FONT_B18, t_x1, t_y1, t_w, t_h);

      int titleTop = topY + 14 + headerNudgeDown;
      int titleBaseline = titleTop - (int)t_y1;

      d.setFont(FONT_B18);
      d.setTextColor(ink);
      d.setCursor(cx - (int)t_w/2 - t_x1, titleBaseline);
      d.print(title);
      d.setFont(nullptr);

      const int underlineGap = 3;
      const int underlineThk = 2;
      int underlineY = titleTop + (int)t_h + underlineGap;
      int underlineW = (int)t_w + 16;
      d.fillRect(cx - underlineW/2, underlineY, underlineW, underlineThk, ink);

      int16_t ratingY1; uint16_t ratingH;
      int16_t waveY1; uint16_t waveH;
      fontBoxMetrics(FONT_B12, ratingY1, ratingH);
      fontBoxMetrics(FONT_B12, waveY1, waveH);

      const RatingVisualSizing vs = getRatingVisualSizing(CELL_XL, true);
      const int rectW = vs.rectW;
      const int rectH = vs.rectH;
      const int rectGap = vs.rectGap;
      const int rr = vs.rr;
      const int diceSize = vs.diceSize;

      int visualW = ratingVisualWidthPxSized(data.ratingFromExperience, rectW, rectGap, diceSize);
      int visualH = ratingVisualHeightPxSized(data.ratingFromExperience, rectH, diceSize);

      const int bottomPad = 35;
      const int lineGap = 35;

      middleWaveBaseline = topY + topH - bottomPad - waveY1;
      int waveTopY = middleWaveBaseline + waveY1;

      middleVisualY = waveTopY - lineGap - visualH;
      middleVisualCenterY = middleVisualY + visualH / 2;

      middleRatingTopY = middleVisualY - lineGap - (int)ratingH;
      middleRatingBaseline = middleRatingTopY - ratingY1;
      middleWaveBottomY = middleWaveBaseline + waveY1 + waveH;

      drawTextCenteredAt(cx, middleRatingBaseline, ratingToWord(data.rating), FONT_B12, ink);

      drawRatingVisualSized(cx - visualW/2, middleVisualY,
                            data.rating, data.ratingFromExperience, data.experienceDiceValue,
                            ink, rectW, rectH, rectGap, rr, diceSize);

      char wr[24] = {0};
      getWaveRangeLabel(data, wr, sizeof(wr));
      drawTextCenteredAt(cx, middleWaveBaseline, wr, FONT_B12, ink);
    }

    {
      int topDividerY = middleRatingTopY;
      int topDividerH = middleWaveBottomY - topDividerY;
      if (topDividerH > 0) {
        d.drawFastVLine(colX1, topDividerY, topDividerH, ink);
        d.drawFastVLine(colX2, topDividerY, topDividerH, ink);
      }
    }

    {
      const int x = colX0;
      const int w = colW0;

      const int padX = 10;
      const int innerX0 = x + padX;
      const int innerX1 = x + w - padX;
      const int innerW  = innerX1 - innerX0;

      const int MID_GAP = 16;
      int slotW = (innerW - MID_GAP) / 2;
      int waveSlotX = innerX0;
      int windSlotX = innerX0 + slotW + MID_GAP;
      int windSlotW = innerW - slotW - MID_GAP;

      const int waveArrowCx = waveSlotX + slotW / 2;
      const int windArrowCx = windSlotX + windSlotW / 2;

      const int arrowLenWave = clampi(slotW - 20, 20, 34);
      const int arrowLenWind = arrowLenWave;
      const int arrowLenMax = arrowLenWave;

      const int iconH = 14;
      const int waveIconW = 28;
      const int windIconW = 36;
      const int iconY = middleVisualCenterY - iconH / 2;

      const int arrowBaseY = middleRatingBaseline + 2;
      const int arrowHeadLenMax = clampi(arrowLenMax / 3, 10, 22);
      const int arrowDownReachMax = (arrowLenMax + arrowHeadLenMax) / 2;
      const int minArrowToIconGap = 7;
      const int arrowY = min(arrowBaseY, iconY - minArrowToIconGap - arrowDownReachMax) - 20;

      if (isfinite(data.swellDirDegFrom)) drawArrowFlatTailCentered(waveArrowCx, arrowY, arrowLenWave, data.swellDirDegFrom + 180.0f, 3, ink);
      else d.drawFastHLine(waveArrowCx - arrowLenWave / 2, arrowY, arrowLenWave, ink);

      if (isfinite(data.windDirDegFrom)) drawArrowFlatTailCentered(windArrowCx, arrowY, arrowLenWind, data.windDirDegFrom + 180.0f, 3, ink);
      else d.drawFastHLine(windArrowCx - arrowLenWind / 2, arrowY, arrowLenWind, ink);

      const int waveIconX = waveArrowCx - waveIconW / 2;
      const int windIconX = windArrowCx - windIconW / 2;

      ModuleIcons::drawSurfWavePeriodIcon(waveIconX, iconY, waveIconW, iconH, data.swellPeriodS);
      ModuleIcons::drawWindIconBox(windIconX, iconY, windIconW, iconH, 2);

      char perTxt[12] = {0};
      if (isfinite(data.swellPeriodS) && data.swellPeriodS > 0) snprintf(perTxt, sizeof(perTxt), "%.0f s", data.swellPeriodS);
      else strlcpy(perTxt, "--", sizeof(perTxt));

      char windTxt[12] = {0};
      if (isfinite(data.windSpeedMs) && data.windSpeedMs >= 0) snprintf(windTxt, sizeof(windTxt), "%.0f m/s", data.windSpeedMs);
      else strlcpy(windTxt, "--", sizeof(windTxt));

      drawTextCenteredAt(waveArrowCx + 10, middleWaveBaseline, perTxt, FONT_B12, ink);
      drawTextCenteredAt(windArrowCx, middleWaveBaseline, windTxt, FONT_B12, ink);
    }

    {
      const int x = colX2;
      const int w = colW2;

      auto pickTemp = [](float v, float altA, float altB) -> float {
        if (isfinite(v)) return v;
        if (isfinite(altA)) return altA;
        if (isfinite(altB)) return altB;
        return NAN;
      };

      float airMin = pickTemp(data.airMinC, data.airTempC, NAN);
      float airMax = pickTemp(data.airMaxC, data.airTempC, NAN);

      float waterMin = data.waterMinC;
      float waterMax = data.waterMaxC;

      char airMinTxt[8] = {0};
      char airMaxTxt[8] = {0};
      char waterMinTxt[8] = {0};
      char waterMaxTxt[8] = {0};

      if (isfinite(airMin)) snprintf(airMinTxt, sizeof(airMinTxt), "%d", (int)lroundf(airMin));
      else strlcpy(airMinTxt, "--", sizeof(airMinTxt));

      if (isfinite(airMax)) snprintf(airMaxTxt, sizeof(airMaxTxt), "%d", (int)lroundf(airMax));
      else strlcpy(airMaxTxt, "--", sizeof(airMaxTxt));

      if (isfinite(waterMin)) snprintf(waterMinTxt, sizeof(waterMinTxt), "%d", (int)lroundf(waterMin));
      else strlcpy(waterMinTxt, "--", sizeof(waterMinTxt));

      if (isfinite(waterMax)) snprintf(waterMaxTxt, sizeof(waterMaxTxt), "%d", (int)lroundf(waterMax));
      else strlcpy(waterMaxTxt, "--", sizeof(waterMaxTxt));

      const char* sr = (data.sunrise[0] ? data.sunrise : "--:--");
      const char* ss = (data.sunset[0]  ? data.sunset  : "--:--");

      const int iconBaseX = x + 25;

      int16_t topRightTextY1; uint16_t topRightTextH;
      fontBoxMetrics(FONT_B12, topRightTextY1, topRightTextH);

      int16_t srx1, sry1; uint16_t srw, srh;
      int16_t ssx1, ssy1; uint16_t ssw, ssh;
      measureText(sr, FONT_B12, srx1, sry1, srw, srh);
      measureText(ss, FONT_B12, ssx1, ssy1, ssw, ssh);

      const int gapToDivider = 12;
      const int dividerW = 1;

      int sunStartX   = iconBaseX + 44;
      int sharedLeftX = sunStartX;
      int sharedDividerX = sharedLeftX + (int)srw + gapToDivider;
      int sharedRightX   = sharedDividerX + dividerW + gapToDivider;

      auto drawMinMaxRow = [&](int iconCenterY,
                               int iconDrawMode,
                               int iconYTop,
                               const char* leftTxt,
                               const char* rightTxt,
                               int baselineY) {
        int16_t lx1, ly1; uint16_t lw, lh;
        int16_t rx1, ry1; uint16_t rw, rh;

        measureText(leftTxt,  FONT_B12, lx1, ly1, lw, lh);
        measureText(rightTxt, FONT_B12, rx1, ry1, rw, rh);

        const int gapToC = 6;

        if (iconDrawMode == 0) {
          int weatherWmo = data.weatherWmo;
          if (weatherWmo < 0) weatherWmo = 3;
          ModuleIcons::drawWeatherIcon(iconBaseX + 11, iconCenterY, 22, weatherWmo);
        } else {
          ModuleIcons::drawWaterDropIcon(iconBaseX, iconYTop, 16, 18);
        }

        int16_t cx1, cy1; uint16_t cw, ch;
        measureText("c", FONT_B12, cx1, cy1, cw, ch);

        int leftGroupRightX = sharedDividerX - gapToDivider;
        int leftTextX = leftGroupRightX - (int)cw - gapToC - (int)lw;

        d.setFont(FONT_B12);
        d.setTextColor(ink);
        d.setCursor(leftTextX - lx1, baselineY);
        d.print(leftTxt);
        d.setFont(nullptr);

        drawCelsiusMark(leftTextX + (int)lw + gapToC, baselineY, ink);

        drawDividerAtXShort(sharedDividerX, baselineY, FONT_B12, ink);

        d.setFont(FONT_B12);
        d.setTextColor(ink);
        d.setCursor(sharedRightX - rx1, baselineY);
        d.print(rightTxt);
        d.setFont(nullptr);
        drawCelsiusMark(sharedRightX + (int)rw + gapToC, baselineY, ink);
      };

      drawMinMaxRow(
        middleRatingBaseline + topRightTextY1 + topRightTextH / 2,
        0,
        0,
        airMinTxt,
        airMaxTxt,
        middleRatingBaseline
      );

      const int waterIconY = middleVisualCenterY - 9;
      drawMinMaxRow(
        0,
        1,
        waterIconY,
        waterMinTxt,
        waterMaxTxt,
        middleVisualCenterY + 6
      );

      const int sunRowY = middleWaveBaseline - 14;

      ModuleIcons::drawSunUpDownIcon(iconBaseX + 8, sunRowY, 24, 18);

      d.setFont(FONT_B12);
      d.setTextColor(ink);
      d.setCursor(sharedLeftX - srx1, middleWaveBaseline);
      d.print(sr);
      d.setFont(nullptr);

      drawDividerAtXShort(sharedDividerX, middleWaveBaseline, FONT_B12, ink);

      d.setFont(FONT_B12);
      d.setTextColor(ink);
      d.setCursor(sharedRightX - ssx1, middleWaveBaseline);
      d.print(ss);
      d.setFont(nullptr);
    }

    {
      int regionTop = botY + 10;
      int regionH = botH - 20;

      const int cols = 4;
      int baseColW = c.w / cols;
      int extraW = c.w - baseColW * cols;

      const int bottomPad = 35;
      const int lineGap = 35;

      int16_t dayY1; uint16_t dayH;
      int16_t ratingY1; uint16_t ratingH;
      int16_t waveY1; uint16_t waveH;
      fontBoxMetrics(FONT_B12, dayY1, dayH);
      fontBoxMetrics(FONT_B9, ratingY1, ratingH);
      fontBoxMetrics(FONT_B9, waveY1, waveH);

      const RatingVisualSizing vs = getRatingVisualSizing(CELL_XL, false);
      const int rectW = vs.rectW;
      const int rectH = vs.rectH;
      const int rectGap = vs.rectGap;
      const int rr = vs.rr;
      const int diceSize = vs.diceSize;

      int sharedDividerTop = 0;
      int sharedDividerBottom = 0;

      for (int i = 0; i < 4; i++) {
        int di = i + 1;
        bool rExp = false;
        if (data.daily[di].valid) {
          rExp = data.daily[di].ratingFromExperience ||
                 (data.daily[di].experienceDiceValue >= 1 && data.daily[di].experienceDiceValue <= 6);
        }
        int visualH = ratingVisualHeightPxSized(rExp, rectH, diceSize);

        int waveBase = regionTop + regionH - bottomPad - waveY1;
        int waveTop  = waveBase + waveY1;
        int visualY  = waveTop - lineGap - visualH;
        int ratingTop = visualY - lineGap - (int)ratingH;
        int dayTop    = ratingTop - lineGap - (int)dayH;

        int dividerTop = dayTop;
        int dividerBottom = waveBase + waveY1 + waveH;

        if (i == 0 || dividerTop < sharedDividerTop) sharedDividerTop = dividerTop;
        if (i == 0 || dividerBottom > sharedDividerBottom) sharedDividerBottom = dividerBottom;
      }

      for (int i = 1; i < cols; i++) {
        int dx = c.x + i * baseColW + ((i <= extraW) ? i : extraW);
        int lineY = sharedDividerTop;
        int lineH = sharedDividerBottom - sharedDividerTop;
        if (lineH > 0) d.drawFastVLine(dx, lineY, lineH, ink);
      }

      for (int i = 0; i < 4; i++) {
        int colX = c.x + i * baseColW + ((i < extraW) ? i : extraW);
        int colW = baseColW + ((i < extraW) ? 1 : 0);
        int cx = colX + colW / 2;

        int di = i + 1;

        const char* ttl =
          (data.daily[di].label[0] ? data.daily[di].label :
           (i == 0 ? "Tomorrow" : "--"));

        int r = (data.daily[di].valid && data.daily[di].rating >= 1) ? data.daily[di].rating : data.rating;

        int diceVal = -1;
        bool rExp = false;

        if (data.daily[di].valid) {
          if (data.daily[di].experienceDiceValue >= 1 && data.daily[di].experienceDiceValue <= 6) {
            diceVal = data.daily[di].experienceDiceValue;
            rExp = true;
          } else if (data.daily[di].ratingFromExperience) {
            rExp = true;
            diceVal = (data.daily[di].rating >= 1 && data.daily[di].rating <= 6) ? data.daily[di].rating : -1;
          }
        }

        if (!rExp &&
            data.ratingFromExperience &&
            data.experienceDiceValue >= 1 && data.experienceDiceValue <= 6 &&
            data.daily[di].valid &&
            data.daily[di].rating == data.rating) {
          rExp = true;
          diceVal = data.experienceDiceValue;
        }

        char wr[24] = {0};
        if (data.daily[di].valid && data.daily[di].waveRange[0]) strlcpy(wr, data.daily[di].waveRange, sizeof(wr));
        else getWaveRangeLabel(data, wr, sizeof(wr));
        sanitizeAsciiInPlace(wr);
        normalizeWaveRangeLabelInPlace(wr);

        int visualW = ratingVisualWidthPxSized(rExp, rectW, rectGap, diceSize);
        int visualH = ratingVisualHeightPxSized(rExp, rectH, diceSize);

        int waveBase = regionTop + regionH - bottomPad - waveY1;
        int waveTop  = waveBase + waveY1;
        int visualY  = waveTop - lineGap - visualH;
        int ratingTop = visualY - lineGap - (int)ratingH;
        int ratingBaseline = ratingTop - ratingY1;
        int dayTop = ratingTop - lineGap - (int)dayH;
        int dayBaseline = dayTop - dayY1;

        drawTextCenteredAt(cx, dayBaseline, ttl, FONT_B12, ink);
        drawTextCenteredAt(cx, ratingBaseline, ratingToWord(r), FONT_B9, ink);

        drawRatingVisualSized(cx - visualW / 2, visualY,
                              r, rExp, diceVal,
                              ink, rectW, rectH, rectGap, rr, diceSize);

        drawTextCenteredAt(cx, waveBase, wr, FONT_B9, ink);
      }
    }

    return;
  }
}

// =========================================================
// TAB 9 — Public module API
// =========================================================
namespace ModuleSurf {

void setConfig(const FrameConfig* cfg) {
  g_cfg = cfg;
  ensureDefaultsOnce();
  applyConfigFromFrameConfig();
}

void render(const Cell& c, const String& moduleName) {
  ensureDefaultsOnce();
  if (g_cfg) applyConfigFromFrameConfig();

  uint8_t id = parseInstanceId(moduleName);
  int idx = instIndex(id);

  tick(idx, c.size);

  const SurfInstanceConfig& cfg = g_inst[idx];
  const SurfCache& data = g_cache[idx];

#if SURF_DEBUG
  Serial.println("=== SURF RENDER CACHE ===");
  Serial.print("module="); Serial.println(moduleName);
  Serial.print("size="); Serial.println((int)c.size);
  Serial.print("main.rating="); Serial.println(data.rating);
  Serial.print("main.ratingFromExperience="); Serial.println(data.ratingFromExperience ? "true" : "false");
  Serial.print("main.experienceDiceValue="); Serial.println(data.experienceDiceValue);

  for (int i = 0; i < 4; i++) {
    Serial.print("day["); Serial.print(i); Serial.print("].valid="); Serial.println(data.day[i].valid ? "true" : "false");
    Serial.print("day["); Serial.print(i); Serial.print("].rating="); Serial.println(data.day[i].rating);
    Serial.print("day["); Serial.print(i); Serial.print("].ratingFromExperience="); Serial.println(data.day[i].ratingFromExperience ? "true" : "false");
    Serial.print("day["); Serial.print(i); Serial.print("].experienceDiceValue="); Serial.println(data.day[i].experienceDiceValue);
  }

  for (int i = 0; i < 5; i++) {
    Serial.print("daily["); Serial.print(i); Serial.print("].valid="); Serial.println(data.daily[i].valid ? "true" : "false");
    Serial.print("daily["); Serial.print(i); Serial.print("].rating="); Serial.println(data.daily[i].rating);
    Serial.print("daily["); Serial.print(i); Serial.print("].ratingFromExperience="); Serial.println(data.daily[i].ratingFromExperience ? "true" : "false");
    Serial.print("daily["); Serial.print(i); Serial.print("].experienceDiceValue="); Serial.println(data.daily[i].experienceDiceValue);
  }
#endif

  renderCommon(c, cfg, data, moduleName);
}

} // namespace ModuleSurf
