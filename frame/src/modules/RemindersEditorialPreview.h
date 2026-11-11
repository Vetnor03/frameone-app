#pragma once
// RE:MIND Reminders vNext R2 — isolated editorial visual preview.
// Included from ModuleReminders.cpp WITHIN namespace ModuleReminders.
// Reuses existing production feed, order, Today/Tomorrow selection and titles.
// No fetching, API, date calculation, Skip or shared display code is changed.
//
// GFXfont bitmaps: the originally approved Fraunces / DM Sans assets.
// Every character and row is measured with the production GFX renderer.
// The complete first item must fit, otherwise render() uses original legacy.
#ifndef REMIND_REMINDERS_EDITORIAL_PREVIEW_ENABLED
#define REMIND_REMINDERS_EDITORIAL_PREVIEW_ENABLED 1
#endif

#if REMIND_REMINDERS_EDITORIAL_PREVIEW_ENABLED

enum EditorialRemindersFamily {
  REM_EDIT_STACKED,
  REM_EDIT_PANORAMA,
  REM_EDIT_TWO_COLUMNS,
  REM_EDIT_TWO_STORIES
};

struct EditorialReminderRow {
  int itemIdx = -1;
  int x=0, y=0, w=0, h=0;
  int titleX=0, titleY=0, timeY=0, lineStep=0, lineCount=0;
  bool stackedTime=false;
  const GFXfont* font=nullptr;
  char lines[3][128]={{0}};
};

struct EditorialReminderSection {
  const ReminderBucket* bucket=nullptr;
  const char* heading=nullptr;
  int x=0, y=0, w=0, h=0;
  int headingH=0, headingY=0;
  int usedH=0, shown=0;
  const GFXfont* headingFont=nullptr;
  EditorialReminderRow rows[5];
};

struct EditorialReminderPlan {
  EditorialRemindersFamily family=REM_EDIT_STACKED;
  int shown=0, overflow=0, sectionCount=0;
  int pad=0, innerX=0, innerY=0, innerW=0, innerH=0;
  int footerH=0, footerX=0, footerY=0, footerW=0;
  int panoramaHeadingX=0, panoramaHeadingY=0;
  const char* panoramaHeading=nullptr;
  const GFXfont* panoramaHeadingFont=nullptr;
  EditorialReminderSection sections[2];
};

// The candidate is intentionally heap-backed. It MUST NOT increase legacy
// ESP32 static DRAM or add a large stack object in the render loop.
static EditorialReminderPlan* g_remindersEditorialPlan=nullptr;

static int editorialAdvance(const GFXfont* font) {
  return font ? (int)pgm_read_byte(&font->yAdvance) : 0;
}

static bool editorialFitsInk(const char* text,const GFXfont* font,
                             int maxWidth,int maxHeight) {
  if(!text || !text[0] || !font || maxWidth<=0 || maxHeight<=0) return false;
  int16_t x1=0,y1=0;uint16_t w=0,h=0;
  measureText(text,font,x1,y1,w,h);
  return w>0 && h>0 && (int)w<=maxWidth && (int)h<=maxHeight;
}

static const GFXfont* editorialHeadingFont(const char* title,
                                            int width,int height,bool compact) {
  const GFXfont* fonts[]={
    RemindEditorialFonts::fraunces72(),
    RemindEditorialFonts::fraunces48(),
    RemindEditorialFonts::dm24(),
    RemindEditorialFonts::dm18()
  };
  for(int i=0;i<4;++i) {
    if(i==0 && (compact || height<260))continue;
    if(i==1 && compact && height<90)continue;
    if(editorialFitsInk(title,fonts[i],width,height))return fonts[i];
  }
  return nullptr;
}

static int editorialInkHeight(const char* text,const GFXfont* font) {
  int16_t x1=0,y1=0;uint16_t w=0,h=0;
  measureText(text,font,x1,y1,w,h);
  return (int)h;
}

