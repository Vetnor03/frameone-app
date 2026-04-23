#include "ModuleStocks.h"
#include "DisplayCore.h"
#include "Theme.h"

#include "Fonts/FreeSansBold12ptNO.h"
#include "Fonts/FreeSansBold18ptNO.h"

namespace ModuleStocks {

static const FrameConfig* g_cfg = nullptr;

static uint8_t parseInstanceId(const String& moduleName) {
  int idx = moduleName.indexOf(':');
  if (idx < 0) return 1;
  int id = moduleName.substring(idx + 1).toInt();
  if (id < 1) id = 1;
  if (id > 255) id = 255;
  return (uint8_t)id;
}

static const StocksModuleConfig* findById(uint8_t id) {
  if (!g_cfg) return nullptr;

  for (int i = 0; i < (int)g_cfg->stocksCount && i < 4; i++) {
    const StocksModuleConfig& s = g_cfg->stocks[i];
    if (s.id == id) return &s;
  }

  return nullptr;
}

static void measureText(const char* text, const GFXfont* font,
                        int16_t& x1, int16_t& y1, uint16_t& w, uint16_t& h) {
  auto& d = DisplayCore::get();
  d.setFont(font);
  d.setTextSize(1);
  d.getTextBounds(text ? text : "", 0, 0, &x1, &y1, &w, &h);
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
  d.print(text ? text : "");
  d.setFont(nullptr);
  d.setTextSize(1);
}

void setConfig(const FrameConfig* cfg) {
  g_cfg = cfg;
}

void render(const Cell& c, const String& moduleName) {
  const uint8_t id = parseInstanceId(moduleName);
  const StocksModuleConfig* stock = findById(id);

  if (!stock) {
    drawCenteredLine(c.x, c.y, c.w, c.h, "No stock", &FreeSansBold12pt8b, Theme::ink());
    return;
  }

  const char* symbol = stock->symbol[0] ? stock->symbol : "";
  const char* name = stock->name[0] ? stock->name : "";

  if (!symbol[0] && !name[0]) {
    drawCenteredLine(c.x, c.y, c.w, c.h, "No stock", &FreeSansBold12pt8b, Theme::ink());
    return;
  }

  if (c.size == CELL_SMALL) {
    drawCenteredLine(c.x, c.y, c.w, c.h, name[0] ? name : symbol, &FreeSansBold12pt8b, Theme::ink());
    return;
  }

  const bool hasBoth = name[0] && symbol[0];
  if (!hasBoth || strcmp(name, symbol) == 0) {
    drawCenteredLine(c.x, c.y, c.w, c.h, name[0] ? name : symbol, &FreeSansBold18pt8b, Theme::ink());
    return;
  }

  int topH = c.h / 2;
  if (topH < 30) topH = c.h / 2;
  int bottomH = c.h - topH;

  drawCenteredLine(c.x, c.y, c.w, topH, name, &FreeSansBold12pt8b, Theme::ink());
  drawCenteredLine(c.x, c.y + topH, c.w, bottomH, symbol, &FreeSansBold12pt8b, Theme::ink());
}

} // namespace ModuleStocks
