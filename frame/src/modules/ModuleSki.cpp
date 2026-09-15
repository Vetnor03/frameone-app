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
constexpr uint32_t DEFAULT_REFRESH_MS = 1800000UL;
constexpr size_t SKI_JSON_CAPACITY = 2048;

struct SkiCache {
  bool valid = false;
  uint32_t fetchedAtMs = 0;
  char location[80] = {0};
  float freshCm = NAN;
  float totalCm = NAN;
  float tempC = NAN;
  float windMps = NAN;
  float windDirDeg = NAN;
  bool avalancheAvailable = false;
  bool avalancheAssessed = false;
  int avalancheLevel = 0;
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

bool isReference2x2(const Cell& c) {
  return c.size == CELL_MEDIUM || (c.colSpan == 2 && c.rowSpan == 2) || (c.w == 400 && c.h == 240);
}

void measureText(const char* text, const GFXfont* font, int16_t& x1, int16_t& y1, uint16_t& w, uint16_t& h) {
  auto& d = DisplayCore::get();
  d.setFont(font);
  d.setTextSize(1);
  d.getTextBounds(text, 0, 0, &x1, &y1, &w, &h);
}

void drawCenteredBaseline(const Cell& c, int baseline, const char* text, const GFXfont* font) {
  auto& d = DisplayCore::get();
  int16_t x1, y1; uint16_t w, h;
  measureText(text, font, x1, y1, w, h);
  d.setFont(font);
  d.setTextSize(1);
  d.setTextColor(Theme::ink());
  d.setCursor(c.x + (c.w - static_cast<int>(w)) / 2 - x1, baseline);
  d.print(text);
  d.setFont(nullptr);
}

const GFXfont* fittingLocationFont(const Cell& c, const char* text) {
  int16_t x1, y1; uint16_t w, h;
  measureText(text, FONT_B12, x1, y1, w, h);
  return static_cast<int>(w) <= c.w - 32 ? FONT_B12 : FONT_9;
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
  if (body.length() == 0 || body.length() > 4096) return false;

  DynamicJsonDocument doc(SKI_JSON_CAPACITY);
  if (deserializeJson(doc, body)) return false;

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

void drawConditions(const Cell& c, int baseline, const SkiCache& data) {
  char temp[16] = "--";
  char wind[24] = "-- -- m/s";
  if (isfinite(data.tempC)) snprintf(temp, sizeof(temp), "%d", rounded(data.tempC));
  if (isfinite(data.windMps)) snprintf(wind, sizeof(wind), "%s %d m/s", windDirection(data.windDirDeg), rounded(data.windMps));
  else snprintf(wind, sizeof(wind), "%s -- m/s", windDirection(data.windDirDeg));

  int16_t tx1, ty1, wx1, wy1; uint16_t tw, th, ww, wh;
  measureText(temp, FONT_B12, tx1, ty1, tw, th);
  measureText(wind, FONT_B12, wx1, wy1, ww, wh);
  const int degreeGap = 8;
  const int separatorGap = 24;
  const int totalW = static_cast<int>(tw) + degreeGap + separatorGap + static_cast<int>(ww);
  int x = c.x + (c.w - totalW) / 2;
  auto& d = DisplayCore::get();
  d.setFont(FONT_B12); d.setTextColor(Theme::ink()); d.setTextSize(1);
  d.setCursor(x - tx1, baseline); d.print(temp);
  const int degreeX = x + static_cast<int>(tw) + 1;
  d.drawCircle(degreeX + 2, baseline - 15, 2, Theme::ink());
  const int dotX = degreeX + degreeGap + separatorGap / 2;
  d.fillCircle(dotX, baseline - 7, 2, Theme::ink());
  const int windX = x + static_cast<int>(tw) + degreeGap + separatorGap;
  d.setCursor(windX - wx1, baseline); d.print(wind);
  d.setFont(nullptr);
}

void drawAvalanche(const Cell& c, int baseline, const SkiCache& data) {
  char text[40] = {0};
  if (data.avalancheAssessed && data.avalancheLevel > 0) snprintf(text, sizeof(text), "Avalanche %d", data.avalancheLevel);
  else if (data.avalancheAvailable || data.avalancheLevel == 0) strlcpy(text, "Avalanche Not assessed", sizeof(text));
  else strlcpy(text, "Avalanche unavailable", sizeof(text));

  int16_t x1, y1; uint16_t tw, th;
  measureText(text, FONT_B12, x1, y1, tw, th);
  const int iconW = 18;
  const int gap = 8;
  const int totalW = iconW + gap + static_cast<int>(tw);
  const int startX = c.x + (c.w - totalW) / 2;
  auto& d = DisplayCore::get();
  const int top = baseline - 19;
  d.drawTriangle(startX + iconW / 2, top, startX, baseline - 2, startX + iconW, baseline - 2, Theme::ink());
  d.setFont(FONT_B12); d.setTextSize(1); d.setTextColor(Theme::ink());
  d.setCursor(startX + iconW + gap - x1, baseline); d.print(text);
  d.setFont(nullptr);
}

void drawUnavailable(const Cell& c) {
  drawCenteredBaseline(c, c.y + c.h / 2 - 8, "SKI", FONT_B12);
  drawCenteredBaseline(c, c.y + c.h / 2 + 24, "Data unavailable", FONT_9);
}

void drawReference(const Cell& c, const SkiCache& data) {
  char fresh[32];
  char total[32];
  if (isfinite(data.freshCm)) snprintf(fresh, sizeof(fresh), "%d cm fresh", rounded(data.freshCm)); else strlcpy(fresh, "-- cm fresh", sizeof(fresh));
  if (isfinite(data.totalCm)) snprintf(total, sizeof(total), "%d cm total", rounded(data.totalCm)); else strlcpy(total, "-- cm total", sizeof(total));

  drawCenteredBaseline(c, c.y + 29, data.location[0] ? data.location : "SKI", fittingLocationFont(c, data.location[0] ? data.location : "SKI"));
  drawCenteredBaseline(c, c.y + 76, fresh, FONT_B18);
  drawCenteredBaseline(c, c.y + 111, total, FONT_B12);
  DisplayCore::get().drawFastHLine(c.x + 34, c.y + 130, c.w - 68, Theme::ink());
  drawConditions(c, c.y + 169, data);
  drawAvalanche(c, c.y + 211, data);
}
}

namespace ModuleSki {
void render(const Cell& c, const String& moduleName) {
  if (!isReference2x2(c)) return;
  const uint8_t id = parseInstanceId(moduleName);
  tick(id);
  const SkiCache& data = g_cache[id - 1];
  if (!data.valid) { drawUnavailable(c); return; }
  drawReference(c, data);
}
}