static bool planEditorialRow(EditorialReminderRow& out,int idx,int x,int y,
                             int width,int remainingH,const GFXfont* titleFont) {
  if(idx<0 || idx>=g_cache->count || width<55 || remainingH<24 ||
     !titleFont)return false;
  const ReminderItem& reminder=g_cache->items[idx];
  const GFXfont* timeFont=RemindEditorialFonts::dm18();
  const bool timed=reminder.time[0]!=0;
  const int timeInkH=timed?editorialInkHeight(reminder.time,timeFont):0;
  const int timeW=timed?textWidth(reminder.time,timeFont)+14:0;
  if(timed && !editorialFitsInk(reminder.time,timeFont,width,25))return false;

  // Time is essential, never truncated. Prefer a side caption; fall back to
  // a separate caption when this gives the full title meaningful width.
  for(int mode=0;mode<(timed?2:1);++mode) {
    const bool stacked=timed && mode==1;
    const int titleX=x+(stacked?0:timeW);
    const int titleW=width-(stacked?0:timeW)-2;
    if(titleW<48)continue;
    const int step=max(20,editorialAdvance(titleFont));
    const int titleTop=y+(stacked?timeInkH+8:3);
    const int titleCapacity=remainingH-(titleTop-y)-6;
    if(titleCapacity<12)continue;
    const int linesAllowed=min(3,max(1,(titleCapacity+step-12)/step));
    bool complete=false;
    char lines[3][128]={{0}};
    const int lineCount=wrapTextToLines(reminder.title,lines,
                                        linesAllowed,titleW,titleFont,complete);
    if(!complete || lineCount<=0)continue;

    int biggestInkH=0;
    bool valid=true;
    for(int i=0;i<lineCount;++i) {
      int16_t tx=0,ty=0;uint16_t tw=0,th=0;
      measureText(lines[i],titleFont,tx,ty,tw,th);
      if(!th || (int)tw>titleW) {valid=false;break;}
      biggestInkH=max(biggestInkH,(int)th);
    }
    if(!valid)continue;
    const int titleH=(lineCount-1)*step+biggestInkH;
    const int itemH=max(timed?timeInkH+7:0,
                        (titleTop-y)+titleH+6);
    if(itemH>remainingH)continue;

    out=EditorialReminderRow{};
    out.itemIdx=idx;
    out.x=x;out.y=y;out.w=width;out.h=itemH;
    out.titleX=titleX;out.titleY=titleTop;
    out.timeY=y+(stacked?0:5);
    out.lineCount=lineCount;out.lineStep=step;
    out.font=titleFont;out.stackedTime=stacked;
    for(int i=0;i<lineCount;++i)
      safeCopy(out.lines[i],sizeof(out.lines[i]),lines[i]);
    return true;
  }
  return false;
}

static bool planEditorialSection(EditorialReminderSection& section,
                                 const ReminderBucket* bucket,
                                 const char* heading,int x,int y,int w,int h,
                                 bool withHeading) {
  if(!bucket || bucket->count<=0 || w<65 || h<33)return false;
  section=EditorialReminderSection{};
  section.bucket=bucket;section.heading=heading;
  section.x=x;section.y=y;section.w=w;section.h=h;
  if(withHeading) {
    section.headingFont=editorialHeadingFont(heading,w-2,h,false);
    if(!section.headingFont)return false;
    const int inkH=editorialInkHeight(heading,section.headingFont);
    const int below= h>240 ? 23 : h>135 ? 17 : 10;
    section.headingH=inkH+below;
    section.headingY=y;
  }

  // A stable font throughout each section is more editorial than per-row
  // font jumps. Test complete-word rows at the actual GFX bitmap widths.
  const GFXfont* fonts[]={
    RemindEditorialFonts::dm24(),RemindEditorialFonts::dm18(),FONT_B9
  };
  int bestScore=-1;
  EditorialReminderSection best=section;
  for(int fi=0;fi<3;++fi){
    EditorialReminderSection trial=section;
    const GFXfont* font=fonts[fi];
    const int gap=(h>260?18:h>155?12:7);
    int cursor=y+trial.headingH;
    for(int i=0;i<bucket->count && i<5;++i) {
      // Treat the end of the section as a hard ink bound.
      EditorialReminderRow row;
      if(!planEditorialRow(row,bucket->itemIdx[i],x,cursor,w,
                           y+h-cursor,font))break;
      trial.rows[trial.shown++]=row;
      cursor += row.h + gap;
    }
    if(!trial.shown)continue;
    trial.usedH=cursor-y-gap;
    // Content preservation first; use larger original bitmap typography
    // when two candidates show the same complete number of items.
    const int score=trial.shown*100 + (2-fi)*15;
    if(score>bestScore){bestScore=score;best=trial;}
  }
  if(bestScore<0)return false;
  section=best;
  return true;
}

