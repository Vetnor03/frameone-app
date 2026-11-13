#pragma once
// RE:MIND Countdown Design vNext R2 — experimental, native 1-bit editorial view.
// Included from ModuleCountdown.cpp INSIDE namespace ModuleCountdown.
// Opt-in only: no API/cache/sorting/rotation/date logic or legacy renderer changes.
// All bounds are the actual display's GFX bitmap pixel measurements.
#ifndef REMIND_COUNTDOWN_EDITORIAL_PREVIEW_ENABLED
#define REMIND_COUNTDOWN_EDITORIAL_PREVIEW_ENABLED 0
#endif

#if REMIND_COUNTDOWN_EDITORIAL_PREVIEW_ENABLED

struct CountdownEditorialRect { int x, y, w, h; };

static bool cdEditorialFits(const char* s, const GFXfont* f, int w, int h) {
  if (!s || !s[0] || !f || w < 1 || h < 1) return false;
  int16_t ox=0, oy=0; uint16_t tw=0, th=0;
  measureText(s, f, ox, oy, tw, th);
  return tw > 0 && th > 0 && (int)tw <= w && (int)th <= h;
}

static int cdEditorialInkHeight(const char* s, const GFXfont* f) {
  int16_t ox=0, oy=0; uint16_t tw=0, th=0;
  measureText(s, f, ox, oy, tw, th);
  return (int)th;
}

static int cdEditorialAdvance(const GFXfont* f) {
  return f ? (int)pgm_read_byte(&f->yAdvance) : 0;
}

static void cdEditorialText(const char* s, const GFXfont* f, int x, int top) {
  int16_t ox=0, oy=0; uint16_t tw=0, th=0;
  measureText(s, f, ox, oy, tw, th);
  drawLeft(x - ox, top - oy, s, f, Theme::ink());
}

// This is deliberately ink-only: no greyscale anti-aliasing or image rescale.
static void cdEditorialDiamond(int cx, int cy) {
  auto& d = DisplayCore::get();
  const uint16_t ink = Theme::ink();
  for (int dy=-3; dy<=3; ++dy) {
    const int dx=3-abs(dy);
    d.drawPixel(cx-dx,cy+dy,ink);
    d.drawPixel(cx+dx,cy+dy,ink);
  }
  d.drawPixel(cx,cy,ink);
}

static const int CD_EDITORIAL_MAX_TITLE_LINES = 3;
struct CountdownEditorialTitle {
  const GFXfont* font = nullptr;
  int lines = 0;
  int step = 0;
  int height = 0;
  int widest = 0;
  char text[CD_EDITORIAL_MAX_TITLE_LINES][96] = {{0}};
};

// A full-title, complete-word fit. If it cannot be shown at a useful bitmap
// size, let the existing renderer handle that geometry instead of hiding it.
static bool cdEditorialWrapTitle(const char* src, const GFXfont* font,
                                int width, int height, int limit,
                                CountdownEditorialTitle& out) {
  if (!src || !src[0] || !font || width <= 0 || height <= 0) return false;
  if (strlen(src) >= 96) return false;
  char copy[96]; safeCopy(copy, sizeof(copy), src);
  CountdownEditorialTitle trial;
  trial.font = font;
  trial.step = max(1, cdEditorialAdvance(font));
  char current[96] = {0};
  char* save = nullptr;
  for (char* word=strtok_r(copy, " ", &save); word;
       word=strtok_r(nullptr, " ", &save)) {
    char candidate[96];
    const int n = current[0]
      ? snprintf(candidate, sizeof(candidate), "%s %s", current, word)
      : snprintf(candidate, sizeof(candidate), "%s", word);
    if (n < 0 || n >= (int)sizeof(candidate)) return false;
    if (textWidth(candidate, font) <= width) {
      safeCopy(current, sizeof(current), candidate);
      continue;
    }
    if (!current[0] || trial.lines >= limit - 1 ||
        textWidth(word, font) > width) return false;
    safeCopy(trial.text[trial.lines++], sizeof(trial.text[0]), current);
    safeCopy(current, sizeof(current), word);
  }
  if (!current[0] || trial.lines >= limit) return false;
  safeCopy(trial.text[trial.lines++], sizeof(trial.text[0]), current);
  int tallest = 0;
  for (int i=0; i<trial.lines; ++i) {
    if (!cdEditorialFits(trial.text[i], font, width, height)) return false;
    trial.widest = max(trial.widest, textWidth(trial.text[i], font));
    tallest = max(tallest, cdEditorialInkHeight(trial.text[i], font));
  }
  trial.height = (trial.lines - 1) * trial.step + tallest;
  if (trial.height > height) return false;
  out = trial;
  return true;
}

