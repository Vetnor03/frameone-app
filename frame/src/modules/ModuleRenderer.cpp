#include "ModuleRenderer.h"
#include "DisplayCore.h"
#include "Theme.h"

// Module entrypoints
#include "ModuleDate.h"
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

String ModuleRenderer::moduleForSlot(const SlotModule* assigns, int assignCount, uint8_t slot) {
  if (!assigns || assignCount <= 0) return "";
  for (int i = 0; i < assignCount; i++) {
    if (assigns[i].slot == slot) return String(assigns[i].module);
  }
  return "";
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

    // Dispatch modules here
    if (mod.equalsIgnoreCase("date")) {
      ModuleDate::render(c);
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
