#pragma once
// Ski Design vNext R1 — native Fraunces/DM Sans opt-in visual review.
// Included inside the original ModuleSki anonymous namespace.
// No changes to the 4-instance cache, API, 3-hour refresh, localization,
// avalanche assessment/status, resort logic or existing fallback renderers.
#ifndef REMIND_SKI_EDITORIAL_PREVIEW_ENABLED
#define REMIND_SKI_EDITORIAL_PREVIEW_ENABLED 0
#endif

#if REMIND_SKI_EDITORIAL_PREVIEW_ENABLED

struct SkiEditorialRect { int x,y,w,h; };

enum SkiEditorialRole { SKI_HERO, SKI_HEADING, SKI_BODY, SKI_CAPTION };

static bool skiEditorialText(const char* str, const SkiEditorialRect& rect,
                            SkiEditorialRole role, bool center, bool paint) {
  if (!str || !str[0] || rect.w<16 || rect.h<10) return false;
  const GFXfont* options[] = {
    RemindEditorialFonts::fraunces72(),
    RemindEditorialFonts::fraunces48(),
    RemindEditorialFonts::dm24(),
    RemindEditorialFonts::dm18(),
    FONT_9
  };
  const int start=role==SKI_HERO?0:role==SKI_HEADING?2:role==SKI_BODY?3:4;
  const int limit=role==SKI_HERO?5:role==SKI_HEADING?5:role==SKI_BODY?5:5;
  for(int i=start;i<limit;++i) {
    const GFXfont* font=options[i];
    if(!font) continue;
    char fitted[128]={0};
    fitTextToWidth(str,fitted,sizeof(fitted),rect.w-4,font);
    int16_t bx=0,by=0;uint16_t tw=0,th=0;
    measureText(fitted,font,bx,by,tw,th);
    if(!tw || !th || (int)tw>rect.w-4 || (int)th>rect.h-2)continue;
    if(paint) {
      const int x=rect.x+(center?(rect.w-(int)tw)/2:2);
      const int y=rect.y+(rect.h-(int)th)/2;
      drawCenteredInRect(x,y,tw,th,fitted,font);
    }
    return true;
  }
  return false;
}

// The original API payload can combine normalized Latin-1 fields with
// UTF-8 degree and interpunct literals. Normalize only these known glyphs,
// so Å/Ø/Æ already converted by FrameText are never double-decoded.
static void skiEditorialPunctuation(char* value) {
  if (!value) return;
  char* read=value; char* write=value;
  while(*read) {
    const unsigned char a=(unsigned char)*read;
    const unsigned char b=(unsigned char)*(read+1);
    if(a==0xC2 && b==0xB0) {
      *write++=(char)0xB0; read+=2;
    } else if(a==0xC2 && b==0xB7) {
      *write++=' '; *write++='|'; *write++=' '; read+=2;
    } else {
      *write++=*read++;
    }
  }
  *write=0;
}

static bool skiEditorialMetric(const char* amount,const char* caption,
                               const SkiEditorialRect& area,bool paint) {
  if(area.w<75 || area.h<50)return false;
  const int numberH=min(88,max(34,area.h*66/100));
  const int captionH=min(24,max(16,area.h-numberH));
  const int groupH=numberH+captionH;
  if(groupH>area.h)return false;
  const int y=area.y+(area.h-groupH)/2;
  const SkiEditorialRect n{area.x,y,area.w,numberH};
  const SkiEditorialRect c{area.x,y+numberH,area.w,captionH};
  return skiEditorialText(amount,n,SKI_HERO,true,paint) &&
         skiEditorialText(caption,c,SKI_BODY,true,paint);
}

