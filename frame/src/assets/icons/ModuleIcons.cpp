#include "ModuleIcons.h"
#include "DisplayCore.h"
#include "Theme.h"
#include <math.h>

// =========================================================
// Shared helpers
// =========================================================
static inline int clampi(int v, int lo, int hi) { return (v < lo) ? lo : (v > hi) ? hi : v; }

// "Thick line" for mostly horizontal/vertical use.
static void thickLine(int x1, int y1, int x2, int y2, int t, uint16_t col) {
  auto& d = DisplayCore::get();
  if (t <= 1) { d.drawLine(x1, y1, x2, y2, col); return; }

  if (y1 == y2) {
    for (int o = -t/2; o <= t/2; o++) d.drawLine(x1, y1 + o, x2, y2 + o, col);
    return;
  }
  if (x1 == x2) {
    for (int o = -t/2; o <= t/2; o++) d.drawLine(x1 + o, y1, x2 + o, y2, col);
    return;
  }

  for (int o = -t/2; o <= t/2; o++) {
    d.drawLine(x1 + o, y1, x2 + o, y2, col);
    d.drawLine(x1, y1 + o, x2, y2 + o, col);
  }
}

// Axis-aligned filled "thick segment" (crisp, no rounded caps)
static void thickH(int x1, int x2, int y, int t, uint16_t col) {
  auto& d = DisplayCore::get();
  if (x2 < x1) { int tmp = x1; x1 = x2; x2 = tmp; }
  int hh = clampi(t, 1, 20);
  int yTop = y - hh/2;
  d.fillRect(x1, yTop, (x2 - x1) + 1, hh, col);
}

// =========================================================
// Weather icon implementation
// =========================================================
static void drawSun(int cx, int cy, int s, uint16_t col) {
  auto& d = DisplayCore::get();

  int r = (int)lroundf(s * 0.20f);
  d.fillCircle(cx, cy, r, col);

  int t = clampi(s / 17, 2, 6);
  int rayGap = clampi((int)lroundf(s * 0.12f), 4, 14);
  int rayLen = clampi((int)lroundf(s * 0.13f), 4, 18);

  for (int i = 0; i < 8; i++) {
    float a = (float)i * (2.0f * (float)M_PI / 8.0f);

    float dx = cosf(a);
    float dy = sinf(a);

    int x1 = cx + (int)lroundf(dx * (r + rayGap));
    int y1 = cy + (int)lroundf(dy * (r + rayGap));
    int x2 = cx + (int)lroundf(dx * (r + rayGap + rayLen));
    int y2 = cy + (int)lroundf(dy * (r + rayGap + rayLen));

    thickLine(x1, y1, x2, y2, t, col);
  }
}

static void drawCloud4Bumps(int x, int y, int s, uint16_t col) {
  auto& d = DisplayCore::get();

  float scale = 0.92f;
  int baseX = x + (int)(s * 0.08f);
  int baseY = y + (int)(s * 0.58f);
  int baseW = (int)(s * (0.84f * scale));
  int baseH = (int)(s * (0.26f * scale));
  int rr    = (int)(s * (0.14f * scale));
  d.fillRoundRect(baseX, baseY, baseW, baseH, rr, col);

  int b1x = x + (int)(s * 0.26f);
  int b1y = y + (int)(s * 0.60f);
  int b1r = (int)(s * 0.16f * scale);

  int b2x = x + (int)(s * 0.42f);
  int b2y = y + (int)(s * 0.50f);
  int b2r = (int)(s * 0.22f * scale);

  int b3x = x + (int)(s * 0.58f);
  int b3y = y + (int)(s * 0.54f);
  int b3r = (int)(s * 0.19f * scale);

  int b4x = x + (int)(s * 0.74f);
  int b4y = y + (int)(s * 0.62f);
  int b4r = (int)(s * 0.15f * scale);

  d.fillCircle(b1x, b1y, b1r, col);
  d.fillCircle(b2x, b2y, b2r, col);
  d.fillCircle(b3x, b3y, b3r, col);
  d.fillCircle(b4x, b4y, b4r, col);
}

