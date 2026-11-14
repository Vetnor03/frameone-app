// Ski R1 native test: production GFX code + exact original glyph bitmaps.
// The Python driver inserts helpers from CURRENT ModuleSki.cpp.
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
#include "FreeSans9ptNO.h"
#include "FreeSansBold12ptNO.h"
#include "FreeSansBold18ptNO.h"
using std::min;
using std::max;
using std::isfinite;
#define FONT_9 (&FreeSans9pt8b)
#define FONT_B12 (&FreeSansBold12pt8b)
#define FONT_B18 (&FreeSansBold18pt8b)

struct Cell {int x=0,y=0,w=0,h=0;};
// === SKI_REAL_CACHE_STRUCT ===

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
  void drawFastVLine(int x,int y,int h,uint16_t color){
    for(int dy=0;dy<h;++dy)drawPixel(x,y+dy,color);
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

// UTF-8 → checked-in Latin-1 GFX glyphs, equivalent for source fixtures.
namespace FrameText {
void normalizeUtf8ForDisplay(char* out,size_t capacity,const char* in){
  if(!out || !capacity)return;
  size_t n=0;out[0]=0;
  for(const unsigned char* p=(const unsigned char*)(in?in:"");*p && n+1<capacity;++p){
    if((*p==0xC2 || *p==0xC3) && p[1]) {
      const unsigned char lead=*p;
      const unsigned char b=*++p;
      out[n++]=(char)(((lead==0xC3?0x40:0x00)|(b & 0x3F))|0x80);
    } else out[n++]=(char)*p;
  }
  out[n]=0;
}
}
// === SKI_REAL_PRODUCTION_HELPERS ===
#define REMIND_SKI_EDITORIAL_PREVIEW_ENABLED 1
#include "SkiEditorialPreview.h"

static void prepare(const std::string& scenario){
  // All fixtures model the *SkiCache* produced by the existing device API,
  // without changing its real selection/rounding/label functions.
  g_cache=SkiCache{};
  g_cache.valid=true;
  g_cache.norwegian=true;
  strcpy(g_cache.location,"HEMSEDAL");
  g_cache.freshCm=24;
  g_cache.totalCm=147;
  g_cache.tempC=-4.8f;
  g_cache.windMps=3.7f;
  g_cache.windDirDeg=315;
  g_cache.avalancheAvailable=true;
  g_cache.avalancheAssessed=true;
  g_cache.avalancheLevel=2;
  g_cache.resortAvailable=true;
  g_cache.resortOpen=true;g_cache.skiOpen=true;
  g_cache.liftsOpen=6;g_cache.liftsTotal=8;
  strcpy(g_cache.resortName,"Hemsedal");
  g_cache.powderFound=true;
  strcpy(g_cache.powderDate,"søndag");
  g_cache.powderLowCm=12;g_cache.powderHighCm=25;
  if(scenario=="english"){
    g_cache.norwegian=false;
    strcpy(g_cache.location,"TRYVANN");
  } else if(scenario=="none"){
    g_cache.freshCm=NAN;g_cache.totalCm=NAN;
    g_cache.tempC=NAN;g_cache.windMps=NAN;g_cache.windDirDeg=NAN;
    g_cache.avalancheAvailable=false;g_cache.avalancheAssessed=false;
    g_cache.avalancheLevel=0;g_cache.resortAvailable=false;
    g_cache.powderFound=false;
  } else if(scenario=="zero"){
    g_cache.freshCm=0;g_cache.totalCm=0;
  } else if(scenario=="heavy_snow"){
    g_cache.freshCm=134;g_cache.totalCm=598;
  } else if(scenario=="avalanche_high"){
    g_cache.avalancheLevel=5;
  } else if(scenario=="unassessed"){
    g_cache.avalancheAssessed=false;g_cache.avalancheLevel=0;
  } else if(scenario=="closed"){
    g_cache.resortOpen=false;g_cache.skiOpen=false;g_cache.liftsOpen=0;
    g_cache.powderFound=false;
  } else if(scenario=="long_location"){
    strcpy(g_cache.location,"KVITFJELL VEST STORE ALPINSENTER");
  } else if(scenario=="long_resort"){
    strcpy(g_cache.resortName,"Et usedvanlig langt navn på et alpinanlegg");
    strcpy(g_cache.powderDate,"søndag 15. november");
  } else if(scenario=="powder_no_resort"){
    g_cache.resortAvailable=false;
  } else if(scenario=="resort_no_powder"){
    g_cache.powderFound=false;
  } else if(scenario!="normal"){
    std::cerr<<"unknown scenario: "<<scenario<<"\n";exit(2);
  }
}

int main(int argc,char** argv){
  if(argc<2){std::cerr<<"Usage: host OUT_DIR\n";return 2;}
  const char* scenarios[]={"normal","english","none","zero","heavy_snow",
     "avalanche_high","unassessed","closed","long_location","long_resort",
     "powder_no_resort","resort_no_powder"};
  std::cout<<"scenario,theme,cols,rows,preview,escaped,offscreen,ink_pixels\n";
  for(const char* scenario:scenarios) {
    for(int theme=0;theme<2;++theme) {
      Theme::darkTheme=theme!=0;
      for(int rows=1;rows<=4;++rows)for(int cols=1;cols<=4;++cols) {
        prepare(scenario);
        const Cell c{0,0,cols*200,rows*120};
        display().reset(theme!=0,c);
        const bool preview=renderSkiEditorialPreview(c,g_cache);
        int ink=0;
        for(int y=0;y<c.h;++y)for(int x=0;x<c.w;++x){
          const bool pixel=display().pixels[y*800+x]!=0;
          if(pixel!=(theme!=0))++ink;
        }
        char filename[250];
        snprintf(filename,sizeof(filename),"%s/%s_%s_%dx%d.pgm",
          argv[1],scenario,theme?"dark":"light",cols,rows);
        display().save(filename);
        std::cout<<scenario<<","<<(theme?"dark":"light")<<","
          <<cols<<","<<rows<<","<<(preview?1:0)<<","
          <<display().escape<<","<<display().outer<<","<<ink<<"\n";
      }
    }
  }
  return 0;
}
