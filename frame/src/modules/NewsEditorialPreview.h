#pragma once
// RE:MIND News Design vNext R1 — visual-only editorial preview.
// Included from ModuleNews.cpp INSIDE namespace ModuleNews. Original fetching,
// article order, cache, language, invalidation, fallback and API are untouched.
// Real Fraunces/DM Sans GFX bitmaps; no scaled fonts or CSS.
#ifndef REMIND_NEWS_EDITORIAL_PREVIEW_ENABLED
#define REMIND_NEWS_EDITORIAL_PREVIEW_ENABLED 1
#endif

#if REMIND_NEWS_EDITORIAL_PREVIEW_ENABLED

static const int NEWS_EDITORIAL_MAX_BLOCKS = 8;
static const int NEWS_EDITORIAL_MAX_LINES = 6;

struct EditorialNewsBlock {
  int sourceIndex = -1;
  int x=0,y=0,w=0,h=0;
  int lineCount=0,lineStep=0;
  const GFXfont* font=nullptr;
  char lines[NEWS_EDITORIAL_MAX_LINES][NEWS_WRAP_LINE_BYTES]={{0}};
};

struct EditorialNewsPlan {
  int shown=0,overflow=0;
  int headerX=0,headerY=0,footerX=0,footerY=0,footerW=0,footerH=0;
  const GFXfont* headingFont=nullptr;
  int columns=1;
  EditorialNewsBlock blocks[NEWS_EDITORIAL_MAX_BLOCKS];
};

static EditorialNewsPlan* g_newsEditorialPlan=nullptr;

static int newsEditorialInkHeight(const char* str,const GFXfont* font) {
  int16_t x=0,y=0;uint16_t w=0,h=0;
  measureText(str,font,x,y,w,h);
  return (int)h;
}
static int newsEditorialAdvance(const GFXfont* font) {
  return font?(int)pgm_read_byte(&font->yAdvance):0;
}
static bool newsEditorialFits(const char* str,const GFXfont* font,int w,int h){
  if(!str || !str[0] || !font || w<=0 || h<=0)return false;
  int16_t x=0,y=0;uint16_t tw=0,th=0;
  measureText(str,font,x,y,tw,th);
  return tw>0 && th>0 && (int)tw<=w && (int)th<=h;
}

static void newsEditorialText(const char* str,const GFXfont* font,
                              int left,int top) {
  int16_t bx=0,by=0;uint16_t w=0,h=0;
  measureText(str,font,bx,by,w,h);
  drawLeft(left-bx,top-by,str,font);
}

static bool newsEditorialBlock(EditorialNewsBlock& out,int sourceIndex,
                               int x,int y,int w,int height,
                               const GFXfont* font){
  if(!g_cache || sourceIndex<0 || sourceIndex>=g_cache->count ||
     w<75 || height<24 || !font)return false;
  const NewsItem& source=g_cache->items[sourceIndex];
  if(!source.used || !source.title[0])return false;
  const int maxWidth=w-4;
  const int step=max(20,newsEditorialAdvance(font));
  const int linesFit=min(NEWS_EDITORIAL_MAX_LINES,
                         max(1,(height+step-10)/step));
  char lines[NEWS_EDITORIAL_MAX_LINES][NEWS_WRAP_LINE_BYTES]={{0}};
  bool complete=false;
  const int count=wrapTextToLines(source.title,lines,
                                  linesFit,maxWidth,font,complete);
  if(!complete || count<=0)return false;
  int tallest=0;
  for(int i=0;i<count;++i){
    if(!newsEditorialFits(lines[i],font,maxWidth,height))return false;
    tallest=max(tallest,newsEditorialInkHeight(lines[i],font));
  }
  const int used=(count-1)*step+tallest+6;
  if(used>height)return false;
  out=EditorialNewsBlock{};
  out.sourceIndex=sourceIndex;
  out.x=x;out.y=y;out.w=w;out.h=used;
  out.font=font;out.lineCount=count;out.lineStep=step;
  for(int i=0;i<count;++i)safeCopy(out.lines[i],sizeof(out.lines[i]),lines[i]);
  return true;
}