static bool skiEditorialDraw(const Cell& cell,const SkiCache& data,bool paint) {
  if(!data.valid)return false;
  const int pad=max(11,min(24,min(cell.w,cell.h)*7/100));
  SkiEditorialRect area{cell.x+pad,cell.y+pad,
                         cell.w-2*pad,cell.h-2*pad};
  if(area.w<125 || area.h<77)return false;
  const char* location=data.location[0]?data.location:"SKI";
  char freshNumber[16]={0},totalNumber[16]={0};
  if(isfinite(data.freshCm))snprintf(freshNumber,sizeof(freshNumber),
                                     "%d",rounded(data.freshCm));
  else strlcpy(freshNumber,"--",sizeof(freshNumber));
  if(isfinite(data.totalCm))snprintf(totalNumber,sizeof(totalNumber),
                                     "%d",rounded(data.totalCm));
  else strlcpy(totalNumber,"--",sizeof(totalNumber));

  char freshCaption[32]={0},totalCaption[32]={0};
  FrameText::normalizeUtf8ForDisplay(freshCaption,sizeof(freshCaption),
                                     data.norwegian?"cm nysnø":"cm fresh");
  strlcpy(totalCaption,data.norwegian?"cm totalt":"cm total",sizeof(totalCaption));

  char totalText[64]={0},conditions[80]={0},avalanche[80]={0};
  char resort[128]={0},powder[128]={0},unusedFresh[64]={0};
  snowText(data,unusedFresh,sizeof(unusedFresh),totalText,sizeof(totalText));
  conditionsText(data,conditions,sizeof(conditions));
  skiEditorialPunctuation(conditions);
  const bool narrow=cell.w<=260;
  avalancheText(data,avalanche,sizeof(avalanche),narrow);
  const bool haveResort=resortText(data,resort,sizeof(resort));
  const bool havePowder=powderText(data,powder,sizeof(powder));
  if(haveResort)skiEditorialPunctuation(resort);
  if(havePowder)skiEditorialPunctuation(powder);

  if(cell.h<=155) {
    // 4×1/3×1/2×1/1×1: compact side-by-side *measured* fact groups.
    // No extra decorative grids or content beyond the assigned cell.
    const int cols=area.w>=640?4:area.w>=375?3:2;
    const int headH=min(25,max(18,area.h/4));
    const int gap=5,bodyY=area.y+headH+gap,bodyH=area.h-headH-gap;
    if(bodyH<45 ||
       !skiEditorialText(location,
          SkiEditorialRect{area.x,area.y,area.w,headH},
          SKI_HEADING,true,paint))return false;
    const int cw=area.w/cols;
    const SkiEditorialRect fresh{area.x,bodyY,cw,bodyH};
    const SkiEditorialRect total{area.x+cw,bodyY,cw,bodyH};
    if(!skiEditorialMetric(freshNumber,freshCaption,fresh,paint) ||
       !skiEditorialMetric(totalNumber,totalCaption,total,paint))return false;
    if(cols>=3) {
      const SkiEditorialRect cond{area.x+cw*2,bodyY,cw,bodyH};
      if(!skiEditorialText(conditions,cond,SKI_BODY,true,paint))return false;
    }
    if(cols==4) {
      const SkiEditorialRect aval{area.x+cw*3,bodyY,area.w-cw*3,bodyH};
      if(!skiEditorialText(avalanche,aval,SKI_BODY,true,paint))return false;
    }
    return true;
  }

  const int headH=cell.w>=540?34:27;
  if(!skiEditorialText(location,SkiEditorialRect{
      area.x,area.y,area.w,headH},SKI_HEADING,true,paint))return false;
  const int gap=12;
  const SkiEditorialRect body{area.x,area.y+headH+gap,
                              area.w,area.h-headH-gap};
  if(body.h<70)return false;

  // Wide, deep cells: large snowfall on the left, the complete compact
  // facts stack on the right. The two sides are vertically balanced.
  if(body.w>=490 && body.h>=145) {
    const int gutter=max(18,min(34,body.w/20));
    const int heroW=(body.w-gutter)*53/100;
    const SkiEditorialRect hero{body.x,body.y,heroW,body.h};
    const SkiEditorialRect details{
      body.x+heroW+gutter,body.y,body.w-heroW-gutter,body.h};
    const char* facts[]={totalText,conditions,avalanche,
                          haveResort?resort:nullptr,havePowder?powder:nullptr};
    int rows=0;
    for(const char* f:facts)if(f&&f[0])++rows;
    const int rowH=30,rowGap=8;
    while(rows>3 && rows*rowH+(rows-1)*rowGap>details.h-8)--rows;
    if(rows<3 || !skiEditorialMetric(
        freshNumber,freshCaption,hero,paint))return false;
    const int blockH=rows*rowH+(rows-1)*rowGap;
    const int top=details.y+(details.h-blockH)/2;
    for(int i=0;i<rows;++i) {
      if(!skiEditorialText(facts[i],
          SkiEditorialRect{details.x,top+i*(rowH+rowGap),details.w,rowH},
          SKI_BODY,false,paint))return false;
    }
    // A restrained rule between fact groups, never a grid/test boundary.
    if(paint && body.h>=220)
      DisplayCore::get().drawFastVLine(
        body.x+heroW+gutter/2,body.y+body.h/5,
        body.h*3/5,Theme::ink());
    return true;
  }

  // Portrait and medium cards: layout the actual content as ONE block.
  // Available facts are selected by measured height, never by grid index.
  const char* facts[]={totalText,conditions,avalanche,
                        haveResort?resort:nullptr,havePowder?powder:nullptr};
  const int rowH=23,rowGap=6;
  const int heroH=min(110,max(66,body.h*39/100));
  int rows=3;
  if(haveResort)++rows;
  if(havePowder)++rows;
  const int gapH=10;
  while(rows>1 && heroH+gapH+
        rows*rowH+(rows-1)*rowGap>body.h)--rows;
  if(rows<1)return false;
  const int totalH=heroH+gapH+rows*rowH+(rows-1)*rowGap;
  if(totalH>body.h)return false;
  const int top=body.y+(body.h-totalH)/2;
  if(!skiEditorialMetric(freshNumber,freshCaption,
      SkiEditorialRect{body.x,top,body.w,heroH},paint))return false;
  const int y=top+heroH+gapH;
  for(int i=0;i<rows;++i) {
    if(!skiEditorialText(facts[i],
        SkiEditorialRect{body.x,y+i*(rowH+rowGap),body.w,rowH},
        SKI_BODY,true,paint))return false;
  }
  return true;
}

static bool renderSkiEditorialPreview(const Cell& cell,const SkiCache& data) {
  // The preview never partially paints and then calls the legacy renderer.
  // Plan everything first using exact GFX glyph bounding boxes.
  if(!skiEditorialDraw(cell,data,false))return false;
  return skiEditorialDraw(cell,data,true);
}

#endif  // REMIND_SKI_EDITORIAL_PREVIEW_ENABLED
