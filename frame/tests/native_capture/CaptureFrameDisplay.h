#pragma once
// HOST-ONLY Adafruit_GFX-compatible 1-bit raster for unmodified ModuleDate.cpp.
// This is NOT GxEPD2's real internal page buffer or controller waveform.
// It uses actual firmware draw/print/getTextBounds call sites and ORIGINAL
// compiled firmware GFXglyph data. Deliberately separate from production.
#include <Arduino.h>
#include <Adafruit_GFX.h>
#include <algorithm>
#include <string>
#include <vector>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

class CaptureFrameDisplay {
public:
  static const int WIDTH=800, HEIGHT=480;
  std::vector<uint8_t> pixels;
  int outOfBounds=0;
  const GFXfont* font=nullptr;
  int16_t cursorX=0,cursorY=0;
  uint16_t color=GxEPD_BLACK;
  bool wrap=true;
  uint8_t textSize=1;

  CaptureFrameDisplay():pixels(WIDTH*HEIGHT,0){}
  void clear(uint16_t paper) {
    std::fill(pixels.begin(),pixels.end(),paper==GxEPD_BLACK?1:0);
    outOfBounds=0;font=nullptr;cursorX=cursorY=0;textSize=1;
    color=paper==GxEPD_BLACK?GxEPD_WHITE:GxEPD_BLACK;wrap=true;
  }
  void setFont(const GFXfont* ptr){font=ptr;}
  void setCursor(int16_t x,int16_t y){cursorX=x;cursorY=y;}
  void setTextSize(uint8_t s){textSize=s?s:1;}
  void setTextWrap(bool enabled){wrap=enabled;}
  void setTextColor(uint16_t c){color=c;}
  void drawPixel(int16_t x,int16_t y,uint16_t c) {
    if(x<0||y<0||x>=WIDTH||y>=HEIGHT){++outOfBounds;return;}
    pixels[static_cast<size_t>(y)*WIDTH+x]=(c==GxEPD_BLACK)?1:0;
  }
  void fillRect(int16_t x,int16_t y,int16_t w,int16_t h,uint16_t c){
    if(w<=0||h<=0)return;
    const int xmin=std::max(0,static_cast<int>(x));
    const int xmax=std::min(WIDTH,static_cast<int>(x)+w);
    const int ymin=std::max(0,static_cast<int>(y));
    const int ymax=std::min(HEIGHT,static_cast<int>(y)+h);
    for(int yy=ymin;yy<ymax;++yy)
      for(int xx=xmin;xx<xmax;++xx)drawPixel(xx,yy,c);
    if(xmin!=x||ymin!=y||xmax!=x+w||ymax!=y+h)++outOfBounds;
  }
  void drawLine(int16_t x0,int16_t y0,int16_t x1,int16_t y1,uint16_t c) {
    // Adafruit_GFX writeLine: same steep swap / endpoint swap / error ties.
    bool steep=abs(y1-y0)>abs(x1-x0);
    if(steep){std::swap(x0,y0);std::swap(x1,y1);}
    if(x0>x1){std::swap(x0,x1);std::swap(y0,y1);}
    const int dx=x1-x0,dy=abs(y1-y0);
    int err=dx/2,y=y0,step=y0<y1?1:-1;
    for(int x=x0;x<=x1;++x) {
      if(steep)drawPixel(y,x,c);else drawPixel(x,y,c);
      err-=dy;
      if(err<0){y+=step;err+=dx;}
    }
  }
  void drawCircle(int16_t x0,int16_t y0,int16_t r,uint16_t c){
    if(r<0)return;
    int f=1-r,ddF_x=1,ddF_y=-2*r,x=0,y=r;
    drawPixel(x0,y0+r,c);drawPixel(x0,y0-r,c);
    drawPixel(x0+r,y0,c);drawPixel(x0-r,y0,c);
    while(x<y){
      if(f>=0){--y;ddF_y+=2;f+=ddF_y;}
      ++x;ddF_x+=2;f+=ddF_x;
      drawPixel(x0+x,y0+y,c);drawPixel(x0-x,y0+y,c);
      drawPixel(x0+x,y0-y,c);drawPixel(x0-x,y0-y,c);
      drawPixel(x0+y,y0+x,c);drawPixel(x0-y,y0+x,c);
      drawPixel(x0+y,y0-x,c);drawPixel(x0-y,y0-x,c);
    }
  }
  void fillCircle(int16_t x0,int16_t y0,int16_t r,uint16_t c){
    if(r<0)return;
    // Match Adafruit_GFX 1.12.6 fillCircle + fillCircleHelper(corners=3,
    // delta=0). GxEPD2_BW 1.6.4 inherits this upstream rasterizer.
    // A Euclidean x*x+y*y disc is NOT pixel-identical at small radii.
    const auto vline=[this,c](int x,int y,int h){
      for(int i=0;i<h;++i)drawPixel(x,y+i,c);
    };
    vline(x0,y0-r,2*r+1);
    int f=1-r,ddF_x=1,ddF_y=-2*r,x=0,y=r,px=0,py=r;
    const int delta=1; // fillCircleHelper increments the caller's zero.
    while(x<y){
      if(f>=0){--y;ddF_y+=2;f+=ddF_y;}
      ++x;ddF_x+=2;f+=ddF_x;
      if(x<y+1){
        vline(x0+x,y0-y,2*y+delta);
        vline(x0-x,y0-y,2*y+delta);
      }
      if(y!=py){
        vline(x0+py,y0-px,2*px+delta);
        vline(x0-py,y0-px,2*px+delta);
        py=y;
      }
      px=x;
    }
  }
  void getTextBounds(const char* text,int16_t x,int16_t y,
                     int16_t* x1,int16_t* y1,uint16_t* w,uint16_t* h){
    int16_t minx=32767,miny=32767,maxx=-32768,maxy=-32768;
    int16_t penX=x,penY=y;
    if(text&&font&&font->glyph&&font->bitmap) {
      for(const unsigned char* p=
          reinterpret_cast<const unsigned char*>(text);*p;++p){
        if(*p=='\n'){penX=x;penY+=font->yAdvance;continue;}
        if(*p<font->first||*p>font->last)continue;
        const GFXglyph& g=font->glyph[*p-font->first];
        if(g.width&&g.height){
          const int16_t gx=penX+g.xOffset*textSize;
          const int16_t gy=penY+g.yOffset*textSize;
          minx=std::min(minx,gx);miny=std::min(miny,gy);
          maxx=std::max(maxx,static_cast<int16_t>(gx+g.width*textSize-1));
          maxy=std::max(maxy,static_cast<int16_t>(gy+g.height*textSize-1));
        }
        penX+=g.xAdvance*textSize;
      }
    }
    if(maxx<minx){*x1=x;*y1=y;*w=0;*h=0;return;}
    *x1=minx;*y1=miny;*w=maxx-minx+1;*h=maxy-miny+1;
  }
  size_t print(const char* text){
    if(!text)return 0;
    size_t n=0;
    for(const unsigned char* p=
        reinterpret_cast<const unsigned char*>(text);*p;++p,++n){
      if(*p=='\n'){cursorX=0;cursorY+=font?font->yAdvance:8;continue;}
      if(!font||!font->glyph||!font->bitmap||*p<font->first||
         *p>font->last)continue;
      const GFXglyph& g=font->glyph[*p-font->first];
      int bit=0;
      for(int yy=0;yy<g.height;++yy)
        for(int xx=0;xx<g.width;++xx,++bit){
          const uint8_t byte=font->bitmap[g.bitmapOffset+bit/8];
          if((byte&(0x80>>(bit&7)))==0)continue;
          const int px=cursorX+g.xOffset*textSize+xx*textSize;
          const int py=cursorY+g.yOffset*textSize+yy*textSize;
          for(int dy=0;dy<textSize;++dy)
            for(int dx=0;dx<textSize;++dx)drawPixel(px+dx,py+dy,color);
        }
      cursorX+=g.xAdvance*textSize;
      if(wrap&&cursorX>=WIDTH){cursorX=0;cursorY+=font->yAdvance*textSize;}
    }
    return n;
  }
};
