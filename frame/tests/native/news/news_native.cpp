// News vNext R1: native 1-bit raster from the EXACT firmware preview header
// and original Fraunces / DM Sans GFX bitmap data. No browser mockups.
#include <Arduino.h>
#include <Adafruit_GFX.h>
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <filesystem>
#include <new>
#include <string>
#include <vector>
#include "RemindEditorialFonts.h"
using std::min;
using std::max;
namespace fs=std::filesystem;

struct Cell {int x,y,w,h;};
static int g_width=800,g_height=480,g_clipped=0,g_markerPixels=0;
static std::vector<uint8_t> g_pixels;
namespace Theme {
static bool dark=false;
static uint16_t ink(){return dark?1:0;} // 0=BLACK, 1=WHITE
}
static void pixel(int x,int y,uint16_t ink){
  if(x<0||y<0||x>=g_width||y>=g_height){++g_clipped;return;}
  g_pixels[(size_t)y*g_width+x]=ink?1:0;
}
// Pixel-accurate stand-in for DisplayCore::get().drawPixel(), used by the
// exact production C++ editorial lozenge implementation below.
namespace DisplayCore {
class NativeCanvas {
 public:
  void drawPixel(int x,int y,uint16_t ink) {
    ++g_markerPixels;
    pixel(x,y,ink);
  }
};
static NativeCanvas& get(){static NativeCanvas canvas;return canvas;}
}

static void glyphBounds(const char* text,const GFXfont* font,
                        int16_t& x1,int16_t& y1,uint16_t& w,uint16_t& h) {
  int cursor=0,minX=999999,minY=999999,maxX=-999999,maxY=-999999;
  for(const unsigned char* p=(const unsigned char*)text;*p;++p) {
    if(*p<font->first||*p>font->last)continue;
    const GFXglyph& g=font->glyph[*p-font->first];
    if(g.width&&g.height){
      minX=min(minX,cursor+(int)g.xOffset);
      minY=min(minY,(int)g.yOffset);
      maxX=max(maxX,cursor+(int)g.xOffset+(int)g.width-1);
      maxY=max(maxY,(int)g.yOffset+(int)g.height-1);
    }
    cursor+=g.xAdvance;
  }
  if(maxX<minX){x1=y1=0;w=h=0;return;}
  x1=(int16_t)minX;y1=(int16_t)minY;
  w=(uint16_t)(maxX-minX+1);h=(uint16_t)(maxY-minY+1);
}
static void glyphDraw(const char* text,const GFXfont* font,
                      int x,int baseline,uint16_t ink) {
  int cursor=x;
  for(const unsigned char* p=(const unsigned char*)text;*p;++p){
    if(*p<font->first||*p>font->last)continue;
    const GFXglyph& g=font->glyph[*p-font->first];
    uint16_t offset=g.bitmapOffset;
    uint8_t bit=0,bits=0;
    for(int yy=0;yy<(int)g.height;++yy){
      for(int xx=0;xx<(int)g.width;++xx){
        if(!(bit++ & 7))bits=font->bitmap[offset++];
        if(bits&0x80)pixel(cursor+g.xOffset+xx,
                           baseline+g.yOffset+yy,ink);
        bits<<=1;
      }
    }
    cursor+=g.xAdvance;
  }
}

