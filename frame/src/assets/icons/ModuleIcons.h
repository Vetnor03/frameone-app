#pragma once
#include <Arduino.h>

namespace ModuleIcons {

  // Draws a weather icon centered at (cx, cy)
  void drawWeatherIcon(int cx, int cy, int size, int wmoCode);

  // -------------------------------
  // Surf: Wave icon (your spline blob)
  // -------------------------------

  enum PeriodBucket { PERIOD_SHORT, PERIOD_MEDIUM, PERIOD_LONG };

  // Bucket from period seconds
  PeriodBucket getPeriodBucket(float periodSeconds);

  // Draw period-based wave icon inside a box (x,y,w,h)
  void drawSurfWavePeriodIcon(int x, int y, int w, int h, float periodSeconds);

  // (Optional) if you want to call by bucket directly
  void drawSurfWaveBucketIcon(int x, int y, int w, int h, PeriodBucket bucket);

  void drawSurfDiceRatingIcon(int x, int y, int size, int value);

  // -------------------------------
  // Surf: Wind icon (crisp + wider)
  // -------------------------------

  // Old API (square). Still supported.
  void drawWindIcon(int x, int y, int size);

  // New API: draw inside a box (x,y,w,h), more uniform/wider.
  void drawWindIconBox(int x, int y, int w, int h, int stroke);

  //XL SURF ICONS
  void drawWaterDropIcon(int x, int y, int w, int h);
  void drawCelsiusIcon(int x, int y, int size);        // small "°C" mark
  void drawSunUpDownIcon(int x, int y, int w, int h);

} // namespace ModuleIcons