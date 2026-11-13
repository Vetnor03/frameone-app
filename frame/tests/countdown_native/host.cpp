// RE:MIND Countdown R3 — host framebuffer for production C++ glyph and ink code.
// This is deliberately NOT a browser/CSS renderer. The Python driver inserts
// the exact helper/calendar/adaptive C++ from ModuleCountdown.cpp below.
#include <algorithm>
#include <cassert>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>
#include <Adafruit_GFX.h>
#include "RemindEditorialFonts.h"
#include "CountdownAdaptivePolicy.h"
#include "FreeSans9ptNO.h"
#include "FreeSansBold12ptNO.h"
using std::min;
using std::max;

static const GFXfont* FONT_B9 = &FreeSans9pt8b;
static const GFXfont* FONT_B12 = &FreeSansBold12pt8b;
static const GFXfont* FONT_B18 = RemindEditorialFonts::dm24();

// The Linux host libc provides strlcpy; production supplies its Arduino variant.

struct Cell { int x=0,y=0,w=0,h=0; };
struct CountdownItem {
  bool used=false, pinned=false;
  char id[48]={0};
  char title[96]={0};
  char targetDate[16]={0};
  char displayDate[24]={0};
  int daysLeft=0;
  bool isToday=false, isPast=false;
};
static const int MAX_EVENTS=20;
struct CountdownCache {
  bool loaded=false,ok=false;
  int count=0;
  CountdownItem items[MAX_EVENTS];
};
static CountdownCache g_cache;

class MockDisplay {
 public:
  static const int WIDTH=800,HEIGHT=480;
  std::vector<uint8_t> pixels=std::vector<uint8_t>(WIDTH*HEIGHT,0);
  const GFXfont* active=nullptr;
  int cursorX=0,cursorY=0,textSize=1;
  uint16_t textInk=1;
  Cell clip{0,0,WIDTH,HEIGHT};
  int escape=0,outer=0;
  void reset(bool dark,Cell c) {
    std::fill(pixels.begin(),pixels.end(),dark?1:0);
    clip=c;escape=0;outer=0;active=nullptr;
  }
  void setFont(const GFXfont* f) {active=f;}
  void setTextSize(int n) {textSize=n;}
  void setTextColor(uint16_t ink) {textInk=ink;}
  void setCursor(int x,int y) {cursorX=x;cursorY=y;}
  void drawPixel(int x,int y,uint16_t color) {
    if (x<0||x>=WIDTH||y<0||y>=HEIGHT){++outer;return;}
    if(x<clip.x||x>=clip.x+clip.w||y<clip.y||y>=clip.y+clip.h)++escape;
    pixels[y*WIDTH+x]=(color!=0);
  }
  void drawFastHLine(int x,int y,int w,uint16_t color){
    for(int dx=0;dx<w;++dx)drawPixel(x+dx,y,color);
  }
  void drawLine(int x0,int y0,int x1,int y1,uint16_t color){
    int dx=abs(x1-x0),sx=x0<x1?1:-1,dy=-abs(y1-y0),sy=y0<y1?1:-1,e=dx+dy;
    while(true){drawPixel(x0,y0,color);if(x0==x1&&y0==y1)break;
      int e2=e*2;if(e2>=dy){e+=dy;x0+=sx;}if(e2<=dx){e+=dx;y0+=sy;}
    }
  }
  void fillRect(int x,int y,int w,int h,uint16_t color){
    for(int dy=0;dy<h;++dy)drawFastHLine(x,y+dy,w,color);
  }
  void drawRect(int x,int y,int w,int h,uint16_t color){
    drawFastHLine(x,y,w,color);drawFastHLine(x,y+h-1,w,color);
    drawLine(x,y,x,y+h-1,color);drawLine(x+w-1,y,x+w-1,y+h-1,color);
  }
  void getTextBounds(const char* s,int16_t x,int16_t y,
    int16_t* x1,int16_t* y1,uint16_t* w,uint16_t* h) const {
    if (!active||!s){*x1=x;*y1=y;*w=0;*h=0;return;}
    int xmin=32767,ymin=32767,xmax=-32768,ymax=-32768;
    int cursor=x;
    for(const unsigned char* p=(const unsigned char*)s;*p;++p){
      const int c=*p;
      if(c<active->first||c>active->last)continue;
      const GFXglyph& g=active->glyph[c-active->first];
      if(g.width&&g.height) {
        xmin=min(xmin,cursor+g.xOffset);
        ymin=min(ymin,y+g.yOffset);
        xmax=max(xmax,cursor+g.xOffset+g.width-1);
        ymax=max(ymax,y+g.yOffset+g.height-1);
      }
      cursor+=g.xAdvance;
    }
    if(xmax<xmin){*x1=x;*y1=y;*w=*h=0;return;}
    *x1=xmin;*y1=ymin;*w=xmax-xmin+1;*h=ymax-ymin+1;
  }
  void print(const char* s) {
    if(!s||!active)return;
    for(const unsigned char* p=(const unsigned char*)s;*p;++p) {
      const int ch=*p;
      if(ch<active->first||ch>active->last)continue;
      const GFXglyph& g=active->glyph[ch-active->first];
      uint32_t bit=0;
      for(int yy=0;yy<g.height;++yy)for(int xx=0;xx<g.width;++xx) {
        const uint8_t byte=active->bitmap[g.bitmapOffset+(bit>>3)];
        if(byte & (0x80>>(bit&7)))
          drawPixel(cursorX+g.xOffset+xx,cursorY+g.yOffset+yy,textInk);
        ++bit;
      }
      cursorX+=g.xAdvance;
    }
  }
  void save(const std::string& file) const {
    std::ofstream out(file,std::ios::binary);
    out<<"P5\n"<<WIDTH<<" "<<HEIGHT<<"\n255\n";
    for(uint8_t v:pixels){const unsigned char value=v?0:255;out.write((char*)&value,1);}
  }
};
static MockDisplay& display(){static MockDisplay d;return d;}

