#pragma once
// RE:MIND Countdown V5 approved live production renderer.
// Included from ModuleCountdown.cpp within namespace ModuleCountdown.
// Uses native GFX measured ink; no static bitmap images or diagnostic grid.
// Data fetching, pinning, ordering, dates and legacy fallback unchanged.

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

// Determine the actual visible metric height without changing the selected
// number font. All vertical elements are grouped around their collective
// center, instead of occupying the entire cell height.
static int cdEditorialMetricHeight(const char* number, const char* unit,
                                  int w,int maxH) {
  if(w<40 || maxH<22) return 0;
  const GFXfont* small=RemindEditorialFonts::dm18();
  if(!cdEditorialFits(unit,small,w,maxH)) small=FONT_B9;
  if(!cdEditorialFits(unit,small,w,maxH)) return 0;
  const int unitW=textWidth(unit,small);
  const int unitH=cdEditorialInkHeight(unit,small);
  const GFXfont* num=cdEditorialCountFont(number,w-unitW-9,maxH);
  if(num) return max(unitH,cdEditorialInkHeight(number,num));
  num=cdEditorialCountFont(number,w,maxH-unitH-6);
  return num ? cdEditorialInkHeight(number,num)+6+unitH : 0;
}

static bool cdEditorialHero(const CountdownItem& hero,
                            const CountdownEditorialRect& r,
                            bool showDate, bool balancedWideHero=false) {
  char number[16], unit[16], date[32];
  formatDaysNumber(hero.daysLeft, number, sizeof(number));
  formatDaysUnit(hero.daysLeft, unit, sizeof(unit));
  adaptiveEffectiveDate(hero, date, sizeof(date));

  const GFXfont* dateFont = RemindEditorialFonts::dm18();
  if (!cdEditorialFits(date, dateFont, r.w-4, 26)) dateFont = FONT_B9;
  const bool dateFits = showDate && r.h >= 125 &&
    cdEditorialFits(date, dateFont, r.w-4, 24);
  const int dateH = dateFits ? 22 : 0;

  // In a wide split with several upcoming events, don't spread three
  // related facts across the full height of the left panel. Measure the
  // genuine glyphs and center the title / day count / date as one group.
  // This affects spatial rhythm ONLY: selected hero and date are unchanged.
  if (balancedWideHero && r.w >= 290 && r.h >= 235) {
    CountdownEditorialTitle balancedTitle;
    const int titleBudget = min(140, max(82, r.h * 35 / 100));
    const int metricH = min(106, max(76, r.h * 29 / 100));
    if (cdEditorialTitlePlan(hero.title, r.w-8, titleBudget, balancedTitle)) {
      const int titleMetricGap = 22;
      const int metricDateGap = dateFits ? 14 : 0;
      const int groupH = balancedTitle.height + titleMetricGap +
                         metricH + metricDateGap + dateH;
      const int smallUnitWidth = textWidth(unit, RemindEditorialFonts::dm18());
      const bool countFits =
        cdEditorialCountFont(number, r.w-smallUnitWidth-9, metricH) ||
        cdEditorialCountFont(number, r.w, metricH-32);
      if (countFits && groupH <= r.h) {
        const int groupY = r.y + (r.h-groupH)/2;
        const CountdownEditorialRect titleBox{
          r.x, groupY, r.w, balancedTitle.height
        };
        const CountdownEditorialRect metricBox{
          r.x, groupY+balancedTitle.height+titleMetricGap, r.w, metricH
        };
        cdEditorialPaintTitle(balancedTitle, titleBox, true);
        if (!cdEditorialMetric(number,unit,metricBox)) return false;
        if (dateFits) {
          const int dateW=textWidth(date,dateFont);
          cdEditorialText(date,dateFont,r.x+(r.w-dateW)/2,
                          metricBox.y+metricH+metricDateGap);
        }
        return true;
      }
    }
  }

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
        // Center within the title's OWN half; the number keeps its place.
        cdEditorialPaintTitle(title,tr,true);
        if (dateFits && cdEditorialFits(date,dateFont,titleW,24)) {
          const int dateW=textWidth(date,dateFont);
          cdEditorialText(date,dateFont,r.x+(titleW-dateW)/2,
                          r.y+r.h-dateH);
        }
        return cdEditorialMetric(number,unit,mr);
      }
    }
  }

  // V5: portraits/squares place the measured title, count+unit and date
  // as ONE centered typographic block, rather than scattering them.
  CountdownEditorialTitle title;
  const int titleBudget=min(126,max(26,r.h*38/100));
  if(!cdEditorialTitlePlan(hero.title,r.w-8,titleBudget,title))return false;
  const int gap=max(7,min(16,r.h/19));
  const int dateGap=dateFits ? max(7,min(14,r.h/25)) : 0;
  const int metricAvailable=r.h-title.height-gap-dateGap-dateH;
  const int metricH=cdEditorialMetricHeight(number,unit,r.w,metricAvailable);
  if(metricH<22)return false;
  const int total=title.height+gap+metricH+dateGap+dateH;
  if(total>r.h)return false;
  const int top=r.y+(r.h-total)/2;
  cdEditorialPaintTitle(title,
    CountdownEditorialRect{r.x,top,r.w,title.height},true);
  if(!cdEditorialMetric(number,unit,
      CountdownEditorialRect{r.x,top+title.height+gap,r.w,metricH}))
    return false;
  if(dateFits) {
    const int dateW=textWidth(date,dateFont);
    cdEditorialText(date,dateFont,r.x+(r.w-dateW)/2,
      top+title.height+gap+metricH+dateGap);
  }
  return true;
}

