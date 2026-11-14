#pragma once
// RE:MIND Groceries: use the already approved News R2.3 list grammar.
// This is a view-only port, not a new module design or changes to its API.
// Functions are included inside ModuleGroceries after legacy text helpers.

static void groceriesNewsDiamond(int cx, int cy) {
  const uint16_t ink=Theme::ink();
  auto& d=DisplayCore::get();
  const int radius=3;
  for(int dy=-radius;dy<=radius;++dy) {
    const int dx=radius-abs(dy);
    d.drawPixel(cx-dx,cy+dy,ink);
    d.drawPixel(cx+dx,cy+dy,ink);
  }
  d.drawPixel(cx,cy,ink);
}

// Content-first measured GFX bitmap text. Preserve the exact quantity
// prefix (e.g. "2x") and original order; text can abbreviate but cannot
// cross its allocated rectangle.
static bool groceriesNewsItem(const char* value, int x, int top,
                              int width, int height, bool centered,
                              int shown) {
  if(!value || !value[0] || width<24 || height<14)return false;
  const bool marker=shown>=2 && !centered && width>=82;
  const int markerLane=marker?17:0;
  const int textRoom=width-markerLane;
  const GFXfont* choices[]={
    RemindEditorialFonts::dm24(),RemindEditorialFonts::dm18(),FONT_B9
  };
  for(const GFXfont* font:choices) {
    if(font==RemindEditorialFonts::dm24() && height<32)continue;
    char fit[80]={0};
    fitTextToWidth(value,fit,sizeof(fit),textRoom-4,font);
    int16_t ox=0,oy=0;uint16_t tw=0,th=0;
    measureText(fit,font,ox,oy,tw,th);
    if(tw==0 || th==0 || (int)tw>textRoom-4 ||
       (int)th>height-3) continue;
    const int inkX=x+markerLane+
      (centered?max(0,(textRoom-(int)tw)/2):0);
    const int inkY=top+max(0,(height-(int)th)/2);
    drawLeft(inkX-ox,inkY-oy,fit,font,Theme::ink());
    if(marker)groceriesNewsDiamond(x+5,top+height/2);
    return true;
  }
  return false;
}

// News uses an understated heading, not a heavy full-width separator.
// Choose the actual original DM Sans bitmap only when its ink fits.
static int groceriesNewsHeading(const Cell& c,const char* heading,
                                int topPad) {
  const GFXfont* fonts[]={RemindEditorialFonts::dm18(),FONT_B12};
  const int maxW=max(24,c.w-28);
  for(const GFXfont* font:fonts) {
    char fit[80]={0};
    fitTextToWidth(heading,fit,sizeof(fit),maxW,font);
    int16_t ox=0,oy=0;uint16_t tw=0,th=0;
    measureText(fit,font,ox,oy,tw,th);
    if(!tw || !th || (int)tw>maxW)continue;
    drawLeft(c.x+(c.w-(int)tw)/2-ox,c.y+topPad-oy,
             fit,font,Theme::ink());
    return c.y+topPad+(int)th+12;
  }
  return c.y+topPad+28;
}

static void groceriesNewsAdaptiveHeading(int x,int top,int width,int height,
                                         const char* value) {
  if(width<8 || height<8)return;
  const GFXfont* fonts[]={RemindEditorialFonts::dm18(),FONT_B12};
  for(const GFXfont* font:fonts) {
    char fit[80]={0};
    fitTextToWidth(value,fit,sizeof(fit),width,font);
    int16_t ox=0,oy=0;uint16_t tw=0,th=0;
    measureText(fit,font,ox,oy,tw,th);
    if(!tw || !th || (int)tw>width || (int)th>height)continue;
    drawLeft(x+(width-(int)tw)/2-ox,
             top+(height-(int)th)/2-oy,fit,font,Theme::ink());
    return;
  }
}