namespace DisplayCore { static MockDisplay& get(){return display();} }
namespace Theme { static bool darkTheme=false;static uint16_t ink(){return darkTheme?0:1;} }
static bool getLocalTime(tm* output,int /*timeout*/=10){
  memset(output,0,sizeof(*output));
  output->tm_year=2026-1900;output->tm_mon=10;output->tm_mday=13;
  output->tm_hour=13;output->tm_wday=5;return true;
}

// === EXTRACTED_PRODUCTION_HELPERS ===
// === EXTRACTED_PRODUCTION_CALENDAR ===
// === EXTRACTED_PRODUCTION_ADAPTIVE ===
#define REMIND_COUNTDOWN_EDITORIAL_PREVIEW_ENABLED 1
#include "CountdownEditorialPreview.h"

static void append(const char* title,int days,bool pinned,const char* date,
                   const char* displayDate="") {
  assert(g_cache.count<MAX_EVENTS);
  CountdownItem& item=g_cache.items[g_cache.count++];
  item=CountdownItem{};
  item.used=true;item.pinned=pinned;
  strlcpy(item.title,title,sizeof(item.title));
  strlcpy(item.targetDate,date,sizeof(item.targetDate));
  strlcpy(item.displayDate,displayDate,sizeof(item.displayDate));
  item.daysLeft=days;item.isToday=days==0;item.isPast=days<0;
}
static void prepareScenario(const std::string& scenario){
  g_cache=CountdownCache{};g_cache.loaded=true;g_cache.ok=true;
  if(scenario=="failed"){g_cache.ok=false;return;}
  if(scenario=="empty")return;
  if(scenario=="one"){
    append("Sommerferie",218,false,"2027-06-19","19. juni 2027");
  } else if(scenario=="today"){
    append("V\xE5r bryllupsdag",0,true,"2026-11-13","13. november");
  } else if(scenario=="past"){
    append("F\xF8""dselsdag",-4,false,"2026-11-09","9. november");
  } else if(scenario=="long"){
    append("V\xE5r fantastiske sommerferie til Lofoten og Vester\xE5len",
           193,false,"2027-05-25","25. mai 2027");
  } else if(scenario=="pinned"){
    append("Sommerferie",218,false,"2027-06-19","19. juni 2027");
    append("Jul",42,true,"2026-12-25","25. desember");
    append("Bryllup",120,false,"2027-03-13");
  } else if(scenario=="dense"){
    append("Jul",42,true,"2026-12-25");
    append("F\xF8""dselsdag",13,false,"2026-11-26");
    append("Reise til Danmark",17,false,"2026-11-30");
    append("Sommerferie",218,false,"2027-06-19");
    append("Middag",34,false,"2026-12-17");
    append("Nytt\xE5r",49,false,"2027-01-01");
    append("Helgetur",58,false,"2027-01-10");
  } else if(scenario=="far"){
    append("Huset er ferdig",2048,false,"2032-06-11");
  } else if(scenario=="long_number"){
    append("Ferie",12345,false,"2060-09-07");
  } else {
    std::cerr<<"Unknown scenario "<<scenario<<"\n";std::exit(2);
  }
  sortCacheItems(); // EXACT production comparator and selection helpers
}

// We intentionally test the 16 rectangles, not 16 arbitrary visual presets.
int main(int argc,char** argv){
  if(argc<2){std::cerr<<"Usage: host OUT_DIR\n";return 2;}
  const std::string base=argv[1];
  const char* scenarios[]={"one","dense","long","today","past","pinned",
                          "empty","failed","far","long_number"};
  std::cout<<"scenario,theme,cols,rows,preview,fallback,escaped,offscreen,ink_pixels\n";
  for(const char* scenario:scenarios) {
    for(int theme=0;theme<2;++theme) {
      Theme::darkTheme=theme!=0;
      for(int rows=1;rows<=4;++rows)for(int cols=1;cols<=4;++cols) {
        prepareScenario(scenario);
        const Cell c{0,0,cols*200,rows*120};
        display().reset(theme!=0,c);
        bool preview=renderEditorialCountdownPreview(c);
        if(!preview)renderAdaptiveCountdown(c);
        int ink=0;
        for(int y=0;y<c.h;++y)for(int x=0;x<c.w;++x) {
          const bool p=display().pixels[y*800+x]!=0;
          if(p!=(theme!=0))++ink;
        }
        char filename[256];
        snprintf(filename,sizeof(filename),"%s/%s_%s_%dx%d.pgm",
                 base.c_str(),scenario,theme?"dark":"light",cols,rows);
        display().save(filename);
        std::cout<<scenario<<","<<(theme?"dark":"light")<<","
          <<cols<<","<<rows<<","<<(preview?1:0)<<","<<(preview?0:1)
          <<","<<display().escape<<","<<display().outer<<","<<ink<<"\n";
      }
    }
  }
}