static bool cdEditorialTitlePlan(const char* title, int w, int h,
                                 CountdownEditorialTitle& out) {
  const GFXfont* candidates[] = {
    RemindEditorialFonts::fraunces48(),
    RemindEditorialFonts::dm24(),
    RemindEditorialFonts::dm18(),
    FONT_B12
  };
  const int count = 4;
  const int maxLines = h >= 96 ? 3 : h >= 55 ? 2 : 1;
  for (int i=0; i<count; ++i) {
    // Reserve the large Fraunces title for genuinely spacious primary areas.
    if (i == 0 && (w < 370 || h < 90)) continue;
    if (i == 1 && h < 45) continue;
    if (i == 2 && h < 24) continue;
    if (cdEditorialWrapTitle(title, candidates[i], w, h,
                            maxLines, out)) return true;
  }
  // Countdown is not a news list: at postcard sizes, a measured readable
  // abbreviation of an extreme event title beats hiding the event entirely.
  // Keep the true source title and its exact selection unchanged.
  const GFXfont* compactFonts[]={RemindEditorialFonts::dm18(),FONT_B12};
  for(const GFXfont* compact:compactFonts) {
    char shortened[96];
    fitTextToWidth(title,shortened,sizeof(shortened),w,compact);
    if(!shortened[0] || !cdEditorialFits(shortened,compact,w,h))continue;
    CountdownEditorialTitle abbreviated;
    abbreviated.font=compact;
    abbreviated.lines=1;
    abbreviated.step=max(1,cdEditorialAdvance(compact));
    abbreviated.height=cdEditorialInkHeight(shortened,compact);
    abbreviated.widest=textWidth(shortened,compact);
    safeCopy(abbreviated.text[0],sizeof(abbreviated.text[0]),shortened);
    out=abbreviated;
    return true;
  }
  return false;
}

static void cdEditorialPaintTitle(const CountdownEditorialTitle& title,
                                  const CountdownEditorialRect& r,
                                  bool center) {
  const int y = r.y + max(0, (r.h - title.height) / 2);
  for (int i=0; i<title.lines; ++i) {
    const int w = textWidth(title.text[i], title.font);
    const int x = center ? r.x + (r.w - w) / 2 : r.x;
    cdEditorialText(title.text[i], title.font, x, y + title.step*i);
  }
}

static const GFXfont* cdEditorialCountFont(const char* value, int w, int h) {
  const GFXfont* candidates[] = {
    RemindEditorialFonts::fraunces72(),
    RemindEditorialFonts::fraunces48(),
    RemindEditorialFonts::dm24(),
    RemindEditorialFonts::dm18(),
    FONT_B12
  };
  for (const GFXfont* f : candidates)
    if (cdEditorialFits(value, f, w, h)) return f;
  return nullptr;
}