static void drawCloud4BumpsCutout(int x, int y, int s, uint16_t bgCol) {
  int t = clampi(s / 42, 1, 2);

  for (int dy = -t; dy <= t; dy++) {
    for (int dx = -t; dx <= t; dx++) {
      if (dx == 0 && dy == 0) continue;
      if (abs(dx) + abs(dy) > t) continue;
      drawCloud4Bumps(x + dx, y + dy, s, bgCol);
    }
  }
}

static void drawRaindrop(int cx, int cy, int h, int w, uint16_t col) {
  auto& d = DisplayCore::get();
  d.fillCircle(cx, cy + h/4, w/2, col);
  d.fillTriangle(cx, cy - h/2, cx - w/2, cy + h/6, cx + w/2, cy + h/6, col);
}

static void drawSnowflake(int cx, int cy, int r, int s, uint16_t col) {
  int t = clampi(s / 24, 2, 4);
  for (int i = 0; i < 6; i++) {
    float a = (float)i * ((float)M_PI / 3.0f);
    int x2 = cx + (int)lroundf(cosf(a) * r);
    int y2 = cy + (int)lroundf(sinf(a) * r);
    thickLine(cx, cy, x2, y2, t, col);
  }
}

static void drawBolt(int x, int y, int s, uint16_t col) {
  auto& d = DisplayCore::get();
  int w = (int)(s * 0.45f);
  int h = (int)(s * 0.70f);
  int x0 = x + (s - w)/2;
  int y0 = y + (s - h)/2;

  d.fillTriangle(x0 + (int)(w*0.55f), y0,
                 x0 + w,              y0 + (int)(h*0.40f),
                 x0 + (int)(w*0.60f), y0 + (int)(h*0.40f), col);

  d.fillTriangle(x0 + (int)(w*0.45f), y0 + (int)(h*0.35f),
                 x0 + (int)(w*0.05f), y0 + h,
                 x0 + (int)(w*0.42f), y0 + (int)(h*0.62f), col);

  thickLine(x0 + (int)(w*0.55f), y0, x0 + w, y0 + (int)(h*0.40f), clampi(s/28,2,4), col);
}

static int wmoToIconKind(int wmo) {
  if (wmo == 0) return 0;
  if (wmo == 1 || wmo == 2) return 1;
  if (wmo == 3) return 2;
  if (wmo == 45 || wmo == 48) return 7;
  if ((wmo >= 51 && wmo <= 65) || (wmo >= 80 && wmo <= 82)) return 3;
  if (wmo == 66 || wmo == 67) return 6;
  if ((wmo >= 71 && wmo <= 77) || wmo == 85 || wmo == 86) return 4;
  if (wmo == 95 || wmo == 96 || wmo == 99) return 5;
  return 2;
}

// =========================================================
// Dice helpers
// =========================================================
static void drawDicePip(int cx, int cy, int r, uint16_t col) {
  DisplayCore::get().fillCircle(cx, cy, r, col);
}