static void editorialShiftSection(EditorialReminderSection& section,int dy) {
  section.headingY+=dy;
  for(int i=0;i<section.shown;++i){
    section.rows[i].y+=dy;
    section.rows[i].titleY+=dy;
    section.rows[i].timeY+=dy;
  }
}

// Like Date/Weather, this is ONE pixel-derived composition policy for all
// 16 possible 4x4 rectangular spans, never a per-shape renderer table.
static bool planEditorialReminders(const Cell& c,
                                   const ReminderBucket* buckets,int bucketCount) {
  if(!g_cache || !g_cache->ok || g_cache->count==0 || c.w<135 || c.h<95)
    return false;
  const int todayIndex=findBucketByDaysUntil(buckets,bucketCount,0);
  const int tomorrowIndex=findBucketByDaysUntil(buckets,bucketCount,1);
  // Preserve non-today/tomorrow and overdue rendering through the unchanged
  // production fallback; no date-group meaning is invented.
  if(todayIndex<0 && tomorrowIndex<0)return false;
  const ReminderBucket* primary=todayIndex>=0
    ?&buckets[todayIndex]:&buckets[tomorrowIndex];
  const char* primaryHeading=todayIndex>=0?"Today":"Tomorrow";
  const ReminderBucket* secondary=(todayIndex>=0 && tomorrowIndex>=0)
    ?&buckets[tomorrowIndex]:nullptr;

  if(!g_remindersEditorialPlan)
    g_remindersEditorialPlan=static_cast<EditorialReminderPlan*>(
      malloc(sizeof(EditorialReminderPlan)));
  if(!g_remindersEditorialPlan)return false;
  EditorialReminderPlan& plan=*g_remindersEditorialPlan;
  plan=EditorialReminderPlan{};

  const int pad=max(9,min(22,(int)lroundf(min(c.w,c.h)*.070f)));
  plan.pad=pad;
  plan.innerX=c.x+pad;plan.innerY=c.y+pad;
  plan.innerW=c.w-pad*2;plan.innerH=c.h-pad*2;
  const int x=plan.innerX,y=plan.innerY,w=plan.innerW,h=plan.innerH;
  if(w<65 || h<60)return false;

  // Reserve a precise small footer before composing the body so
  // undisplayed reminders are NEVER silently discarded.
  plan.footerH=g_cache->count>1 ? 20 : 0;
  const int bodyH=h-plan.footerH-(plan.footerH?5:0);
  if(bodyH<37)return false;
  bool planned=false;

  if(w>=355 && bodyH<=152) {
    const int heroW=max(124,min(235,w*28/100));
    const int gap=16;
    const int listX=x+heroW+gap;
    if(planEditorialSection(plan.sections[0],primary,primaryHeading,
                             listX,y,w-(listX-x),bodyH,false)) {
      const GFXfont* heading=editorialHeadingFont(primaryHeading,
                                heroW-4,bodyH,true);
      if(heading) {
        plan.family=REM_EDIT_PANORAMA;
        plan.panoramaHeading=primaryHeading;
        plan.panoramaHeadingFont=heading;
        plan.panoramaHeadingX=x;
        plan.panoramaHeadingY=y+max(0,(bodyH-editorialInkHeight(
                                     primaryHeading,heading))/2);
        plan.sectionCount=1;
        planned=true;
      }
    }
  }
  if(!planned && secondary && bodyH>=215 && w>=525) {
    const int gap=26;
    const int leftW=(w-gap)*53/100;
    if(planEditorialSection(plan.sections[0],primary,"Today",
                             x,y,leftW,bodyH,true) &&
       planEditorialSection(plan.sections[1],secondary,"Tomorrow",
                             x+leftW+gap,y,w-leftW-gap,bodyH,true)){
      plan.family=REM_EDIT_TWO_COLUMNS;
      plan.sectionCount=2;
      planned=true;
    }
  }
  if(!planned && secondary && bodyH>=280) {
    const int gap=14;
    const int firstH=(bodyH-gap)*54/100;
    if(planEditorialSection(plan.sections[0],primary,"Today",
                             x,y,w,firstH,true) &&
       planEditorialSection(plan.sections[1],secondary,"Tomorrow",
                             x,y+firstH+gap,w,bodyH-firstH-gap,true)){
      plan.family=REM_EDIT_TWO_STORIES;
      plan.sectionCount=2;planned=true;
    }
  }
  if(!planned) {
    // Failed multi-section preflight is not fatal: keep the earliest complete
    // day and disclose the rest in the footer.
    if(!planEditorialSection(plan.sections[0],primary,primaryHeading,
                             x,y,w,bodyH,true))return false;
    plan.family=REM_EDIT_STACKED;
    plan.sectionCount=1;
  }

  // Controlled optical balance: each section uses a shared offset in the
  // two-column design so both Fraunces headlines stay on the same baseline.
  if(plan.family==REM_EDIT_TWO_COLUMNS) {
    int used=max(plan.sections[0].usedH,plan.sections[1].usedH);
    const int shift=min(78,max(0,(bodyH-used)*30/100));
    editorialShiftSection(plan.sections[0],shift);
    editorialShiftSection(plan.sections[1],shift);
  } else if(plan.family==REM_EDIT_TWO_STORIES) {
    // Sections already own separate reserved vertical rectangles.
    for(int i=0;i<2;++i) {
      EditorialReminderSection& s=plan.sections[i];
      editorialShiftSection(s,min(18,max(0,(s.h-s.usedH)/4)));
    }
  } else if(plan.family==REM_EDIT_STACKED) {
    EditorialReminderSection& s=plan.sections[0];
    const int shift=min(92,max(0,(bodyH-s.usedH)*32/100));
    editorialShiftSection(s,shift);
  } else {
    EditorialReminderSection& s=plan.sections[0];
    editorialShiftSection(s,max(0,(bodyH-s.usedH)/2));
  }
  for(int i=0;i<plan.sectionCount;++i)plan.shown+=plan.sections[i].shown;
  if(plan.shown<=0)return false;
  plan.overflow=max(0,g_cache->count-plan.shown);
  plan.footerX=x;plan.footerW=w;
  plan.footerY=y+h-plan.footerH;
  return true;
}

