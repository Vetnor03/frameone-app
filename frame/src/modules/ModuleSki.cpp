#include "ModuleSki.h"
#include "DisplayCore.h"
#include "Theme.h"
#include "DeviceIdentity.h"
#include "NetClient.h"
#include "Config.h"
#include "FrameText.h"

#include <ArduinoJson.h>
#include <math.h>
#include <string.h>

#include "FreeSans9ptNO.h"
#include "FreeSansBold12ptNO.h"
#include "FreeSansBold18ptNO.h"

#define FONT_9   (&FreeSans9pt8b)
#define FONT_B12 (&FreeSansBold12pt8b)
#define FONT_B18 (&FreeSansBold18pt8b)

namespace {
constexpr int MAX_INSTANCES = 4;
constexpr uint32_t DEFAULT_REFRESH_MS = 3UL * 60UL * 60UL * 1000UL;
constexpr size_t SKI_JSON_CAPACITY = 4096;

struct SkiCache {
  bool valid = false;
  uint32_t fetchedAtMs = 0;
  bool norwegian = false;
  char location[80] = {0};

  float freshCm = NAN;
  float totalCm = NAN;
  float tempC = NAN;
  float windMps = NAN;
  float windDirDeg = NAN;

  bool avalancheAvailable = false;
  bool avalancheAssessed = false;
  int avalancheLevel = 0;

  bool resortAvailable = false;
  bool resortOpen = false;
  bool skiOpen = false;
  int liftsOpen = -1;
  int liftsTotal = -1;
  int slopesOpen = -1;
  int slopesTotal = -1;
  char resortName[64] = {0};