// Number is the hero, but "DAYS" is a caption, never a second headline.
// The compact inline metric is shared by short and tall shapes.
static bool cdEditorialMetric(const char* number, const char* unit,
                              const CountdownEditorialRect& r) {
  if (r.w < 40 || r.h < 22) return false;
  const GFXfont* small = RemindEditorialFonts::dm18();
  if (!cdEditorialFits(unit, small, r.w, r.h)) small = FONT_B9;
  if (!cdEditorialFits(unit, small, r.w, r.h)) return false;

  const int unitW = textWidth(unit, small);
  const int unitH = cdEditorialInkHeight(unit, small);
  const int gap = 9;

  // First try the elegant single-baseline count + small unit.
  const GFXfont* numberFont = cdEditorialCountFont(
    number, r.w - unitW - gap, r.h
  );
  if (numberFont) {
    const int numberW = textWidth(number, numberFont);
    const int numberH = cdEditorialInkHeight(number, numberFont);
    const int groupW = numberW + gap + unitW;
    const int groupH = max(numberH, unitH);
    const int groupX = r.x + (r.w - groupW) / 2;
    const int groupY = r.y + (r.h - groupH) / 2;
    cdEditorialText(number, numberFont, groupX,
                    groupY + groupH - numberH);
    cdEditorialText(unit, small, groupX + numberW + gap,
                    groupY + groupH - unitH);
    return true;
  }

  // A three-digit count on a narrow panel needs the full width.
  numberFont = cdEditorialCountFont(number, r.w, r.h - unitH - 6);
  if (!numberFont) return false;
  const int numberH = cdEditorialInkHeight(number, numberFont);
  const int blockH = numberH + 6 + unitH;
  const int y = r.y + (r.h - blockH) / 2;
  cdEditorialText(number, numberFont,
                  r.x + (r.w-textWidth(number,numberFont))/2, y);
  cdEditorialText(unit, small, r.x + (r.w-unitW)/2,
                  y + numberH + 6);
  return true;
}

static bool cdEditorialHero(const CountdownItem& hero,
                            const CountdownEditorialRect& r,
                            bool showDate) {
  char number[16], unit[16], date[32];
  formatDaysNumber(hero.daysLeft, number, sizeof(number));
  formatDaysUnit(hero.daysLeft, unit, sizeof(unit));
  adaptiveEffectiveDate(hero, date, sizeof(date));

  const GFXfont* dateFont = RemindEditorialFonts::dm18();
  if (!cdEditorialFits(date, dateFont, r.w-4, 26)) dateFont = FONT_B9;
  const bool dateFits = showDate && r.h >= 125 &&
    cdEditorialFits(date, dateFont, r.w-4, 24);
  const int dateH = dateFits ? 22 : 0;

  // Landscape ribbons: equal emphasis for event title and count, side by side.
  // All dimensions are measured from the actual assigned pixel rectangle.
  const bool ribbon = r.w >= 330 && r.h <= 160;
  CountdownEditorialTitle title;
  if (ribbon) {
    const int gap = 16;
    const int titleW = (r.w-gap)*52/100;
    const int metricW = r.w-gap-titleW;
    const int textH = r.h-dateH-(dateH?4:0);
    if (cdEditorialTitlePlan(hero.title, titleW-2, textH, title)) {
      const CountdownEditorialRect tr{r.x,r.y,titleW,textH};
      const CountdownEditorialRect mr{r.x+titleW+gap,r.y,metricW,r.h};
      // Preflight the count before committing pixels.
      const GFXfont* countFont = cdEditorialCountFont(
        number, metricW-textWidth(unit,RemindEditorialFonts::dm18())-9, r.h
      );
      if (countFont || cdEditorialCountFont(number,metricW,r.h-30)) {
        cdEditorialPaintTitle(title,tr,false);
        if (dateFits) cdEditorialText(date,dateFont,r.x,
                                    r.y+r.h-dateH);
        return cdEditorialMetric(number,unit,mr);
      }
    }
  }

  // Vertical grammar for portraits, squares, and medium-height rectangles.
  // Give the event sufficient room *before* choosing the count's font.
  // A tiny square has enough pixels for two strong facts, but not the
  // roomy title/metric split used by large portrait layouts.
  const int titleH = r.h < 125
    ? max(28,min(38,r.h*32/100))
    : min(r.h*46/100,max(40,r.h-47-dateH));
  const int metricY = r.y+titleH+5;
  const CountdownEditorialRect metric{
    r.x,metricY,r.w,r.h-titleH-5-dateH-(dateH?5:0)
  };
  if (metric.h < 22 ||
      !cdEditorialTitlePlan(hero.title,r.w-4,titleH-4,title))
    return false;

  // Measured preflight: do not partially paint a hero only to fall back.
  const int unitW=textWidth(unit,RemindEditorialFonts::dm18());
  const bool metricFits =
    cdEditorialCountFont(number,metric.w-unitW-9,metric.h) ||
    cdEditorialCountFont(number,metric.w,metric.h-32);
  if (!metricFits) return false;

  const CountdownEditorialRect tr{r.x,r.y,r.w,titleH};
  cdEditorialPaintTitle(title,tr,true);
  if (!cdEditorialMetric(number,unit,metric)) return false;
  if (dateFits) {
    const int dateW=textWidth(date,dateFont);
    cdEditorialText(date,dateFont,r.x+(r.w-dateW)/2,
                    r.y+r.h-dateH);
  }
  return true;
}

