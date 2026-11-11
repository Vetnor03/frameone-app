// Native 1-bit R1 renderer test: compiles the SAME preview header and ORIGINAL
// RE:MIND GFX bitmaps as firmware. Not an HTML/SVG substitute.
// Does not represent the legacy fallback path or V4 waveform/reflectance.
#include <Arduino.h>
#include <Adafruit_GFX.h>
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <fstream>
#include <string>
#include <vector>
#include <filesystem>
#include "RemindEditorialFonts.h"
#include "FreeSans9ptNO.h"

using std::min;
using std::max;
namespace fs=std::filesystem;

static int g_width=800,g_height=480,g_clipped=0;
static std::vector<uint8_t> g_pixels;

struct Cell { int x,y,w,h; };

namespace Theme {
static bool dark=false;
static uint16_t ink(){return dark?0:1;}
}

static void setPixel(int x,int y,uint16_t ink) {
  if(x<0||y<0||x>=g_width||y>=g_height){++g_clipped;return;}
  g_pixels[(size_t)y*g_width+x]=(ink!=0?1:0);
}

static void gfxBounds(const char* str,const GFXfont* font,int16_t& x1,int16_t& y1,
                      uint16_t& w,uint16_t& h) {
  int x=0,minX=99999,maxX=-99999,minY=99999,maxY=-99999;
  for(const unsigned char* p=(const unsigned char*)str;*p;++p) {
    if(*p<font->first||*p>font->last)continue;
    const GFXglyph& glyph=font->glyph[*p-font->first];
    if(glyph.width&&glyph.height){
      minX=min(minX,x+(int)glyph.xOffset);
      maxX=max(maxX,x+(int)glyph.xOffset+(int)glyph.width-1);
      minY=min(minY,(int)glyph.yOffset);
      maxY=max(maxY,(int)glyph.yOffset+(int)glyph.height-1);
    }
    x+=glyph.xAdvance;
  }
  if(maxX<minX){x1=y1=0;w=h=0;return;}
  x1=(int16_t)minX;y1=(int16_t)minY;
  w=(uint16_t)(maxX-minX+1);h=(uint16_t)(maxY-minY+1);
}

static void gfxDraw(const char* str,const GFXfont* font,int x,int baseline,uint16_t ink){
  int cursor=x;
  for(const unsigned char* p=(const unsigned char*)str;*p;++p){
    if(*p<font->first||*p>font->last)continue;
    const GFXglyph& glyph=font->glyph[*p-font->first];
    uint16_t offset=glyph.bitmapOffset;
    uint8_t bit=0,bits=0;
    for(int yy=0;yy<(int)glyph.height;++yy){
      for(int xx=0;xx<(int)glyph.width;++xx){
        if(!(bit++ & 7))bits=font->bitmap[offset++];
        if(bits & 0x80)setPixel(cursor+glyph.xOffset+xx,
                                baseline+glyph.yOffset+yy,ink);
        bits<<=1;
      }
    }
    cursor+=glyph.xAdvance;
  }
}