  bool powderFound = false;
  char powderDate[40] = {0};
  float powderLowCm = NAN;
  float powderHighCm = NAN;
  float powderMidCm = NAN;
};

SkiCache g_cache[MAX_INSTANCES];

uint8_t parseInstanceId(const String& moduleName) {
  const int colon = moduleName.indexOf(':');
  if (colon < 0) return 1;
  int id = moduleName.substring(colon + 1).toInt();
  if (id < 1) id = 1;
  if (id > MAX_INSTANCES) id = MAX_INSTANCES;
  return static_cast<uint8_t>(id);
}

void measureText(const char* text, const GFXfont* font, int16_t& x1, int16_t& y1, uint16_t& w, uint16_t& h) {
  auto& d = DisplayCore::get();
  d.setFont(font);
  d.setTextSize(1);
  d.getTextBounds(text ? text : "", 0, 0, &x1, &y1, &w, &h);
}

int textWidth(const char* text, const GFXfont* font) {
  int16_t x1, y1; uint16_t w, h;
  measureText(text, font, x1, y1, w, h);
  return static_cast<int>(w);
}

void fitTextToWidth(const char* src, char* dst, size_t dstSize, int maxWidth, const GFXfont* font) {
  if (!dst || dstSize == 0) return;
  dst[0] = '\0';
  if (!src || !src[0] || maxWidth <= 0) return;
  if (textWidth(src, font) <= maxWidth) {
    strlcpy(dst, src, dstSize);
    return;
  }

  const int length = static_cast<int>(strlen(src));
  for (int n = length; n >= 1; --n) {
    char candidate[128] = {0};
    const int take = min(n, static_cast<int>(sizeof(candidate)) - 4);
    memcpy(candidate, src, take);
    candidate[take] = '\0';
    while (strlen(candidate) > 0 && candidate[strlen(candidate) - 1] == ' ') candidate[strlen(candidate) - 1] = '\0';
    strlcat(candidate, "...", sizeof(candidate));
    if (textWidth(candidate, font) <= maxWidth) {
      strlcpy(dst, candidate, dstSize);
      return;
    }
  }
  strlcpy(dst, "...", dstSize);
}

void drawCenteredBaseline(const Cell& c, int baseline, const char* text, const GFXfont* font) {
  auto& d = DisplayCore::get();
  int16_t x1, y1; uint16_t w, h;
  measureText(text, font, x1, y1, w, h);
  d.setFont(font);
  d.setTextSize(1);
  d.setTextColor(Theme::ink());
  d.setCursor(c.x + (c.w - static_cast<int>(w)) / 2 - x1, baseline);
  d.print(text ? text : "");
  d.setFont(nullptr);
}

void drawCenteredFitted(const Cell& c, int baseline, const char* text, const GFXfont* font, int sidePad = 12) {
  char fitted[128] = {0};
  fitTextToWidth(text, fitted, sizeof(fitted), max(20, c.w - sidePad * 2), font);
  drawCenteredBaseline(c, baseline, fitted, font);
}

void drawCenteredInRect(int x, int y, int w, int h, const char* text, const GFXfont* font) {
  auto& d = DisplayCore::get();
  int16_t x1, y1; uint16_t tw, th;
  measureText(text, font, x1, y1, tw, th);
  d.setFont(font);
  d.setTextSize(1);
  d.setTextColor(Theme::ink());
  d.setCursor(x + (w - static_cast<int>(tw)) / 2 - x1, y + (h - static_cast<int>(th)) / 2 - y1);
  d.print(text ? text : "");
  d.setFont(nullptr);
}

const GFXfont* fittingLocationFont(const Cell& c, const char* text) {
  return textWidth(text, FONT_B12) <= c.w - 24 ? FONT_B12 : FONT_9;
}

void uppercaseAscii(char* text) {
  for (size_t i = 0; text && text[i]; ++i) {
    if (text[i] >= 'a' && text[i] <= 'z') text[i] = static_cast<char>(text[i] - 'a' + 'A');
  }
}

int rounded(float value) {
  return value < 0 ? -static_cast<int>(lroundf(-value)) : static_cast<int>(lroundf(value));
}

const char* windDirection(float degrees) {
  static const char* labels[] = {"N", "NE", "E", "SE", "S", "SW", "W", "NW"};
  if (!isfinite(degrees)) return "--";
  int index = static_cast<int>(lroundf(fmodf(fmodf(degrees, 360.0f) + 360.0f, 360.0f) / 45.0f)) % 8;
  return labels[index];
}

bool fetchSki(uint8_t id, SkiCache& out) {
  String url = String(BASE_URL) + "/api/device/ski-frame?device_id=" + DeviceIdentity::getDeviceId() + "&id=" + String(id);
  int code = 0;
  String body;
  if (!NetClient::httpGetAuth(url, DeviceIdentity::getToken(), code, body) || code != 200) {
    Serial.printf("Ski frame HTTP: %d\n", code);
    return false;
  }
  if (body.length() == 0 || body.length() > 8192) return false;

  DynamicJsonDocument doc(SKI_JSON_CAPACITY);
  if (deserializeJson(doc, body)) return false;

  out.norwegian = strcmp(doc["language"] | "en", "no") == 0;

  const char* rawLabel = doc["location"]["label"] | "Ski";
  FrameText::normalizeUtf8ForDisplay(out.location, sizeof(out.location), rawLabel);
  uppercaseAscii(out.location);

  out.freshCm = doc["snow"]["fresh_24h_cm"].isNull() ? NAN : doc["snow"]["fresh_24h_cm"].as<float>();
  out.totalCm = doc["snow"]["snow_depth_cm"].isNull() ? NAN : doc["snow"]["snow_depth_cm"].as<float>();
  out.tempC = doc["current"]["temp_c"].isNull() ? NAN : doc["current"]["temp_c"].as<float>();
  out.windMps = doc["current"]["wind_mps"].isNull() ? NAN : doc["current"]["wind_mps"].as<float>();
  out.windDirDeg = doc["current"]["wind_dir_deg"].isNull() ? NAN : doc["current"]["wind_dir_deg"].as<float>();

  out.avalancheAvailable = doc["avalanche"]["available"] | false;
  out.avalancheLevel = doc["avalanche"]["danger_level"] | 0;
  out.avalancheAssessed = (doc["avalanche"]["assessed"] | false) && out.avalancheLevel > 0;
  if (out.avalancheLevel <= 0) out.avalancheAssessed = false;

  out.resortAvailable = doc["resort"]["available"] | false;
  out.resortOpen = doc["resort"]["resort_open"] | false;
  out.skiOpen = doc["resort"]["ski_open"] | false;
  out.liftsOpen = doc["resort"]["lifts_open"].isNull() ? -1 : doc["resort"]["lifts_open"].as<int>();
  out.liftsTotal = doc["resort"]["lifts_total"].isNull() ? -1 : doc["resort"]["lifts_total"].as<int>();
  out.slopesOpen = doc["resort"]["slopes_open"].isNull() ? -1 : doc["resort"]["slopes_open"].as<int>();
  out.slopesTotal = doc["resort"]["slopes_total"].isNull() ? -1 : doc["resort"]["slopes_total"].as<int>();
  FrameText::normalizeUtf8ForDisplay(out.resortName, sizeof(out.resortName), doc["resort"]["name"] | "");

  out.powderFound = doc["next_powder_day"]["found"] | false;
  FrameText::normalizeUtf8ForDisplay(out.powderDate, sizeof(out.powderDate), doc["next_powder_day"]["display_date"] | "");
  out.powderLowCm = doc["next_powder_day"]["estimated_fresh_cm_low"].isNull() ? NAN : doc["next_powder_day"]["estimated_fresh_cm_low"].as<float>();
  out.powderHighCm = doc["next_powder_day"]["estimated_fresh_cm_high"].isNull() ? NAN : doc["next_powder_day"]["estimated_fresh_cm_high"].as<float>();
  out.powderMidCm = doc["next_powder_day"]["estimated_fresh_cm_mid"].isNull() ? NAN : doc["next_powder_day"]["estimated_fresh_cm_mid"].as<float>();
  return true;
}

void tick(uint8_t id) {
  SkiCache& cache = g_cache[id - 1];
  const uint32_t now = millis();
  if (cache.valid && (now - cache.fetchedAtMs) <= DEFAULT_REFRESH_MS) return;
  SkiCache fresh = cache;
  if (!fetchSki(id, fresh)) return;
  fresh.valid = true;
  fresh.fetchedAtMs = now;
  cache = fresh;
}

void snowText(const SkiCache& data, char* fresh, size_t freshSize, char* total, size_t totalSize) {
  char freshLabel[16] = {0};
  FrameText::normalizeUtf8ForDisplay(freshLabel, sizeof(freshLabel), data.norwegian ? "nysnø" : "fresh");
  if (isfinite(data.freshCm)) snprintf(fresh, freshSize, "%d cm %s", rounded(data.freshCm), freshLabel);
  else snprintf(fresh, freshSize, "-- cm %s", freshLabel);

  if (isfinite(data.totalCm)) snprintf(total, totalSize, "%d cm %s", rounded(data.totalCm), data.norwegian ? "totalt" : "total");
  else snprintf(total, totalSize, "-- cm %s", data.norwegian ? "totalt" : "total");
}

void conditionsText(const SkiCache& data, char* out, size_t outSize) {
  char temp[12] = "--";
  if (isfinite(data.tempC)) snprintf(temp, sizeof(temp), "%d", rounded(data.tempC));
  const int wind = isfinite(data.windMps) ? rounded(data.windMps) : -1;
  if (wind >= 0) snprintf(out, outSize, "%s°  ·  %s %d m/s", temp, windDirection(data.windDirDeg), wind);
  else snprintf(out, outSize, "%s°  ·  %s -- m/s", temp, windDirection(data.windDirDeg));
}

void avalancheText(const SkiCache& data, char* out, size_t outSize, bool shortForm = false) {
  if (data.avalancheAssessed && data.avalancheLevel > 0) {
    snprintf(out, outSize, "%s %d", data.norwegian ? "Skredfare" : "Avalanche", data.avalancheLevel);
  } else if (shortForm) {
    strlcpy(out, data.norwegian ? "Ikke vurdert" : "Not assessed", outSize);
  } else if (data.avalancheAvailable || data.avalancheLevel == 0) {
    strlcpy(out, data.norwegian ? "Skredfare ikke vurdert" : "Avalanche Not assessed", outSize);
  } else {
    strlcpy(out, data.norwegian ? "Skredfare utilgjengelig" : "Avalanche unavailable", outSize);
  }
}

bool resortText(const SkiCache& data, char* out, size_t outSize) {
  if (!data.resortAvailable) return false;
  const bool open = data.skiOpen || data.resortOpen;
  char status[16] = {0};
  FrameText::normalizeUtf8ForDisplay(
    status, sizeof(status),
    open ? (data.norwegian ? "åpent" : "open") : (data.norwegian ? "stengt" : "closed")
  );
  if (data.liftsOpen >= 0 && data.liftsTotal > 0) {
    snprintf(out, outSize, "%s%s%s · %d/%d %s",
      data.resortName[0] ? data.resortName : (data.norwegian ? "Anlegg" : "Resort"),
      data.resortName[0] ? " " : "",
      status,
      data.liftsOpen, data.liftsTotal, data.norwegian ? "heiser" : "lifts");
  } else {
    snprintf(out, outSize, "%s%s%s",
      data.resortName[0] ? data.resortName : (data.norwegian ? "Anlegg" : "Resort"),
      data.resortName[0] ? " " : "",
      status);
  }
  return true;
}

bool powderText(const SkiCache& data, char* out, size_t outSize) {
  if (!data.powderFound || !data.powderDate[0]) return false;
  if (isfinite(data.powderLowCm) && isfinite(data.powderHighCm)) {
    snprintf(out, outSize, "%s %s · %d-%d cm",
      data.norwegian ? "Neste pudderdag" : "Next powder",
      data.powderDate, rounded(data.powderLowCm), rounded(data.powderHighCm));
  } else if (isfinite(data.powderMidCm)) {
    snprintf(out, outSize, "%s %s · %d cm",
      data.norwegian ? "Neste pudderdag" : "Next powder",
      data.powderDate, rounded(data.powderMidCm));
  } else {
    snprintf(out, outSize, "%s %s", data.norwegian ? "Neste pudderdag" : "Next powder", data.powderDate);
  }
  return true;
}

void drawLocation(const Cell& c, int baseline, const SkiCache& data) {
  const char* location = data.location[0] ? data.location : "SKI";
  drawCenteredFitted(c, baseline, location, fittingLocationFont(c, location), 10);
}

void drawShallow(const Cell& c, const SkiCache& data) {
  char fresh[32], total[32], avalanche[48], conditions[40];
  snowText(data, fresh, sizeof(fresh), total, sizeof(total));
  avalancheText(data, avalanche, sizeof(avalanche), true);
  conditionsText(data, conditions, sizeof(conditions));

  drawLocation(c, c.y + 28, data);

  const int columns = c.w >= 650 ? 4 : c.w >= 360 ? 3 : 2;
  const char* values[4] = { fresh, total, avalanche, conditions };
  const int contentTop = c.y + 42;
  const int contentH = max(30, c.h - 48);
  for (int i = 0; i < columns; ++i) {
    const int x0 = c.x + (c.w * i) / columns;
    const int x1 = c.x + (c.w * (i + 1)) / columns;
    if (i > 0) DisplayCore::get().drawFastVLine(x0, contentTop + 5, max(8, contentH - 10), Theme::ink());
    char fit[64] = {0};
    fitTextToWidth(values[i], fit, sizeof(fit), max(30, x1 - x0 - 16), FONT_9);
    drawCenteredInRect(x0, contentTop, x1 - x0, contentH, fit, FONT_9);
  }
}

void drawNarrow(const Cell& c, const SkiCache& data) {
  char fresh[32], total[32], avalanche[48], conditions[40], resort[96], powder[96];
  snowText(data, fresh, sizeof(fresh), total, sizeof(total));
  avalancheText(data, avalanche, sizeof(avalanche));
  conditionsText(data, conditions, sizeof(conditions));

  drawLocation(c, c.y + 28, data);
  drawCenteredFitted(c, c.y + 74, fresh, FONT_B18, 8);
  drawCenteredFitted(c, c.y + 106, total, FONT_B12, 8);

  int y = c.y + 142;
  if (c.h >= 190) {
    drawCenteredFitted(c, y, conditions, FONT_9, 8);
    y += 34;
  }
  if (c.h >= 225) {
    drawCenteredFitted(c, y, avalanche, FONT_9, 8);
    y += 34;
  }
  if (c.h >= 300 && resortText(data, resort, sizeof(resort))) {
    drawCenteredFitted(c, y, resort, FONT_9, 8);
    y += 34;
  }
  if (c.h >= 350 && powderText(data, powder, sizeof(powder))) {
    drawCenteredFitted(c, y, powder, FONT_9, 8);
  }
}

void drawReference(const Cell& c, const SkiCache& data) {
  char fresh[32], total[32], avalanche[48], conditions[40];
  snowText(data, fresh, sizeof(fresh), total, sizeof(total));
  avalancheText(data, avalanche, sizeof(avalanche));
  conditionsText(data, conditions, sizeof(conditions));

  drawLocation(c, c.y + 29, data);
  drawCenteredFitted(c, c.y + 76, fresh, FONT_B18, 16);
  drawCenteredFitted(c, c.y + 111, total, FONT_B12, 16);
  DisplayCore::get().drawFastHLine(c.x + 34, c.y + 130, max(1, c.w - 68), Theme::ink());
  drawCenteredFitted(c, c.y + 169, conditions, FONT_B12, 18);
  drawCenteredFitted(c, c.y + 211, avalanche, FONT_B12, 18);
}

void drawExpanded(const Cell& c, const SkiCache& data) {
  char fresh[32], total[32], avalanche[48], conditions[40], resort[96], powder[96];
  snowText(data, fresh, sizeof(fresh), total, sizeof(total));
  avalancheText(data, avalanche, sizeof(avalanche));
  conditionsText(data, conditions, sizeof(conditions));

  drawLocation(c, c.y + 30, data);

  const int heroTop = c.y + 48;
  const int heroHeight = c.h >= 360 ? 88 : 66;
  drawCenteredInRect(c.x, heroTop, c.w / 2, heroHeight, fresh, FONT_B18);
  drawCenteredInRect(c.x + c.w / 2, heroTop, c.w - c.w / 2, heroHeight, total, FONT_B12);
  DisplayCore::get().drawFastVLine(c.x + c.w / 2, heroTop + 8, max(12, heroHeight - 16), Theme::ink());

  const int dividerY = heroTop + heroHeight + 4;
  DisplayCore::get().drawFastHLine(c.x + max(18, c.w / 14), dividerY, max(1, c.w - 2 * max(18, c.w / 14)), Theme::ink());

  int y = dividerY + (c.h >= 360 ? 44 : 34);
  drawCenteredFitted(c, y, conditions, FONT_B12, 18);
  y += c.h >= 360 ? 48 : 36;
  drawCenteredFitted(c, y, avalanche, FONT_B12, 18);
  y += c.h >= 360 ? 50 : 36;

  if (resortText(data, resort, sizeof(resort)) && y < c.y + c.h - 18) {
    drawCenteredFitted(c, y, resort, FONT_9, 18);
    y += c.h >= 360 ? 42 : 30;
  }
  if (powderText(data, powder, sizeof(powder)) && y < c.y + c.h - 10) {
    drawCenteredFitted(c, y, powder, FONT_9, 18);
  }
}

void drawUnavailable(const Cell& c) {
  drawCenteredBaseline(c, c.y + c.h / 2 - 8, "SKI", FONT_B12);
  drawCenteredBaseline(c, c.y + c.h / 2 + 24, "Data unavailable", FONT_9);
}
} // namespace

namespace ModuleSki {
void render(const Cell& c, const String& moduleName) {
  const uint8_t id = parseInstanceId(moduleName);
  tick(id);
  const SkiCache& data = g_cache[id - 1];
  if (!data.valid) {
    drawUnavailable(c);
    return;
  }

  const int colSpan = c.colSpan > 0 ? c.colSpan : max(1, c.w / 200);
  const int rowSpan = c.rowSpan > 0 ? c.rowSpan : max(1, c.h / 120);
  const int area = colSpan * rowSpan;

  if (c.h <= 150) {
    drawShallow(c, data);
  } else if (c.w <= 240) {
    drawNarrow(c, data);
  } else if (area <= 4 && c.w < 600 && c.h < 300) {
    drawReference(c, data);
  } else {
    drawExpanded(c, data);
  }
}
} // namespace ModuleSki