static int cdEditorialUpcoming(const CountdownEditorialRect& r,
                               const CountdownItem* const* events,
                               int eventCount) {
  if (eventCount <= 0 || r.w < 170 || r.h < 50) return 0;
  const GFXfont* font = RemindEditorialFonts::dm18();
  const GFXfont* metricFont = FONT_B9;
  const char* heading = "COMING UP";
  const int headH = 27;
  const int footerH = eventCount > 1 ? 20 : 0;
  const int rowH = max(29,cdEditorialAdvance(font)+7);
  const int capacity = min(eventCount,max(0,(r.h-headH-footerH)/rowH));
  if (capacity < 1) return 0;
  const int metricW = min(102,max(52,r.w*28/100));
  if (r.w - metricW - 14 < 56) return 0;

  // Decide ornaments from actual visible rows, NOT source event count.
  // A single visible event reclaims its marker lane, exactly like News R2.3.
  int shown = 0;
  for (int i=0; i<capacity; ++i) {
    char metric[48];
    adaptiveCountdownMetric(*events[i],metric,sizeof(metric));
    if (!cdEditorialFits(metric,metricFont,metricW,18)) break;
    ++shown;
  }
  if (!shown) return 0;
  const bool diamond = shown >= 2 && r.w >= 200;
  const int markerSpace = diamond ? 16 : 0;
  const int titleW = r.w - markerSpace - metricW - 14;
  if (!cdEditorialFits(heading,RemindEditorialFonts::dm18(),r.w,22))
    return 0;

  cdEditorialText(heading,RemindEditorialFonts::dm18(),r.x,r.y);
  DisplayCore::get().drawFastHLine(
    r.x,r.y+cdEditorialInkHeight(heading,RemindEditorialFonts::dm18())+3,
    min(r.w,textWidth(heading,RemindEditorialFonts::dm18())),Theme::ink()
  );
  for (int i=0; i<shown; ++i) {
    const int y = r.y+headH+i*rowH+3;
    if (diamond && shown>=2) cdEditorialDiamond(r.x+5,y+8);
    char label[96],metric[48];
    fitTextToWidth(events[i]->title,label,sizeof(label),titleW,font);
    adaptiveCountdownMetric(*events[i],metric,sizeof(metric));
    if (!label[0] || textWidth(label,font)>titleW) return shown;
    cdEditorialText(label,font,r.x+markerSpace,y);
    const int mw=textWidth(metric,metricFont);
    cdEditorialText(metric,metricFont,r.x+r.w-mw,y+3);
  }
  if (eventCount>shown) {
    char more[32];
    snprintf(more,sizeof(more),"+%d more",eventCount-shown);
    const GFXfont* caption=FONT_B9;
    if (cdEditorialFits(more,caption,r.w,18))
      cdEditorialText(more,caption,r.x,r.y+r.h-16);
  }
  return shown;
}