namespace ModuleReminders {
static const GFXfont* FONT_B9=&FreeSans9pt8b;
static const int MAX_REMINDERS=10;
struct ReminderItem {
  char title[96]={0};
  char time[12]={0};
  int daysUntil=0;
};
struct ReminderBucket {
  bool used=false;
  int daysUntil=0;
  int count=0;
  int itemIdx[10]={0};
};
struct ReminderCache {
  bool ok=false;
  int count=0;
  ReminderItem items[MAX_REMINDERS];
};
static ReminderCache cache;
static ReminderCache* g_cache=&cache;
static void safeCopy(char* dst,size_t n,const char* str) {
  if(!n)return;std::snprintf(dst,n,"%s",str?str:"");
}
static void measureText(const char* txt,const GFXfont* font,int16_t& x1,
                        int16_t& y1,uint16_t& tw,uint16_t& th){
  gfxBounds(txt,font,x1,y1,tw,th);
}
static int textWidth(const char* txt,const GFXfont* font) {
  int16_t x1=0,y1=0;uint16_t w=0,h=0;measureText(txt,font,x1,y1,w,h);
  return (int)w;
}
static void drawLeft(int x,int baseline,const char* txt,const GFXfont* font,uint16_t ink) {
  gfxDraw(txt,font,x,baseline,ink);
}
static int findBucketByDaysUntil(const ReminderBucket* buckets,int n,int days) {
  for(int i=0;i<n;++i)if(buckets[i].used&&buckets[i].daysUntil==days)return i;
  return -1;
}
// Byte-for-byte equivalent wrapping semantics to the production C++ helper.
static int wrapTextToLines(const char* src,char lines[][128],int maxLines,
                           int maxWidth,const GFXfont* font,bool& complete) {
  complete=false;
  if(!lines||maxLines<=0||maxWidth<=0)return 0;
  for(int i=0;i<maxLines;++i)lines[i][0]='\0';
  if(!src||!src[0])return 0;
  char work[240];safeCopy(work,sizeof(work),src);
  int count=0;char current[128]={0};
  char* save=nullptr;
  char* word=strtok_r(work," ",&save);
  while(word){
    char candidate[128];
    int written=current[0]?
      std::snprintf(candidate,sizeof(candidate),"%s %s",current,word):
      std::snprintf(candidate,sizeof(candidate),"%s",word);
    if(written>=0&&written<(int)sizeof(candidate)&&textWidth(candidate,font)<=maxWidth){
      safeCopy(current,sizeof(current),candidate);
    } else {
      if(current[0]){
        if(count>=maxLines)return count;
        safeCopy(lines[count++],128,current);
        current[0]='\0';
      }
      if(textWidth(word,font)<=maxWidth)safeCopy(current,sizeof(current),word);
      else return 0;
    }
    word=strtok_r(nullptr," ",&save);
  }
  if(current[0]){
    if(count>=maxLines)return count;
    safeCopy(lines[count++],128,current);
  }
  complete=true;
  return count;
}
#include "RemindersEditorialPreview.h"

static void append(ReminderBucket& bucket,const char* title,const char* time) {
  if(cache.count>=MAX_REMINDERS)return;
  const int idx=cache.count++;
  safeCopy(cache.items[idx].title,sizeof(cache.items[idx].title),title);
  safeCopy(cache.items[idx].time,sizeof(cache.items[idx].time),time);
  cache.items[idx].daysUntil=bucket.daysUntil;
  bucket.itemIdx[bucket.count++]=idx;
}
static void fixture(const std::string& scenario,ReminderBucket* b) {
  cache=ReminderCache{};
  cache.ok=true;
  b[0]=ReminderBucket{};b[1]=ReminderBucket{};
  b[0].used=b[1].used=true;
  b[0].daysUntil=0;b[1].daysUntil=1;
  if(scenario=="normal"){
    append(b[0],"Handle melk og kaffe","09:00");
    append(b[0],"M\xF8te med banken","12:30");
    append(b[0],"Hente pakke","16:00");
    append(b[1],"Vanne plantene","");
    append(b[1],"Sykkelservice","14:00");
  } else if(scenario=="long"){
    append(b[0],"Ring R\xF8rleggeren om arbeidet i kjelleren","08:30");
    append(b[0],"Planlegge bursdagsmiddag for \xC5se og \xD8yvind","");
    append(b[1],"Husk \xE5 hente varer p\xE5 postkontoret","17:15");
  } else if(scenario=="many"){
    for(int i=0;i<5;++i){
      char label[88];std::snprintf(label,sizeof(label),"Dagens p\xE5minnelse %d med avtale",i+1);
      append(b[0],label,(i%2==0)?"10:30":"");
    }
    for(int i=0;i<5;++i){
      char label[88];std::snprintf(label,sizeof(label),"Morgendagens gj\xF8rem\xE5l %d",i+1);
      append(b[1],label,(i%2==0)?"18:00":"");
    }
  }
}
}

static void savePBM(const fs::path& path) {
  std::ofstream out(path,std::ios::binary);
  out<<"P4\n"<<g_width<<" "<<g_height<<"\n";
  for(int y=0;y<g_height;++y){
    uint8_t byte=0;int bits=0;
    for(int x=0;x<g_width;++x){
      byte=(uint8_t)((byte<<1)|g_pixels[(size_t)y*g_width+x]);
      if(++bits==8){out.put((char)byte);byte=0;bits=0;}
    }
    if(bits)out.put((char)(byte<<(8-bits)));
  }
}

int main(int argc,char** argv) {
  if(argc!=2)return 2;
  const fs::path root=argv[1];fs::create_directories(root);
  std::ofstream csv(root/"manifest.csv");
  csv<<"scenario,theme,cols,rows,rendered,clipped,pbm\n";
  const std::string scenarios[]={"normal","long","many"};
  int mainFailures=0;
  for(const auto& scene:scenarios)for(int dark=0;dark<2;++dark)
    for(int cols=1;cols<=4;++cols)for(int rows=1;rows<=4;++rows){
      Theme::dark=dark!=0;
      g_width=cols*200;g_height=rows*120;g_clipped=0;
      g_pixels.assign((size_t)g_width*g_height,dark?1:0);
      ModuleReminders::ReminderBucket buckets[2];
      ModuleReminders::fixture(scene,buckets);
      // All C++ preview code is exactly the firmware header (including the
      // GFX text preflight), rasterized with original glyph bitmap bytes.
      const Cell c={0,0,g_width,g_height};
      // Same field layout as frame Cell's rectangle members.
      // Header accepts c.x/y/w/h only and uses no type-specific overload.
      const bool rendered=ModuleReminders::renderEditorialRemindersPreview(c,buckets,2);
      std::string file="";
      if(rendered){
        file=scene+"_"+(dark?"dark":"light")+"_"+std::to_string(cols)+"x"+std::to_string(rows)+".pbm";
        savePBM(root/file);
      }
      csv<<scene<<","<<(dark?"dark":"light")<<","<<cols<<","<<rows<<","
         <<(rendered?1:0)<<","<<g_clipped<<","<<file<<"\n";
      // First visual review anchors must produce native bitmaps.
      if(scene=="normal" && ((cols==4&&rows==1)||(cols==2&&rows==2)||
         (cols==4&&rows==2)||(cols==4&&rows==4)) && !rendered)++mainFailures;
      if(g_clipped)++mainFailures;
    }
  return mainFailures?1:0;
}