namespace ModuleNews {
static constexpr int MAX_NEWS_ITEMS=14;
static constexpr int NEWS_TITLE_BYTES=224;
static constexpr int NEWS_MAX_WRAP_LINES=6;
static constexpr int NEWS_WRAP_LINE_BYTES=128;
struct NewsItem {bool used=false;char title[NEWS_TITLE_BYTES]={0};};
struct NewsCache {bool loaded=false;bool ok=false;int count=0;NewsItem items[MAX_NEWS_ITEMS];};
static NewsCache g_storage;
static NewsCache* g_cache=&g_storage;
static bool norwegian=false;
static const char* headerText(){return norwegian?"Nyheter":"News";}
static void safeCopy(char* dst,size_t size,const char* src) {
  if(!size)return;
  if(!src){dst[0]='\0';return;}
  const size_t length=min(size-1,strlen(src));
  memcpy(dst,src,length);
  dst[length]='\0';
}
static void measureText(const char* text,const GFXfont* font,
                        int16_t& x1,int16_t& y1,uint16_t& w,uint16_t& h){
  glyphBounds(text,font,x1,y1,w,h);
}
static int textWidth(const char* text,const GFXfont* font){
  int16_t x=0,y=0;uint16_t w=0,h=0;
  measureText(text,font,x,y,w,h);
  return (int)w;
}
static void drawLeft(int x,int baseline,const char* text,const GFXfont* font){
  glyphDraw(text,font,x,baseline,Theme::ink());
}
// The identical complete-word/no-truncation algorithm used by ModuleNews.cpp.
static int wrapTextToLines(const char* src,char lines[][NEWS_WRAP_LINE_BYTES],
                           int maxLines,int maxWidth,const GFXfont* font,
                           bool& complete){
  complete=false;
  if(!src||!src[0]||!lines||maxLines<=0||maxWidth<=0)return 0;
  for(int i=0;i<maxLines;++i)lines[i][0]='\0';
  char work[NEWS_TITLE_BYTES]={0};
  if(strlen(src)>=sizeof(work))return 0;
  safeCopy(work,sizeof(work),src);
  char current[NEWS_WRAP_LINE_BYTES]={0};
  int lineCount=0;
  char* save=nullptr;
  char* word=strtok_r(work," ",&save);
  while(word){
    if(strlen(word)>=NEWS_WRAP_LINE_BYTES)return 0;
    char candidate[NEWS_WRAP_LINE_BYTES]={0};
    const int written=current[0]?
      snprintf(candidate,sizeof(candidate),"%s %s",current,word):
      snprintf(candidate,sizeof(candidate),"%s",word);
    if(written>=0&&written<(int)sizeof(candidate)&&
       textWidth(candidate,font)<=maxWidth){
      safeCopy(current,sizeof(current),candidate);
    }else{
      if(current[0]){
        if(lineCount>=maxLines)return lineCount;
        safeCopy(lines[lineCount++],NEWS_WRAP_LINE_BYTES,current);
        current[0]='\0';
      }
      if(textWidth(word,font)<=maxWidth)
        safeCopy(current,sizeof(current),word);
      else return 0;
    }
    word=strtok_r(nullptr," ",&save);
  }
  if(current[0]){
    if(lineCount>=maxLines)return lineCount;
    safeCopy(lines[lineCount++],NEWS_WRAP_LINE_BYTES,current);
  }
  complete=true;
  return lineCount;
}
#include "NewsEditorialPreview.h"

static void append(const char* title){
  if(g_storage.count>=MAX_NEWS_ITEMS)return;
  NewsItem& item=g_storage.items[g_storage.count++];
  safeCopy(item.title,sizeof(item.title),title);
  item.used=true;
}
static void fixture(const std::string& name){
  g_storage=NewsCache{};
  g_storage.loaded=true;g_storage.ok=true;
  norwegian=(name=="norwegian");
  if(name=="unavailable"){g_storage.ok=false;return;}
  if(name=="empty")return;
  if(name=="single"){
    append("Ny bro skal gjere reisa kortare for pendlarane");
  }else if(name=="two"){
    append("Ny bro skal gjere reisa kortare");
    append("Mildare v\xEA" "r venta i helga");
  }else if(name=="six" || name=="fourteen"){
    const int count=name=="six"?6:14;
    for(int i=0;i<count;++i){
      char line[100];
      snprintf(line,sizeof(line),"Nyheit %d om utviklinga i landet",i+1);
      append(line);
    }
  }else if(name=="long"){
    append("Ein omfattande plan for vidare utvikling av samferdsla i regionen vart lagt fram i dag");
    append("Fleire nye tiltak skal gi betre kvardagar for innbyggjarane");
    append("Varslar store endringar i det nasjonale samarbeidet");
  }else if(name=="norwegian"){
    append("\xC5" "rets f\xF8" "rste m\xF8te er p\xE5" " J\xE6" "ren");
    append("\xD8" "konomien p\xE5" "virker b\xE5" "de \xE6" "rer og \xF8" "yer");
    append("\xC6\xD8\xC5 \xE6\xF8\xE5");
  }else if(name=="unbreakable"){
    append("Supercalifragilisticexpialidociousutenmellomrom");
    append("Kort nytt i dag");
  }else{
    append("Fleire vil bruke toget til jobb");
    append("Slik blir v\xEA" "ret dei neste dagane");
    append("Lokale arrangement samlar familiar");
    append("Nye prosjekt er klare for bygging");
  }
}
} // namespace ModuleNews