static void drawDiceFaceInternal(int x, int y, int size, int value) {
  auto& d = DisplayCore::get();

  int s  = clampi(size, 14, 56);
  int rr = clampi((int)lroundf(s * 0.18f), 3, 10);

  // No border at all.
  // Dark mode: white body + black dots.
  // Light mode: black body + white dots.
  const uint16_t bodyCol = Theme::ink();
  const uint16_t pipCol  = Theme::paper();

  d.fillRoundRect(x, y, s, s, rr, bodyCol);

  int cx = x + s / 2;
  int cy = y + s / 2;

  int off  = clampi((int)lroundf(s * 0.24f), 3, 12);
  int pipR = clampi((int)lroundf(s * 0.055f), 1, 3);

  int lx = cx - off;
  int mx = cx;
  int rx = cx + off;

  int ty = cy - off;
  int my = cy;
  int by = cy + off;

  value = clampi(value, 1, 6);

  switch (value) {
    case 1:
      drawDicePip(mx, my, pipR, pipCol);
      break;

    case 2:
      drawDicePip(lx, ty, pipR, pipCol);
      drawDicePip(rx, by, pipR, pipCol);
      break;

    case 3:
      drawDicePip(lx, ty, pipR, pipCol);
      drawDicePip(mx, my, pipR, pipCol);
      drawDicePip(rx, by, pipR, pipCol);
      break;

    case 4:
      drawDicePip(lx, ty, pipR, pipCol);
      drawDicePip(rx, ty, pipR, pipCol);
      drawDicePip(lx, by, pipR, pipCol);
      drawDicePip(rx, by, pipR, pipCol);
      break;

    case 5:
      drawDicePip(lx, ty, pipR, pipCol);
      drawDicePip(rx, ty, pipR, pipCol);
      drawDicePip(mx, my, pipR, pipCol);
      drawDicePip(lx, by, pipR, pipCol);
      drawDicePip(rx, by, pipR, pipCol);
      break;

    default:
      drawDicePip(lx, ty, pipR, pipCol);
      drawDicePip(lx, my, pipR, pipCol);
      drawDicePip(lx, by, pipR, pipCol);
      drawDicePip(rx, ty, pipR, pipCol);
      drawDicePip(rx, my, pipR, pipCol);
      drawDicePip(rx, by, pipR, pipCol);
      break;
  }
}

