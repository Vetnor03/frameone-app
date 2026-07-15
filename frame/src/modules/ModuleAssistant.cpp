#include "ModuleAssistant.h"

#include "DisplayCore.h"
#include "Theme.h"
#include "Config.h"
#include "DeviceIdentity.h"
#include "NetClient.h"

#include "Fonts/FreeSans9ptNO.h"
#include "Fonts/FreeSansBold12ptNO.h"
#include "Fonts/FreeSansBold18ptNO.h"

#include <ArduinoJson.h>
#include <string.h>

#define FONT_B9  (&FreeSans9pt8b)
#define FONT_B12 (&FreeSansBold12pt8b)
#define FONT_B18 (&FreeSansBold18pt8b)

namespace ModuleAssistant {

static const FrameConfig* g_cfg = nullptr;
static const int MAX_WATCH_REQUESTS = 5;

struct AssistantUpdate {
  char headline[96] = {0};
  char summary[192] = {0};
  char createdAt[32] = {0};
};

struct AssistantCache {
  bool loaded = false;
  bool ok = false;
  bool hasUpdate = false;
  AssistantUpdate selected;
  int activeWatchCount = 0;
  int requestCount = 0;
  char requests[MAX_WATCH_REQUESTS][80] = {{0}};
};

static AssistantCache g_cache;

void setConfig(const FrameConfig* cfg) {
  g_cfg = cfg;
}

static String urlEncode(const char* s) {
  if (!s) return "";
  String out;
  const char* hex = "0123456789ABCDEF";
  for (size_t i = 0; s[i]; i++) {
    uint8_t c = (uint8_t)s[i];
    bool safe = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' || c == '~';
    if (safe) out += (char)c;
    else { out += '%'; out += hex[(c >> 4) & 0xF]; out += hex[c & 0xF]; }
  }
  return out;
}

static void safeCopy(char* dst, size_t n, const char* src) {
  if (!dst || n == 0) return;
  if (!src) { dst[0] = '\0'; return; }
  strlcpy(dst, src, n);
}

static bool loadData() {
  if (g_cache.loaded) return g_cache.ok;
  g_cache = AssistantCache{};
  g_cache.loaded = true;

  String url = String(BASE_URL) + "/api/device/assistant?device_id=" + urlEncode(DeviceIdentity::getDeviceId().c_str());
  int code = 0;
  String body;
  bool httpOk = NetClient::httpGetAuth(url, DeviceIdentity::getToken(), code, body);
  if (!httpOk || code != 200) {
    Serial.print("assistant HTTP: ");
    Serial.println(code);
    return false;
  }
  if (body.length() > 8192) {
    Serial.println("assistant JSON too large");
    return false;
  }

  StaticJsonDocument<8192> doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    Serial.println("assistant JSON parse failed");
    return false;
  }

  JsonArray items = doc["items"].as<JsonArray>();
  if (!items.isNull() && items.size() > 0) {
    JsonObject first = items[0].as<JsonObject>();
    safeCopy(g_cache.selected.headline, sizeof(g_cache.selected.headline), first["headline"] | "");
    safeCopy(g_cache.selected.summary, sizeof(g_cache.selected.summary), first["summary"] | "");
    safeCopy(g_cache.selected.createdAt, sizeof(g_cache.selected.createdAt), first["created_at"] | "");
    g_cache.hasUpdate = g_cache.selected.headline[0] != '\0';
  }

  g_cache.activeWatchCount = doc["activeWatchCount"] | 0;
  JsonArray reqs = doc["activeWatchRequests"].as<JsonArray>();
  if (!reqs.isNull()) {
    for (JsonVariant v : reqs) {
      if (g_cache.requestCount >= MAX_WATCH_REQUESTS) break;
      const char* txt = v.as<const char*>();
      if (!txt || !txt[0]) continue;
      safeCopy(g_cache.requests[g_cache.requestCount], sizeof(g_cache.requests[g_cache.requestCount]), txt);
      g_cache.requestCount++;
    }
  }

  g_cache.ok = true;
  return true;
}

static void textAt(int x, int baselineY, const char* text, const GFXfont* font) {
  auto& d = DisplayCore::get();
  d.setTextColor(Theme::ink());
  d.setFont(font);
  d.setTextSize(1);
  d.setCursor(x, baselineY);
  d.print(text ? text : "");
  d.setFont(nullptr);
}

