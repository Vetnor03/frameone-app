#pragma once
// RE:MIND Groceries Design vNext R1 — isolated visual-only experiment.
// Included inside ModuleGroceries namespace after the original helpers.
// This preview deliberately preserves GroceryCache, the 4-hour rotation,
// GroceriesAdaptivePolicy families, quantities, dinner/menu/insights,
// localized labels, item capacity and the original drawing fallback.
#ifndef REMIND_GROCERIES_EDITORIAL_PREVIEW_ENABLED
#define REMIND_GROCERIES_EDITORIAL_PREVIEW_ENABLED 1
#endif

#if REMIND_GROCERIES_EDITORIAL_PREVIEW_ENABLED
// The same 7-pixel editorial diamond as News R2.3, with real 1-bit ink.
// Only use for at least TWO actually visible list items.
static void groceriesEditorialLozenge(int cx, int cy) {
  const uint16_t ink=Theme::ink();
  auto& d=DisplayCore::get();
  constexpr int radius=3;
  for(int dy=-radius;dy<=radius;++dy) {
    const int dx=radius-abs(dy);
    d.drawPixel(cx-dx,cy+dy,ink);
    d.drawPixel(cx+dx,cy+dy,ink);
  }
  d.drawPixel(cx,cy,ink);
}

// A complete heading in the original approved bitmap font takes the space
// previously spent on a heavy underline. If the true GFX text will not fit,
// retain the unchanged existing title renderer (including original fallback).
static bool groceriesEditorialHeading(int x, int top, int width, int height,
                                      const char* value) {
  if(!value || !value[0] || width<90 || height<24)return false;
  const GFXfont* font=RemindEditorialFonts::dm18();
  int16_t bx=0,by=0;uint16_t tw=0,th=0;
  measureText(value,font,bx,by,tw,th);
  if(tw==0 || th==0 || (int)tw>width-6 || (int)th>height-6)return false;
  const int offsetY=max(0,(height-(int)th)/2);
  drawLeft(x+(width-(int)tw)/2-bx,top+offsetY-by,value,font,Theme::ink());
  return true;
}

// One ingredient only: no bullet. Two or more visible: refined bullet
// placed to the LEFT of the already measured text, within the original
// inner padding. Draw full title+quantity with DM Sans where there is
// enough space; otherwise use original width-fitting/ellipsis renderer.
static bool groceriesEditorialItem(const GroceryItem& item,
                                   int x,int baseline,int width,int rowH,
                                   bool horizontal,int visibleCount){
  if(width<50 || rowH<20)return false;
  char raw[72]={0};
  formatItem(item,raw,sizeof(raw)); // includes quantities such as "2x"
  const GFXfont* fonts[2]={RemindEditorialFonts::dm24(),
                            RemindEditorialFonts::dm18()};
  for(const GFXfont* font:fonts){
    int16_t bx=0,by=0;uint16_t tw=0,th=0;
    measureText(raw,font,bx,by,tw,th);
    if(tw==0 || th==0 || (int)tw>width-4 || (int)th>rowH-4)
      continue;
    const int inkX=horizontal?x+(width-(int)tw)/2:x;
    drawLeft(inkX-bx,baseline,raw,font,Theme::ink());
    if(!horizontal && visibleCount>=2)
      groceriesEditorialLozenge(x-8,baseline-5);
    return true;
  }
  return false;
}
#endif // REMIND_GROCERIES_EDITORIAL_PREVIEW_ENABLED
