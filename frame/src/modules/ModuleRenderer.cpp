#include "ModuleRenderer.h"
#include "DisplayCore.h"
#include "Theme.h"

// Module entrypoints
#include "ModuleDate.h"
#include "ModuleDateAdaptive.h"
#include "ModuleWeather.h"
#include "ModuleSurf.h"
#include "ModuleReminders.h"
#include "ModuleCountdown.h"
#include "ModuleSoccer.h"
#include "ModuleStocks.h"
#include "ModuleGroceries.h"

// Simple smooth placeholder font (keep UI consistent)
#include <Fonts/FreeSansBold12pt7b.h>
#include <Fonts/FreeSansBold18pt7b.h>

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

static const GFXfont* plusFontForCell(const Cell& c) {
  switch (c.size) {
    case CELL_SMALL:
      return &FreeSansBold12pt7b;
    case CELL_MEDIUM:
    case CELL_LARGE:
    case CELL_XL:
    default:
      return &FreeSansBold18pt7b;
  }
}

static bool sameAsciiIgnoreCase(const char* a, const char* b) {
  if (!a || !b) return false;
  while (*a && *b) {
    char ca = *a++;
    char cb = *b++;
    if (ca >= 'A' && ca <= 'Z') ca = (char)(ca - 'A' + 'a');
    if (cb >= 'A' && cb <= 'Z') cb = (char)(cb - 'A' + 'a');
    if (ca != cb) return false;
  }
  return *a == '\0' && *b == '\0';
}

static bool isAnchorGeometry(const Cell& c) {
  return (c.colSpan == 4 && c.rowSpan == 1) ||
         (c.colSpan == 2 && c.rowSpan == 2) ||
         (c.colSpan == 4 && c.rowSpan == 2) ||
         (c.colSpan == 4 && c.rowSpan == 4);
}

const char* ModuleRenderer::moduleNameForSlot(const SlotModule* assigns, int assignCount, uint8_t slot) {
  if (!assigns || assignCount <= 0) return nullptr;
  for (int i = 0; i < assignCount; i++) {
    if (assigns[i].slot == slot) return assigns[i].module;
  }
  return nullptr;
}

String ModuleRenderer::moduleForSlot(const SlotModule* assigns, int assignCount, uint8_t slot) {
  const char* module = moduleNameForSlot(assigns, assignCount, slot);
  return module ? String(module) : String("");
}

bool ModuleRenderer::canRenderCell(const char* module, const Cell& cell) {
  if (!module || module[0] == '\0') return false;
  // All four handmade anchor geometries preserve their existing renderer behavior.
  if (isAnchorGeometry(cell)) return true;
  // Phase E1: only Date owns a physical responsive renderer outside the anchors.
  return sameAsciiIgnoreCase(module, "date");
}

void ModuleRenderer::renderPlaceholders(const SlotModule* assigns, int assignCount, const Cell* cells, int n) {
  if (!cells || n <= 0) return;

  auto& d = DisplayCore::get();
  d.setTextColor(Theme::ink());
  d.setFont(nullptr);
  d.setTextSize(1);

  for (int i = 0; i < n; i++) {
    const Cell& c = cells[i];
    String mod = moduleForSlot(assigns, assignCount, c.slot);

    // Empty cell -> centered "+"
    if (mod.length() == 0) {
      drawCenteredLine(c.x, c.y, c.w, c.h, "+", plusFontForCell(c), Theme::ink());
      continue;
    }

    // Dispatch modules here. Date keeps its four handmade anchor paths exactly;
    // non-anchor Date geometry goes through the dedicated Phase E1 renderer.
    if (mod.equalsIgnoreCase("date")) {
      if (isAnchorGeometry(c)) ModuleDate::render(c);
      else ModuleDateAdaptive::render(c);
      continue;
    }

    if (mod.startsWith("weather")) {
      ModuleWeather::render(c, mod);
      continue;
    }

    if (mod.startsWith("surf")) {
      ModuleSurf::render(c, mod);
      continue;
    }

    if (mod.startsWith("reminders")) {
      ModuleReminders::render(c, mod);
      continue;
    }

    if (mod.startsWith("countdown")) {
      ModuleCountdown::render(c, mod);
      continue;
    }

    if (mod.startsWith("soccer")) {
      ModuleSoccer::render(c, mod);
      continue;
    }

    if (mod.startsWith("stocks")) {
      ModuleStocks::render(c, mod);
      continue;
    }

    if (mod.startsWith("groceries")) {
      ModuleGroceries::render(c, mod);
      continue;
    }

    // Placeholder for not-yet-built modules
    drawCenteredLine(c.x, c.y, c.w, c.h, mod.c_str(), &FreeSansBold12pt7b, Theme::ink());
  }
}
