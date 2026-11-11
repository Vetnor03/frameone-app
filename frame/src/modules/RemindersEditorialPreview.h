#pragma once
// Reminders vNext R1: isolated editorial preview.
// This file is included from ModuleReminders.cpp INSIDE namespace ModuleReminders,
// after its data/cache, date grouping, and GFX measurement helpers are defined.
// It reads the existing sorted device feed; it never fetches, sorts, skips,
// alters dates, or changes the four legacy renderer implementations.
//
// Native GFX rasterisation only: original Fraunces / DM Sans bitmap glyphs,
// getTextBounds() preflight, no canvas/SVG scaling, no heap allocations.
// If a complete earliest reminder cannot be rendered, caller uses legacy.
#ifndef REMIND_REMINDERS_EDITORIAL_PREVIEW_ENABLED
#define REMIND_REMINDERS_EDITORIAL_PREVIEW_ENABLED 1
#endif

#if REMIND_REMINDERS_EDITORIAL_PREVIEW_ENABLED
struct EditorialReminderRow {
  int itemIdx;
  int y;
  int titleX;
  int rowH;
  int lineStep;
  int lineCount;
  const GFXfont* font;
  char lines[3][128];
};

struct EditorialReminderSection {
  const ReminderBucket* bucket;
  const char* heading;
  int x, y, w, h;
  int headingH;
  const GFXfont* headingFont;
  int shown;
  EditorialReminderRow rows[4];
};

struct EditorialReminderPlan {
  int sectionCount;
  int shown;
  int overflow;
  int footerX, footerY, footerW;
  EditorialReminderSection sections[2];
};

// Static scratch, not a multi-KB render-loop stack allocation.
static EditorialReminderPlan g_remindersEditorialPlan;

static int editorialFontAdvance(const GFXfont* font) {
  return font ? (int)pgm_read_byte(&font->yAdvance) : 0;
}

static bool editorialFontFits(const char* txt, const GFXfont* font,
                              int w, int h) {
  if (!txt || !txt[0] || !font || w <= 0 || h <= 0) return false;
  int16_t x1=0, y1=0; uint16_t tw=0, th=0;
  measureText(txt,font,x1,y1,tw,th);
  return (int)tw <= w && (int)th <= h && tw > 0 && th > 0;
}

static bool planEditorialRow(EditorialReminderRow& out, int idx,
                             int x, int y, int w, int remainingH) {
  if (idx < 0 || idx >= g_cache->count || remainingH < 29 || w < 72)
    return false;
  const ReminderItem& item = g_cache->items[idx];
  const GFXfont* metaFont = RemindEditorialFonts::dm18();
  const int timeW = item.time[0] ? textWidth(item.time,metaFont) + 14 : 0;
  const int titleX = x + timeW;
  const int titleW = w - timeW - 4;
  if (titleW < 44 || (item.time[0] &&
      !editorialFontFits(item.time,metaFont,w,28))) return false;

  const GFXfont* candidates[] = {
    RemindEditorialFonts::dm24(), RemindEditorialFonts::dm18(), FONT_B9
  };
  for (int candidate=0; candidate<3; ++candidate) {
    const GFXfont* font = candidates[candidate];
    const int step = max(20,editorialFontAdvance(font));
    const int maxLines = min(3,max(1,(remainingH-8)/step));
    bool complete = false;
    char lines[3][128] = {{0}};
    const int count = wrapTextToLines(item.title,lines,maxLines,titleW,font,complete);
    if (!complete || count <= 0) continue;
    int realInkH=0;
    bool fits=true;
    for(int i=0;i<count;++i) {
      int16_t x1=0,y1=0; uint16_t tw=0,th=0;
      measureText(lines[i],font,x1,y1,tw,th);
      if((int)tw>titleW || th==0) {fits=false;break;}
      realInkH=max(realInkH,(int)th);
    }
    const int rowH = max(29,(count-1)*step+realInkH+12);
    if(!fits || rowH>remainingH) continue;
    out.itemIdx=idx;
    out.y=y;
    out.titleX=titleX;
    out.rowH=rowH;
    out.lineStep=step;
    out.lineCount=count;
    out.font=font;
    for(int i=0;i<count;++i) safeCopy(out.lines[i],sizeof(out.lines[i]),lines[i]);
    return true;
  }
  return false;
}

static bool planEditorialSection(EditorialReminderSection& section,
                                 const ReminderBucket* bucket,
                                 const char* heading,
                                 int x, int y, int w, int h) {
  if (!bucket || !bucket->count || w < 90 || h < 72) return false;
  section.bucket=bucket;
  section.heading=heading;
  section.x=x;section.y=y;section.w=w;section.h=h;section.shown=0;
  const GFXfont* large = RemindEditorialFonts::fraunces48();
  const GFXfont* small = RemindEditorialFonts::dm24();
  const bool largeFits = h >= 185 && editorialFontFits(heading,large,w-4,51);
  section.headingFont = largeFits ? large : small;
  if(!editorialFontFits(heading,section.headingFont,w-4,52)) {
    section.headingFont=RemindEditorialFonts::dm18();
    if(!editorialFontFits(heading,section.headingFont,w-4,28)) return false;
  }
  section.headingH=largeFits?67:39;
  int cursor=y+section.headingH;
  const int end=y+h;
  const int gap=12;
  for(int i=0;i<bucket->count && i<4;++i) {
    const int idx=bucket->itemIdx[i];
    EditorialReminderRow& row=section.rows[section.shown];
    if(!planEditorialRow(row,idx,x,cursor,w,end-cursor)) break;
    ++section.shown;
    cursor += row.rowH+gap;
  }
  return section.shown>0;
}