static void paintEditorialText(const char* text,const GFXfont* font,
                               int x,int top) {
  int16_t x1=0,y1=0;uint16_t w=0,h=0;
  measureText(text,font,x1,y1,w,h);
  drawLeft(x-x1,top-y1,text,font,Theme::ink());
}

static bool renderEditorialRemindersPreview(const Cell& c,
                                            const ReminderBucket* buckets,int bucketCount) {
  if(!planEditorialReminders(c,buckets,bucketCount))return false;
  const EditorialReminderPlan& plan=*g_remindersEditorialPlan;
  if(plan.family==REM_EDIT_PANORAMA)
    paintEditorialText(plan.panoramaHeading,plan.panoramaHeadingFont,
                       plan.panoramaHeadingX,plan.panoramaHeadingY);
  for(int s=0;s<plan.sectionCount;++s) {
    const EditorialReminderSection& section=plan.sections[s];
    if(section.headingFont)
      paintEditorialText(section.heading,section.headingFont,
                         section.x,section.headingY);
    for(int r=0;r<section.shown;++r) {
      const EditorialReminderRow& row=section.rows[r];
      const ReminderItem& item=g_cache->items[row.itemIdx];
      if(item.time[0])
        paintEditorialText(item.time,RemindEditorialFonts::dm18(),
                           row.x,row.timeY);
      for(int line=0;line<row.lineCount;++line)
        paintEditorialText(row.lines[line],row.font,
                           row.titleX,row.titleY+line*row.lineStep);
    }
  }
  if(plan.overflow>0 && plan.footerH>0) {
    char text[24]={0};
    snprintf(text,sizeof(text),"+%d more",plan.overflow);
    const GFXfont* font=RemindEditorialFonts::dm18();
    if(editorialFitsInk(text,font,plan.footerW,plan.footerH))
      paintEditorialText(text,font,plan.footerX,plan.footerY+2);
  }
  return true;
}
#endif // REMIND_REMINDERS_EDITORIAL_PREVIEW_ENABLED
