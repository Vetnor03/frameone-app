#include "Theme.h"
#include <GxEPD2_GFX.h>

static ThemeKey g_theme = THEME_DARK;
static uint16_t g_paper = GxEPD_WHITE;
static uint16_t g_ink = GxEPD_BLACK;

void Theme::set(ThemeKey t) {
  g_theme = t;
  if (t == THEME_DARK) {
    g_paper = GxEPD_BLACK;
    g_ink = GxEPD_WHITE;
  } else {
    g_paper = GxEPD_WHITE;
    g_ink = GxEPD_BLACK;
  }
}

ThemeKey Theme::get() { return g_theme; }
uint16_t Theme::paper() { return g_paper; }
uint16_t Theme::ink() { return g_ink; }