static bool planEditorialReminders(const Cell& c,
                                   const ReminderBucket* buckets,int bucketCount) {
  if(!g_cache || !g_cache->ok || !g_cache->count || c.w<130 || c.h<90)
    return false;

  const int todayIndex=findBucketByDaysUntil(buckets,bucketCount,0);
  const int tomorrowIndex=findBucketByDaysUntil(buckets,bucketCount,1);
  // Other date groups (including overdue) continue through existing logic in R1.
  if(todayIndex<0 && tomorrowIndex<0) return false;
  const ReminderBucket* primary = todayIndex>=0 ? &buckets[todayIndex] : &buckets[tomorrowIndex];
  const char* primaryHeading = todayIndex>=0 ? "Today" : "Tomorrow";
  const ReminderBucket* secondary = todayIndex>=0 && tomorrowIndex>=0
    ? &buckets[tomorrowIndex] : nullptr;

  const int pad=max(10,min(23,(int)lroundf(min(c.w,c.h)*.075f)));
  const int x=c.x+pad, y=c.y+pad, w=c.w-2*pad, h=c.h-2*pad;
  if(w<90 || h<70)return false;

  EditorialReminderPlan& plan=g_remindersEditorialPlan;
  memset(&plan,0,sizeof(plan));
  const int footerReserve=g_cache->count>1 ? 28 : 0;
  const int bodyH=h-footerReserve;
  if(bodyH<70)return false;

  // A shallow panorama has an editorial title in its own left-hand region.
  // The section builder handles both this and ordinary vertical cells.
  const bool panoramic=w>=350 && bodyH<150;
  bool planned=false;
  if(panoramic) {
    const int headingW=min(218,max(126,w/4));
    const int contentX=x+headingW+16;
    EditorialReminderSection& section=plan.sections[0];
    if(planEditorialSection(section,primary,primaryHeading,
                            contentX,y,w-(contentX-x),bodyH)) {
      section.headingH=0; // title is painted separately, on the left
      plan.sectionCount=1;planned=true;
    }
  } else if(secondary && bodyH>=285) {
    if(w>=530) {
      const int gap=24;
      const int firstW=(w-gap)*55/100;
      if(planEditorialSection(plan.sections[0],primary,"Today",
                             x,y,firstW,bodyH) &&
         planEditorialSection(plan.sections[1],secondary,"Tomorrow",
                             x+firstW+gap,y,w-firstW-gap,bodyH)) {
        plan.sectionCount=2;planned=true;
      }
    } else {
      const int gap=16;
      const int firstH=(bodyH-gap)*55/100;
      if(planEditorialSection(plan.sections[0],primary,"Today",
                             x,y,w,firstH) &&
         planEditorialSection(plan.sections[1],secondary,"Tomorrow",
                             x,y+firstH+gap,w,bodyH-firstH-gap)) {
        plan.sectionCount=2;planned=true;
      }
    }
  }
  if(!planned) {
    memset(&plan,0,sizeof(plan));
    if(!planEditorialSection(plan.sections[0],primary,primaryHeading,
                             x,y,w,bodyH))return false;
    plan.sectionCount=1;
  }
  for(int i=0;i<plan.sectionCount;++i)plan.shown+=plan.sections[i].shown;
  plan.overflow=max(0,g_cache->count-plan.shown);
  plan.footerX=x;plan.footerY=y+h-footerReserve;
  plan.footerW=w;
  return true;
}

static void paintEditorialText(const char* txt,const GFXfont* font,
                               int x,int inkTop) {
  int16_t x1=0,y1=0;uint16_t tw=0,th=0;
  measureText(txt,font,x1,y1,tw,th);
  drawLeft(x-x1,inkTop-y1,txt,font,Theme::ink());
}

static bool renderEditorialRemindersPreview(const Cell& c,
                                            const ReminderBucket* buckets,int bucketCount) {
  if(!planEditorialReminders(c,buckets,bucketCount))return false;
  const EditorialReminderPlan& plan=g_remindersEditorialPlan;
  const int pad=max(10,min(23,(int)lroundf(min(c.w,c.h)*.075f)));
  const int usableW=c.w-2*pad;
  const bool panoramic=usableW>=350 &&
    (c.h-2*pad-(g_cache->count>1?28:0))<150;
  for(int s=0;s<plan.sectionCount;++s) {
    const EditorialReminderSection& section=plan.sections[s];
    if(panoramic) {
      const int headingX=c.x+pad;
      const GFXfont* font=editorialFontFits(section.heading,
        RemindEditorialFonts::fraunces48(),section.x-headingX-14,50)
          ?RemindEditorialFonts::fraunces48():RemindEditorialFonts::dm24();
      paintEditorialText(section.heading,font,headingX,c.y+pad+8);
    } else {
      paintEditorialText(section.heading,section.headingFont,
                        section.x,section.y+3);
    }
    for(int r=0;r<section.shown;++r) {
      const EditorialReminderRow& row=section.rows[r];
      const ReminderItem& item=g_cache->items[row.itemIdx];
      if(item.time[0]) paintEditorialText(item.time,
        RemindEditorialFonts::dm18(),section.x,row.y+7);
      for(int line=0;line<row.lineCount;++line)
        paintEditorialText(row.lines[line],row.font,row.titleX,
                           row.y+5+line*row.lineStep);
    }
  }
  if(plan.overflow>0) {
    char label[24]={};
    snprintf(label,sizeof(label),"+%d more",plan.overflow);
    const GFXfont* font=RemindEditorialFonts::dm18();
    if(editorialFontFits(label,font,plan.footerW,24))
      paintEditorialText(label,font,plan.footerX,plan.footerY+5);
  }
  return true;
}
#endif // REMIND_REMINDERS_EDITORIAL_PREVIEW_ENABLED