static void writePBM(const fs::path& out){
  std::ofstream file(out,std::ios::binary);
  file<<"P4\n"<<g_width<<" "<<g_height<<"\n";
  const int stride=(g_width+7)/8;
  for(int y=0;y<g_height;++y)for(int byte=0;byte<stride;++byte){
    uint8_t packed=0;
    for(int bit=0;bit<8;++bit){
      const int x=byte*8+bit;
      if(x<g_width && g_pixels[(size_t)y*g_width+x]==0)
        packed|=(uint8_t)(0x80>>bit);
    }
    file.put((char)packed);
  }
}
int main(int argc,char** argv){
  const fs::path out=argc>1?argv[1]:"news-native-output";
  fs::create_directories(out/"pbm");
  std::ofstream csv(out/"manifest.csv");
  csv<<"scenario,theme,cols,rows,rendered,shown,overflow,clipped,pbm\n";
  const std::string scenes[]={
    "normal","single","two","six","fourteen","long","norwegian",
    "unbreakable","empty","unavailable"
  };
  int samples=0,accepted=0,failures=0,legacy=0,clippedTotal=0;
  for(const auto& scene:scenes)for(int cols=1;cols<=4;++cols)
  for(int rows=1;rows<=4;++rows)for(int dark=0;dark<2;++dark){
    ModuleNews::fixture(scene);
    const ModuleNews::NewsCache before=ModuleNews::g_storage;
    Theme::dark=(dark!=0);
    g_width=cols*200;g_height=rows*120;
    g_pixels.assign((size_t)g_width*g_height,Theme::dark?0:1);
    g_clipped=0;
    g_markerPixels=0;
    const Cell cell={0,0,g_width,g_height};
    const bool ok=ModuleNews::renderEditorialNewsPreview(cell);
    int shown=0,overflow=0;
    if(ok){
      const auto& plan=*ModuleNews::g_newsEditorialPlan;
      shown=plan.shown;overflow=plan.overflow;
      if(shown<1||shown>ModuleNews::g_storage.count ||
         shown+overflow!=ModuleNews::g_storage.count)++failures;
      int expectedMarkerPixels=0;
      for(int i=0;i<shown;++i){
        const auto& block=plan.blocks[i];
        if(block.markerR>0)expectedMarkerPixels+=4*block.markerR+3;
        if(block.sourceIndex!=i || block.x<0 || block.y<0 ||
           block.x+block.w>g_width || block.y+block.h>g_height ||
           block.lineCount<1 || block.lineCount>6)++failures;
        // Every ornamental marker must be entirely inside the source cell,
        // left of its associated full headline, without ink collision.
        if(block.markerR>0 &&
           (block.markerX-block.markerR<0 ||
            block.markerX+block.markerR>=block.x ||
            block.markerY-block.markerR<block.y ||
            block.markerY+block.markerR>=block.y+block.h ||
            block.markerX+block.markerR>=g_width ||
            block.markerY+block.markerR>=g_height))
          ++failures;
        if(block.markerR>0 && ModuleNews::g_storage.count<=1)
          ++failures;
        std::string rejoined;
        for(int line=0;line<block.lineCount;++line){
          if(line)rejoined+=' ';
          rejoined+=block.lines[line];
        }
        if(rejoined!=before.items[i].title)++failures;
      }
      if(g_markerPixels!=expectedMarkerPixels)++failures;
      // The owner observed the physical passepartout covering bullets
      // in 1-column cells. Markers must sit exactly on the same safe x
      // baseline as the "Nyheter" heading; never overdraw headline glyphs.
      if(scene=="normal" && cols==1){
        if(shown!=rows || overflow!=before.count-shown)++failures;
        for(int i=0;i<shown;++i){
          const auto& block=plan.blocks[i];
          if(block.markerR!=3 ||
             block.markerX!=plan.headerX ||
             block.markerX-block.markerR<11 ||
             block.markerX+block.markerR>=block.x)
            ++failures;
        }
      }
      ++accepted;
    }else{++legacy;}
    if(ModuleNews::g_storage.count!=before.count ||
       ModuleNews::g_storage.ok!=before.ok)++failures;
    for(int i=0;i<before.count;++i)
      if(std::strcmp(ModuleNews::g_storage.items[i].title,before.items[i].title)!=0 ||
         ModuleNews::g_storage.items[i].used!=before.items[i].used)
        ++failures;
    if(g_clipped)++failures;
    clippedTotal+=g_clipped;
    std::string filename;
    if(ok){
      filename=scene+"_"+(dark?"dark":"light")+"_"+std::to_string(cols)+
               "x"+std::to_string(rows)+".pbm";
      writePBM(out/"pbm"/filename);
    }
    csv<<scene<<","<<(dark?"dark":"light")<<","<<cols<<","<<rows<<","
       <<(ok?1:0)<<","<<shown<<","<<overflow<<","<<g_clipped<<","
       <<(ok?"pbm/"+filename:"")<<"\n";
    ++samples;
  }
  printf("Native News 1-bit: %d/%d editorial, %d safe fallback, %d clipped pixels, %d contract violations\n",
         accepted,samples,legacy,clippedTotal,failures);
  return failures?1:0;
}