static int textWidth(const char* text, const GFXfont* font) {
  auto& d = DisplayCore::get();
  int16_t x1, y1; uint16_t w, h;
  d.setFont(font); d.setTextSize(1); d.getTextBounds(text ? text : "", 0, 0, &x1, &y1, &w, &h);
  return (int)w;
}

static void fitText(const char* in, char* out, size_t outSize, const GFXfont* font, int maxW) {
  safeCopy(out, outSize, in);
  if (!out || outSize == 0) return;
  while (out[0] && textWidth(out, font) > maxW) {
    size_t len = strlen(out);
    if (len <= 2) { out[0] = '\0'; break; }
    out[len - 1] = '\0';
  }
  size_t len = strlen(out);
  if (len + 4 < outSize && in && strlen(in) > len) strcat(out, "...");
}

static void drawLineFit(int x, int y, int w, const char* text, const GFXfont* font) {
  char buf[160];
  fitText(text, buf, sizeof(buf), font, w);
  textAt(x, y, buf, font);
}

static void drawEmpty(const Cell& c, const char* detail) {
  const int pad = 14;
  drawLineFit(c.x + pad, c.y + 28, c.w - pad * 2, "AI ASSISTANT", FONT_B12);
  drawLineFit(c.x + pad, c.y + c.h / 2 + 8, c.w - pad * 2, detail, FONT_B9);
}

static void drawSelected(const Cell& c, int x, int y, int w, int h, bool includeSummary) {
  drawLineFit(x, y + 24, w, "AI ASSISTANT", FONT_B12);
  if (!g_cache.hasUpdate) {
    drawLineFit(x, y + h / 2 + 4, w, "NOTHING NEW", FONT_B18);
    return;
  }
  drawLineFit(x, y + 58, w, g_cache.selected.headline, FONT_B18);
  if (includeSummary && g_cache.selected.summary[0]) {
    drawLineFit(x, y + 88, w, g_cache.selected.summary, FONT_B9);
    drawLineFit(x, y + 110, w, g_cache.selected.createdAt, FONT_B9);
  } else if (g_cache.selected.createdAt[0]) {
    drawLineFit(x, y + 84, w, g_cache.selected.createdAt, FONT_B9);
  }
}

static void drawFollowing(const Cell& c, int x, int y, int w, int h) {
  drawLineFit(x, y + 24, w, "FOLLOWING", FONT_B12);
  if (g_cache.requestCount <= 0) {
    drawLineFit(x, y + h / 2, w, "No active Watch requests", FONT_B9);
    return;
  }
  int lineY = y + 52;
  for (int i = 0; i < g_cache.requestCount && i < MAX_WATCH_REQUESTS; i++) {
    char line[96];
    snprintf(line, sizeof(line), "- %s", g_cache.requests[i]);
    drawLineFit(x, lineY, w, line, FONT_B9);
    lineY += 22;
    if (lineY > y + h - 8) break;
  }
}

void render(const Cell& c, const String& moduleName) {
  (void)g_cfg;
  (void)moduleName;
  const bool ok = loadData();
  if (!ok) {
    drawEmpty(c, "Assistant unavailable");
    return;
  }

  const int pad = (c.size == CELL_SMALL) ? 10 : 16;
  if (c.size == CELL_LARGE || c.size == CELL_XL) {
    const int leftW = (c.w - pad * 3) / 2;
    const int rightX = c.x + pad * 2 + leftW;
    drawSelected(c, c.x + pad, c.y + pad, leftW, c.h - pad * 2, true);
    drawFollowing(c, rightX, c.y + pad, c.w - (rightX - c.x) - pad, c.h - pad * 2);
    return;
  }

  if (c.size == CELL_MEDIUM) {
    drawSelected(c, c.x + pad, c.y + pad, c.w - pad * 2, c.h - pad * 2, true);
    return;
  }

  drawLineFit(c.x + pad, c.y + 22, c.w - pad * 2, "AI ASSISTANT", FONT_B12);
  drawLineFit(c.x + pad, c.y + 50, c.w - pad * 2, g_cache.hasUpdate ? g_cache.selected.headline : "NOTHING NEW", FONT_B12);
}

} // namespace ModuleAssistant