namespace ModuleIcons {

void drawWeatherIcon(int cx, int cy, int size, int wmo) {
  auto& d = DisplayCore::get();
  (void)d;
  uint16_t col = Theme::ink();
  uint16_t bg  = Theme::paper();

  int s = clampi(size, 18, 240);
  int x = cx - s/2;
  int y = cy - s/2;

  // Main global spacing below the cloud.
  // Increased from ~0.060f to ~0.100f so all "below cloud" elements sit lower.
  int belowGap = clampi((int)lroundf(s * 0.100f), 4, 22);

  // Extra per-element nudges downward.
  int rainExtra    = clampi((int)lroundf(s * 0.040f), 1, 10);
  int snowExtra    = clampi((int)lroundf(s * 0.040f), 1, 10);
  int thunderExtra = clampi((int)lroundf(s * 0.050f), 1, 12);
  int sleetExtra   = clampi((int)lroundf(s * 0.040f), 1, 10);
  int fogExtra     = clampi((int)lroundf(s * 0.035f), 1, 9);

  int kind = wmoToIconKind(wmo);

  switch (kind) {
    case 0: {
      drawSun(cx, cy, s, col);
    } break;

    case 1: {
      int sunCx = x + (int)(s * 0.62f);
      int sunCy = y + (int)(s * 0.30f);
      drawSun(sunCx, sunCy, s, col);
      drawCloud4BumpsCutout(x, y, s, bg);
      drawCloud4Bumps(x, y, s, col);
    } break;

    case 2: {
      drawCloud4Bumps(x, y, s, col);
    } break;

    case 3: { // rain
      drawCloud4Bumps(x, y, s, col);
      int dropH = (int)(s * 0.18f);
      int dropW = (int)(s * 0.09f);
      int y0 = y + (int)(s * 0.80f) + belowGap + rainExtra;

      drawRaindrop(x + (int)(s * 0.34f), y0,                    dropH, dropW, col);
      drawRaindrop(x + (int)(s * 0.52f), y0 + (int)(s * 0.02f), dropH, dropW, col);
      drawRaindrop(x + (int)(s * 0.70f), y0,                    dropH, dropW, col);
    } break;

    case 4: { // snow
      drawCloud4Bumps(x, y, s, col);
      int r = (int)(s * 0.08f);
      int y0 = y + (int)(s * 0.82f) + belowGap + snowExtra;

      drawSnowflake(x + (int)(s * 0.36f), y0, r, s, col);
      drawSnowflake(x + (int)(s * 0.54f), y0, r, s, col);
      drawSnowflake(x + (int)(s * 0.72f), y0, r, s, col);
    } break;

    case 5: { // thunder
      drawCloud4Bumps(x, y, s, col);
      int boltS = (int)(s * 0.36f);
      drawBolt(x + (s - boltS)/2,
               y + (int)(s * 0.60f) + belowGap + thunderExtra,
               boltS, col);
    } break;

    case 6: { // sleet
      drawCloud4Bumps(x, y, s, col);
      int dropH = (int)(s * 0.18f);
      int dropW = (int)(s * 0.09f);
      int y0 = y + (int)(s * 0.80f) + belowGap + sleetExtra;

      drawRaindrop(x + (int)(s * 0.36f), y0, dropH,            dropW, col);
      drawSnowflake(x + (int)(s * 0.54f), y0, (int)(s * 0.08f), s,    col);
      drawRaindrop(x + (int)(s * 0.72f), y0, dropH,            dropW, col);
    } break;

    case 7: { // fog
      drawCloud4Bumps(x, y, s, col);
      int t = clampi(s / 28, 2, 4);
      int y1 = y + (int)(s * 0.80f) + belowGap + fogExtra;
      int y2 = y + (int)(s * 0.86f) + belowGap + fogExtra;
      int y3 = y + (int)(s * 0.92f) + belowGap + fogExtra;

      thickLine(x + (int)(s * 0.18f), y1, x + (int)(s * 0.84f), y1, t, col);
      thickLine(x + (int)(s * 0.22f), y2, x + (int)(s * 0.80f), y2, t, col);
      thickLine(x + (int)(s * 0.26f), y3, x + (int)(s * 0.76f), y3, t, col);
    } break;

    default: {
      drawCloud4Bumps(x, y, s, col);
    } break;
  }
}

// =========================================================
// SURF WAVE ICON — flattened a bit vertically
// =========================================================
PeriodBucket getPeriodBucket(float periodSeconds) {
  if (periodSeconds <= 0.0f) return PERIOD_MEDIUM;
  if (periodSeconds < 8.0f)  return PERIOD_SHORT;
  if (periodSeconds < 11.0f) return PERIOD_MEDIUM;
  return PERIOD_LONG;
}

struct WavePt { int x; int y; };

static const WavePt WAVE_CTRL[12] = {
  {  70, 120 }, { 100,  85 }, { 130,  75 }, { 160,  85 },
  { 130, 105 }, { 125, 125 }, { 130, 145 }, { 160, 175 },
  { 130, 175 }, { 100, 175 }, {  70, 175 }, {  40, 175 }
};

static const int   WAVE_SPLINE_STEPS_PER_EDGE = 14;
static const float WAVE_HEIGHT_SCALE = 0.058f;
static const float WAVE_WIDTH_SCALE  = 0.98f;
static const int   WAVE_Y_OFFSET     = 0;
static const int   WAVE_BASELINE_THICKNESS = 2;

static inline WavePt waveCatmullRom(const WavePt& p0, const WavePt& p1, const WavePt& p2, const WavePt& p3, float t) {
  float t2 = t*t, t3 = t2*t;

  float x =
    0.5f * ((2.0f * p1.x) +
            (-p0.x + p2.x) * t +
            (2.0f * p0.x - 5.0f * p1.x + 4.0f * p2.x - p3.x) * t2 +
            (-p0.x + 3.0f * p1.x - 3.0f * p2.x + p3.x) * t3);

  float y =
    0.5f * ((2.0f * p1.y) +
            (-p0.y + p2.y) * t +
            (2.0f * p0.y - 5.0f * p1.y + 4.0f * p2.y - p3.y) * t2 +
            (-p0.y + 3.0f * p1.y - 3.0f * p2.y + p3.y) * t3);

  WavePt out;
  out.x = (int)lroundf(x);
  out.y = (int)lroundf(y);
  return out;
}

static int buildWaveSmoothedClosed(const WavePt* inPts, int n, WavePt* outPts, int outMax, int stepsPerEdge) {
  int outCount = 0;

  for (int i = 0; i < n; i++) {
    const WavePt& p0 = inPts[(i - 1 + n) % n];
    const WavePt& p1 = inPts[i];
    const WavePt& p2 = inPts[(i + 1) % n];
    const WavePt& p3 = inPts[(i + 2) % n];

    for (int s = 0; s < stepsPerEdge; s++) {
      float t = (float)s / (float)stepsPerEdge;
      WavePt p = waveCatmullRom(p0, p1, p2, p3, t);

      if (outCount > 0 &&
          outPts[outCount - 1].x == p.x &&
          outPts[outCount - 1].y == p.y) {
        continue;
      }

      if (outCount < outMax) outPts[outCount++] = p;
    }
  }

  return outCount;
}

static void drawPolylineClosedWave(const WavePt* pts, int n, int ox, int oy, uint16_t color) {
  auto& d = DisplayCore::get();
  for (int i = 0; i < n; i++) {
    int j = (i + 1) % n;
    d.drawLine(ox + pts[i].x, oy + pts[i].y,
               ox + pts[j].x, oy + pts[j].y, color);
  }
}

static void fillPolygonWave(const WavePt* pts, int n, int ox, int oy, uint16_t color) {
  auto& d = DisplayCore::get();

  int minY =  99999;
  int maxY = -99999;
  for (int i = 0; i < n; i++) {
    if (pts[i].y < minY) minY = pts[i].y;
    if (pts[i].y > maxY) maxY = pts[i].y;
  }

  for (int y = minY; y <= maxY; y++) {
    int interX[64];
    int cnt = 0;

    for (int i = 0; i < n; i++) {
      int j = (i + 1) % n;

      int x1 = pts[i].x, y1 = pts[i].y;
      int x2 = pts[j].x, y2 = pts[j].y;

      if (y1 == y2) continue;
      if (y1 > y2) { int tx=x1; x1=x2; x2=tx; int ty=y1; y1=y2; y2=ty; }

      if (y < y1 || y >= y2) continue;

      long num = (long)(y - y1) * (long)(x2 - x1);
      long den = (long)(y2 - y1);
      int x = x1 + (int)(num / den);

      if (cnt < 64) interX[cnt++] = x;
    }

    for (int a = 0; a < cnt - 1; a++) {
      for (int b = a + 1; b < cnt; b++) {
        if (interX[b] < interX[a]) { int t = interX[a]; interX[a] = interX[b]; interX[b] = t; }
      }
    }

    for (int k = 0; k + 1 < cnt; k += 2) {
      d.drawLine(ox + interX[k], oy + y, ox + interX[k + 1], oy + y, color);
    }
  }
}

static void drawWaveBlob(int x, int y, int w, int h, uint16_t fg) {
  static WavePt smoothPts[300];

  int minX= 99999, maxX=-99999, minY= 99999, maxY=-99999;
  for (int i=0;i<12;i++){
    minX = min(minX, WAVE_CTRL[i].x); maxX = max(maxX, WAVE_CTRL[i].x);
    minY = min(minY, WAVE_CTRL[i].y); maxY = max(maxY, WAVE_CTRL[i].y);
  }
  float designW = (float)(maxX - minX);
  float designH = (float)(maxY - minY);

  float sx = (designW > 0) ? ((float)w / designW) : 1.0f;
  float sy = (designH > 0) ? ((float)h / designH) : 1.0f;

  WavePt scaled[12];
  for (int i=0;i<12;i++){
    float nx = (WAVE_CTRL[i].x - minX) * sx;
    float ny = (WAVE_CTRL[i].y - minY) * sy;
    scaled[i].x = (int)lroundf(nx);
    scaled[i].y = (int)lroundf(ny);
  }

  int n = buildWaveSmoothedClosed(scaled, 12, smoothPts, 300, WAVE_SPLINE_STEPS_PER_EDGE);

  fillPolygonWave(smoothPts, n, x, y, fg);
  drawPolylineClosedWave(smoothPts, n, x, y, fg);
}

static void drawWaveBaseBox(int x, int y, int w, int h, PeriodBucket bucket, uint16_t fg) {
  int peaks = 3;
  if (bucket == PERIOD_SHORT) peaks = 4;
  else if (bucket == PERIOD_LONG) peaks = 2;

  int gap = 0;
  if (bucket == PERIOD_MEDIUM) gap = 5;
  if (bucket == PERIOD_LONG)   gap = 14;

  int iconSize = min(w, h);

  int groupW = (int)(iconSize * WAVE_WIDTH_SCALE);
  if (groupW > w) groupW = w;

  int blobW  = (groupW - (peaks - 1) * gap) / peaks;
  if (blobW < 10) blobW = 10;

  int blobH = (int)(iconSize * WAVE_HEIGHT_SCALE);
  if (blobH < 10) blobH = 10;
  if (blobH > h) blobH = h;

  int leftX = x + (w - groupW) / 2;
  int topY  = y + (h - blobH) / 2 + WAVE_Y_OFFSET;

  int yLine = topY + blobH - 1;

  for (int i = 0; i < peaks; i++) {
    int bx = leftX + i * (blobW + gap);

    drawWaveBlob(bx, topY, blobW, blobH, fg);

    if (i < peaks - 1 && gap > 0) {
      int x1 = bx + blobW;
      int x2 = x1 + gap;
      for (int t=0; t<WAVE_BASELINE_THICKNESS; t++) {
        auto& d = DisplayCore::get();
        d.drawLine(x1, yLine + t, x2, yLine + t, fg);
      }
    }
  }
}

void drawSurfWaveBucketIcon(int x, int y, int w, int h, PeriodBucket bucket) {
  uint16_t fg = Theme::ink();
  drawWaveBaseBox(x, y, w, h, bucket, fg);
}

void drawSurfWavePeriodIcon(int x, int y, int w, int h, float periodSeconds) {
  PeriodBucket b = getPeriodBucket(periodSeconds);
  drawSurfWaveBucketIcon(x, y, w, h, b);
}

void drawSurfDiceRatingIcon(int x, int y, int size, int value) {
  drawDiceFaceInternal(x, y, size, value);
}

// =========================================================
// WIND ICON — crisp
// =========================================================
void drawWindIconBox(int x, int y, int w, int h, int stroke) {
  uint16_t col = Theme::ink();

  int ww = clampi(w, 16, 200);
  int hh = clampi(h, 16, 200);

  int t  = clampi(stroke, 1, 6);

  int y1 = y + (int)(hh * 0.28f);
  int y2 = y + (int)(hh * 0.52f);
  int y3 = y + (int)(hh * 0.76f);

  int xL = x + (int)(ww * 0.06f);
  int xR = x + ww - (int)(ww * 0.06f);

  thickH(xL,                          x + (int)(ww * 0.78f),      y1, t, col);
  thickH(xL + (int)(ww * 0.10f),      xR,                         y2, t, col);
  thickH(xL + (int)(ww * 0.35f),      xR - (int)(ww * 0.08f),     y3, t, col);
}

void drawWindIcon(int x, int y, int size) {
  int s = clampi(size, 12, 120);
  int t = clampi(s / 18, 1, 5);
  drawWindIconBox(x, y, s, s, t);
}

// =========================================================
// Water drop icon
// =========================================================
void drawWaterDropIcon(int x, int y, int w, int h) {
  auto& d = DisplayCore::get();
  (void)d;
  uint16_t col = Theme::ink();

  int ww = clampi(w, 10, 80);
  int hh = clampi(h, 12, 100);

  int cx = x + ww/2;
  int cy = y + hh/2;

  int dropH = (int)(hh * 0.90f);
  int dropW = (int)(ww * 0.62f);
  if (dropW < 6) dropW = 6;
  if (dropH < 10) dropH = 10;

  drawRaindrop(cx, cy, dropH, dropW, col);
}

// =========================================================
// Celsius icon ("°C") — font-independent
// =========================================================
void drawCelsiusIcon(int x, int y, int size) {
  auto& d = DisplayCore::get();
  uint16_t col = Theme::ink();

  int s = clampi(size, 8, 40);

  int degR = clampi((int)lroundf(s * 0.18f), 2, 6);
  int cx = x + degR + 1;
  int cy = y + degR + 1;

  d.drawCircle(cx, cy, degR, col);

  int cH = clampi((int)lroundf(s * 0.70f), 6, 28);
  int cW = clampi((int)lroundf(s * 0.46f), 5, 22);

  int cX = x + degR*2 + 4;
  int cY = y + (s - cH)/2;

  int t = clampi(s / 14, 1, 3);

  for (int o = -t/2; o <= t/2; o++) {
    d.drawLine(cX + o, cY,          cX + o, cY + cH, col);
    d.drawLine(cX,     cY + o,      cX + cW, cY + o, col);
    d.drawLine(cX,     cY + cH + o, cX + cW, cY + cH + o, col);
  }
}

// =========================================================
// Sun + combined up/down arrow
// =========================================================
void drawSunUpDownIcon(int x, int y, int w, int h) {
  auto& d = DisplayCore::get();
  uint16_t col = Theme::ink();

  int ww = clampi(w, 18, 140);
  int hh = clampi(h, 14, 140);

  int sunS = clampi((int)lroundf(min(ww, hh) * 0.80f), 12, 80);

  int sunCx = x + sunS/2 - clampi(ww * 0.05f, 2, 8);
  int sunCy = y + hh/2;

  drawSun(sunCx, sunCy, sunS, col);

  int gap = clampi((int)lroundf(ww * 0.30f), 10, 30);

  int ax0 = x + sunS + gap;
  int ax1 = x + ww - 1;
  int aw  = ax1 - ax0 + 1;

  if (aw < 12) {
    ax0 = x + ww - 12;
    aw = 12;
  }

  int cx = ax0 + aw/2 + clampi(ww * 0.05f, 2, 8);

  int t = clampi(hh / 10, 1, 3);

  int topY = y + clampi((int)lroundf(hh * 0.12f), 1, 12);
  int botY = y + hh - clampi((int)lroundf(hh * 0.12f), 1, 12);

  int headH = clampi((int)lroundf(hh * 0.22f), 6, 16);
  int headW = clampi((int)lroundf(aw * 0.50f), 7, 16);

  int midY = y + hh/2;
  int gapMid = clampi((int)lroundf(hh * 0.08f), 2, 6);

  int stemTopA = topY + headH - 1;
  int stemBotA = midY - gapMid;

  int stemTopB = midY + gapMid;
  int stemBotB = botY - headH + 1;

  for (int o = -t/2; o <= t/2; o++) {
    d.drawLine(cx + o, stemTopA, cx + o, stemBotA, col);
    d.drawLine(cx + o, stemTopB, cx + o, stemBotB, col);
  }

  d.fillTriangle(cx, topY,
                 cx - headW/2, topY + headH,
                 cx + headW/2, topY + headH,
                 col);

  d.fillTriangle(cx, botY,
                 cx - headW/2, botY - headH,
                 cx + headW/2, botY - headH,
                 col);
}

} // namespace ModuleIcons