// Adaptive content-first layout: body font and complete headlines take
// precedence over showing many tiny lines. Two-column layout is selected
// from measured physical aspect/width; story order remains row-major:
// [0,1] on first row, [2,3] on second, etc. No source indices are skipped.
static bool planEditorialNews(const Cell& c){
  if(!g_cache || !g_cache->ok || g_cache->count<=0 ||
     c.w<135 || c.h<95)return false;
  if(!g_newsEditorialPlan)
    g_newsEditorialPlan=new(std::nothrow) EditorialNewsPlan{};
  if(!g_newsEditorialPlan)return false;

  const int pad=max(10,min(23,min(c.w,c.h)*7/100));
  const int left=c.x+pad,top=c.y+pad;
  const int width=c.w-2*pad,height=c.h-2*pad;
  if(width<110 || height<60)return false;

  const bool showHeading=height>=135;
  const char* heading=headerText(); // existing localization, no new strings.
  const GFXfont* headingFont=RemindEditorialFonts::dm18();
  const int labelH=showHeading?
    newsEditorialInkHeight(heading,headingFont)+12:0;
  if(showHeading && !newsEditorialFits(heading,headingFont,width,27))
    return false;

  // A footer is always reserved for multi-story inputs, so a density
  // fallback cannot silently hide headlines. It is drawn only when needed.
  const int footerH=g_cache->count>1 ? 23:0;
  const int footGap=footerH?5:0;
  const int bodyY=top+labelH,bodyH=height-labelH-footerH-footGap;
  if(bodyH<22)return false;

  const int maxItems=min(g_cache->count,NEWS_EDITORIAL_MAX_BLOCKS);

  // Roomy sparse News views benefit from an editorial lead story. Only
  // TYPOGRAPHY changes: original feed item 0 remains first and every following
  // item retains its exact index. No recency, ranking or time logic.
  // The large Fraunces headline must fit completely before this family wins.
  if(g_cache->count>=2 && g_cache->count<=5 &&
     width>=680 && bodyH>=240) {
    EditorialNewsPlan& featured=*g_newsEditorialPlan;
    featured.shown=0;featured.overflow=0;featured.columns=2;
    featured.headingFont=showHeading?headingFont:nullptr;
    featured.headerX=left;featured.headerY=top;
    featured.footerH=footerH;featured.footerW=width;
    featured.footerX=left;featured.footerY=top+height-footerH;
    EditorialNewsBlock lead;
    if(newsEditorialBlock(lead,0,left,bodyY,width,bodyH-140,
                         RemindEditorialFonts::fraunces48())) {
      featured.blocks[featured.shown++]=lead;
      const int gap=max(18,min(30,width/32));
      const int colWidth=(width-gap)/2;
      int y=bodyY+lead.h+18;
      int idx=1;
      while(idx<maxItems && y<bodyY+bodyH){
        EditorialNewsBlock row[2];
        int accepted=0,rowH=0;
        for(int col=0;col<2 && idx+col<maxItems;++col) {
          if(!newsEditorialBlock(row[col],idx+col,
                 left+col*(colWidth+gap),y,colWidth,bodyY+bodyH-y,
                 RemindEditorialFonts::dm24()))break;
          rowH=max(rowH,row[col].h);
          ++accepted;
        }
        if(!accepted)break;
        for(int col=0;col<accepted;++col)
          featured.blocks[featured.shown++]=row[col];
        idx+=accepted;
        y+=rowH+16;
        if(accepted<2)break;
      }
      featured.overflow=g_cache->count-featured.shown;
      char footer[32];
      snprintf(footer,sizeof(footer),"+%d more",featured.overflow);
      if(featured.shown>=2 &&
         (featured.overflow==0 || newsEditorialFits(footer,
              RemindEditorialFonts::dm18(),featured.footerW,footerH)))
        return true;
    }
  }

  const bool twoCols=width>=630 && g_cache->count>=2;
  const int columnChoices[2]={twoCols?2:1,1};
  for(int choice=0;choice<(twoCols?2:1);++choice) {
    const int cols=columnChoices[choice];
    const int gutter=cols==2?max(18,min(30,width/32)):0;
    const int colWidth=(width-gutter)/cols;
    if(colWidth<120)continue;

    // For a single headline on a spacious panel, Fraunces is allowed to
    // make the actual NEWS headline the hero, never the word "News".
    const GFXfont* fonts[3]={
      (maxItems==1 && width>=420 && bodyH>=190)
        ?RemindEditorialFonts::fraunces48():RemindEditorialFonts::dm24(),
      RemindEditorialFonts::dm24(),RemindEditorialFonts::dm18()
    };

    for(int fi=0;fi<3;++fi) {
      // The plan stores up to 8 × 6 original bitmap headline lines.
      // Reuse its heap allocation; only chosen rows may be read by painters.
      EditorialNewsPlan& trial=*g_newsEditorialPlan;
      trial.shown=0;
      trial.overflow=0;
      trial.columns=cols;
      trial.headingFont=showHeading?headingFont:nullptr;
      trial.headerX=left;
      trial.headerY=top;
      trial.footerH=footerH;trial.footerW=width;
      trial.footerX=left;trial.footerY=top+height-footerH;
      const GFXfont* bodyFont=fonts[fi];
      const int itemGap=bodyH>=300?19:bodyH>=180?12:8;
      int currentY=bodyY;
      int nextIndex=0;
      while(nextIndex<maxItems && currentY<bodyY+bodyH) {
        EditorialNewsBlock current[2];
        int rowUsed=0,accepted=0;
        for(int col=0;col<cols && nextIndex+col<maxItems;++col){
          const int x=left+col*(colWidth+gutter);
          if(!newsEditorialBlock(current[col],nextIndex+col,x,currentY,
                                colWidth,bodyY+bodyH-currentY,
                                bodyFont))break;
          rowUsed=max(rowUsed,current[col].h);
          ++accepted;
        }
        if(!accepted)break;
        for(int col=0;col<accepted;++col)
          trial.blocks[trial.shown++]=current[col];
        nextIndex+=accepted;
        currentY+=rowUsed+itemGap;
        // A second column cannot be allowed to hide a failed next item;
        // keep the successfully completed prefix only.
        if(accepted<cols)break;
      }
      if(trial.shown==0)continue;
      // When two-column preflight cannot fit a second headline, try the
      // full-width single column before accepting a half-empty layout.
      if(cols==2 && trial.shown<2)continue;
      trial.overflow=g_cache->count-trial.shown;
      // Draw +N only if it fully fits in the reserved footer.
      if(trial.overflow>0){
        char footer[32];
        snprintf(footer,sizeof(footer),"+%d more",trial.overflow);
        if(!footerH || !newsEditorialFits(footer,
              RemindEditorialFonts::dm18(),trial.footerW,footerH))
          continue;
      }
      return true;
    }
  }
  return false; // original production News renderer is unchanged fallback
}

static bool renderEditorialNewsPreview(const Cell& c){
  if(!planEditorialNews(c))return false;
  const EditorialNewsPlan& plan=*g_newsEditorialPlan;
  if(plan.headingFont)
    newsEditorialText(headerText(),plan.headingFont,
                      plan.headerX,plan.headerY);
  for(int i=0;i<plan.shown;++i){
    const EditorialNewsBlock& block=plan.blocks[i];
    for(int n=0;n<block.lineCount;++n)
      newsEditorialText(block.lines[n],block.font,
                        block.x,block.y+n*block.lineStep);
  }
  if(plan.overflow>0){
    char footer[32];
    snprintf(footer,sizeof(footer),"+%d more",plan.overflow);
    newsEditorialText(footer,RemindEditorialFonts::dm18(),
                      plan.footerX,plan.footerY);
  }
  return true;
}
#endif // REMIND_NEWS_EDITORIAL_PREVIEW_ENABLED