// Countdown-only opt-in. Identity, pin/nearest behavior, sorted upcoming items,
// existing date/calendar functions, fetch state and legacy renderers are reused.
static bool renderEditorialCountdownPreview(const Cell& c) {
  if (!g_cache.ok) return false; // original empty/failure state
  const int heroIdx = findNearestIdx();
  if (heroIdx < 0) return false;
  const CountdownItem& hero = g_cache.items[heroIdx];
  const CountdownItem* events[MAX_EVENTS] = {nullptr};
  const int eventCount = collectAdaptiveUpcoming(heroIdx,events,MAX_EVENTS);
  const AdaptiveCountdownComposition policy =
    adaptiveCountdownComposition(c,hero,events,eventCount);

  const int pad = max(14,min(24,min(c.w,c.h)*7/100));
  const CountdownEditorialRect area{
    c.x+pad,c.y+pad,c.w-2*pad,c.h-2*pad
  };
  if (area.w<100 || area.h<70) return false;
  const int gutter = max(16,min(26,area.w/28));
  CountdownEditorialRect heroRect=area;
  CountdownEditorialRect listRect{0,0,0,0};
  CountdownEditorialRect calendarRect{0,0,0,0};

  const bool sideCalendar=policy.showCalendar &&
    area.w>=600 && area.h>=315;
  const bool sideList=!sideCalendar && eventCount>0 &&
    area.w>=600 && area.h>=190;

  if (sideCalendar) {
    heroRect.w=(area.w-gutter)*56/100;
    calendarRect=CountdownEditorialRect{
      heroRect.x+heroRect.w+gutter,area.y,
      area.w-heroRect.w-gutter,area.h
    };
  } else if (sideList) {
    heroRect.w=(area.w-gutter)*56/100;
    listRect=CountdownEditorialRect{
      heroRect.x+heroRect.w+gutter,area.y,
      area.w-heroRect.w-gutter,area.h
    };
  } else if (policy.showCalendar && area.w>=430 && area.h>=390) {
    // Preserve the calendar on medium-wide tall cells (e.g. 3x4).
    // A sidebar here would steal too much space from the main event.
    const int calH=min(185,area.h*42/100);
    calendarRect=CountdownEditorialRect{
      area.x,area.y+area.h-calH,area.w,calH
    };
    heroRect.h-=calH+16;
  }

  // A roomy left panel may hold a short editorial list underneath the hero.
  // Never sacrifice a calendar or primary facts for extra rows.
  if (eventCount>0 && !sideList && !calendarRect.w &&
      heroRect.w>=290 && heroRect.h>=260) {
    const int listH=min(156,heroRect.h*37/100);
    listRect=CountdownEditorialRect{
      heroRect.x,heroRect.y+heroRect.h-listH,heroRect.w,listH
    };
    heroRect.h -= listH+16;
  }

  // No drawing until the event title + count can both be composed.
  // Use a separate pixel-only preflight on a small temporary geometry:
  // the renderer below independently validates all content again.
  CountdownEditorialTitle preflight;
  const bool ribbon=heroRect.w>=330 && heroRect.h<=160;
  const int headlineH=ribbon ? heroRect.h-27 :
    min(heroRect.h*46/100,max(40,heroRect.h-47));
  const int headlineW=ribbon ? (heroRect.w-16)*52/100-2 :
    heroRect.w-4;
  if (!cdEditorialTitlePlan(hero.title,headlineW,max(20,headlineH-4),
                            preflight)) return false;

  if (!cdEditorialHero(hero,heroRect,policy.showDate)) return false;
  if (listRect.w && listRect.h)
    cdEditorialUpcoming(listRect,events,eventCount);
  if (calendarRect.w) {
    tm nowTm;
    if (getLocalTmQuick(nowTm))
      drawCountdownCalendarMonth(
        calendarRect.x,calendarRect.y,calendarRect.w,calendarRect.h,
        nowTm.tm_year+1900,nowTm.tm_mon,
        nowTm.tm_year+1900,nowTm.tm_mon,nowTm.tm_mday,
        hero,true,true
      );
  }
  return true;
}
#endif  // REMIND_COUNTDOWN_EDITORIAL_PREVIEW_ENABLED