static int cdEditorialUpcoming(const CountdownEditorialRect& r,
                               const CountdownItem* const* events,
                               int eventCount,bool centerWideList=false) {
  (void)centerWideList;
  if(eventCount<=0||r.w<170||r.h<50)return 0;
  const GFXfont* font=RemindEditorialFonts::dm18();
  const GFXfont* metricFont=FONT_B9;
  const char* heading="COMING UP";
  const int headH=27;
  const int rowH=max(29,cdEditorialAdvance(font)+7);
  // Reserve enough for overflow; only actual visible rows get bullets.
  const int capacity=min(eventCount,max(0,(r.h-headH-18)/rowH));
  if(capacity<1||!cdEditorialFits(heading,font,r.w,22))return 0;
  const int metricBudget=min(102,max(52,r.w*28/100));
  int shown=0,widestMetric=0;
  for(int i=0;i<capacity;++i){
    char metric[48];
    adaptiveCountdownMetric(*events[i],metric,sizeof(metric));
    if(!cdEditorialFits(metric,metricFont,metricBudget,18))break;
    widestMetric=max(widestMetric,textWidth(metric,metricFont));
    ++shown;
  }
  if(!shown)return 0;
  const bool diamond=shown>=2&&r.w>=200;
  const int markerSpace=diamond?16:0;
  const int gap=max(14,min(26,r.w/18));
  const int titleRoom=r.w-markerSpace-widestMetric-gap;
  if(titleRoom<56)return 0;
  int widestTitle=0;
  for(int i=0;i<shown;++i){
    char label[96];
    fitTextToWidth(events[i]->title,label,sizeof(label),titleRoom,font);
    if(!label[0]||textWidth(label,font)>titleRoom)return 0;
    widestTitle=max(widestTitle,textWidth(label,font));
  }
  // V5: adjacent title/metric columns travel as a single centered group.
  // Do not pin a days count to the far right when its event is far left.
  const int groupW=markerSpace+widestTitle+gap+widestMetric;
  const int groupX=r.x+max(0,(r.w-groupW)/2);
  const int metricX=groupX+markerSpace+widestTitle+gap;
  const bool overflow=eventCount>shown;
  const int blockH=headH+shown*rowH+(overflow?18:0);
  const int blockY=r.y+max(0,(r.h-blockH)/2);
  cdEditorialText(heading,font,groupX,blockY);
  DisplayCore::get().drawFastHLine(
    groupX,blockY+cdEditorialInkHeight(heading,font)+3,
    min(groupW,textWidth(heading,font)),Theme::ink());
  for(int i=0;i<shown;++i){
    const int y=blockY+headH+i*rowH+3;
    if(diamond)cdEditorialDiamond(groupX+5,y+8);
    char label[96],metric[48];
    fitTextToWidth(events[i]->title,label,sizeof(label),titleRoom,font);
    adaptiveCountdownMetric(*events[i],metric,sizeof(metric));
    cdEditorialText(label,font,groupX+markerSpace,y);
    cdEditorialText(metric,metricFont,metricX,y+3);
  }
  if(overflow){
    char more[32];
    snprintf(more,sizeof(more),"+%d more",eventCount-shown);
    if(cdEditorialFits(more,metricFont,groupW,18))
      cdEditorialText(more,metricFont,groupX,blockY+headH+shown*rowH+2);
  }
  return shown;
}

// Countdown-only live renderer. Identity, pin/nearest behavior, sorted upcoming items,
// existing date/calendar functions, fetch state and legacy renderers are reused.
static bool renderEditorialCountdown(const Cell& c) {
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

  // V5: center hero + upcoming vertically as a compact combined group.
  // Calendar (if present) and primary event still have priority.
  if (eventCount>0 && !sideList && !calendarRect.w &&
      heroRect.w>=290 && heroRect.h>=260) {
    const int listH=min(156,heroRect.h*35/100);
    const int heroH=min(heroRect.h-listH-12,max(142,heroRect.h*57/100));
    const int groupH=heroH+12+listH;
    const int groupY=heroRect.y+max(0,(heroRect.h-groupH)/2);
    listRect=CountdownEditorialRect{
      heroRect.x,groupY+heroH+12,heroRect.w,listH
    };
    heroRect.y=groupY;
    heroRect.h=heroH;
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

  if (!cdEditorialHero(hero,heroRect,policy.showDate,sideList)) return false;
  if (listRect.w && listRect.h)
    cdEditorialUpcoming(listRect,events,eventCount,sideList);
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
