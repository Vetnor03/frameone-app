// RE:MIND Groceries R2 – exact adaptive production C++ source-rendered bitmaps.
// The adaptive renderer is GENERATED from ModuleGroceries.cpp by extract_renderer.py.
// Actual GFX bitmap fonts are compiled. No HTML/SVG/CSS/mock glyphs.
#include <Arduino.h>
#include <Adafruit_GFX.h>
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <cstdint>
#include <ctime>
#include <fstream>
#include <filesystem>
#include <string>
#include <vector>
#include "RemindEditorialFonts.h"
#include "GroceriesAdaptivePolicy.h"
#include "FreeSans9ptNO.h"
#include "FreeSansBold12ptNO.h"
using std::min;
using std::max;
namespace fs=std::filesystem;
#define FONT_B9 (&FreeSans9pt8b)
#define FONT_B12 (&FreeSansBold12pt8b)
#define FONT_B18 (&FreeSansBold12pt8b) // Unused by extracted adaptive rendering

static int g_w=800,g_h=480,g_outside=0,g_diamondPixels=0,g_rotationStep=0;
static std::vector<uint8_t> g_pixels;
static std::vector<std::string> g_drawn;
static void plot(int x,int y,uint16_t ink){
  if(x<0||y<0||x>=g_w||y>=g_h){++g_outside;return;}
  g_pixels[(size_t)y*g_w+x]=ink?1:0;
}
namespace Theme {
  static bool dark=false;
  static uint16_t ink(){return dark?1:0;}
}
namespace DisplayCore {
class NativeCanvas {
 public:
  void drawPixel(int x,int y,uint16_t ink){++g_diamondPixels;plot(x,y,ink);}
  void drawFastVLine(int x,int y,int h,uint16_t ink){
    for(int iy=0;iy<h;++iy)plot(x,y+iy,ink);
  }
  void fillRect(int x,int y,int w,int h,uint16_t ink){
    for(int iy=0;iy<h;++iy)for(int ix=0;ix<w;++ix)plot(x+ix,y+iy,ink);
  }
  void fillCircle(int x,int y,int r,uint16_t ink){
    for(int iy=-r;iy<=r;++iy)for(int ix=-r;ix<=r;++ix)
      if(ix*ix+iy*iy<=r*r)plot(x+ix,y+iy,ink);
  }
};
static NativeCanvas& get(){static NativeCanvas d;return d;}
}
static void glyphBounds(const char* text,const GFXfont* font,
                        int16_t& x1,int16_t& y1,uint16_t& w,uint16_t& h){
  int cursor=0,mnx=999999,mny=999999,mxx=-999999,mxy=-999999;
  for(const uint8_t* p=(const uint8_t*)text;*p;++p){
    if(*p<font->first||*p>font->last)continue;
    const GFXglyph& g=font->glyph[*p-font->first];
    if(g.width&&g.height){
      mnx=min(mnx,cursor+int(g.xOffset));
      mny=min(mny,int(g.yOffset));
      mxx=max(mxx,cursor+int(g.xOffset)+int(g.width)-1);
      mxy=max(mxy,int(g.yOffset)+int(g.height)-1);
    }
    cursor+=g.xAdvance;
  }
  if(mxx<mnx){x1=y1=0;w=h=0;return;}
  x1=int16_t(mnx);y1=int16_t(mny);
  w=uint16_t(mxx-mnx+1);h=uint16_t(mxy-mny+1);
}
static void glyphDraw(const char* text,const GFXfont* font,
                      int cursor,int baseline,uint16_t ink){
  for(const uint8_t* p=(const uint8_t*)text;*p;++p){
    if(*p<font->first||*p>font->last)continue;
    const GFXglyph& g=font->glyph[*p-font->first];
    uint16_t offset=g.bitmapOffset;
    uint8_t bit=0,bits=0;
    for(int yy=0;yy<int(g.height);++yy)for(int xx=0;xx<int(g.width);++xx){
      if(!(bit++&7))bits=font->bitmap[offset++];
      if(bits&0x80)plot(cursor+g.xOffset+xx,baseline+g.yOffset+yy,ink);
      bits<<=1;
    }
    cursor+=g.xAdvance;
  }
}
struct Cell{int x,y,w,h;};

namespace ModuleGroceries {
static constexpr int MAX_ITEMS=40;
static constexpr int MAX_DINNER_ITEMS=14;
static constexpr int MAX_RUNNING_LOW_INSIGHTS=3;
static constexpr int MAX_RECIPE_INSIGHTS=2;
static constexpr int MAX_RECIPE_MISSING=2;
struct GroceryItem {bool used=false;char name[48]={0};int qty=1;};
struct DinnerPlanItem{bool used=false;char date[11]={0};char dayLabel[8]={0};char title[48]={0};};
struct RunningLowInsight{bool used=false;char name[40]={0};char label[40]={0};};
struct RecipeInsight{bool used=false;char name[48]={0};int missingCount=0;char missing[MAX_RECIPE_MISSING][32]={{0}};};
struct GroceryCache{
  bool loaded=false,ok=false,languageNo=false;
  int count=0;GroceryItem items[MAX_ITEMS];
  int dinnerCount=0;DinnerPlanItem dinners[MAX_DINNER_ITEMS];
  int runningLowCount=0;RunningLowInsight runningLow[MAX_RUNNING_LOW_INSIGHTS];
  int recipeCount=0;RecipeInsight recipes[MAX_RECIPE_INSIGHTS];
  char header[64]={0};
};
static GroceryCache g_cache;

// The following adapters use the source's identical formatter, GFX measurement
// and width-fitting rules. The 4h clock is deterministic for native QA, but the
// production source's getRotationStep4h() is checked unchanged from main in CI.
static void safeCopy(char* dst,size_t cap,const char* src){
  if(!cap)return;
  if(!src){dst[0]=0;return;}
  size_t n=min(cap-1,strlen(src));
  memmove(dst,src,n);dst[n]=0;
}
static size_t strlcatTest(char* dst,const char* src,size_t cap){
  size_t old=strlen(dst),add=strlen(src);
  if(old<cap){size_t room=cap-old-1,n=min(room,add);memcpy(dst+old,src,n);dst[old+n]=0;}
  return old+add;
}
#define strlcat strlcatTest
static void measureText(const char* s,const GFXfont* font,
                        int16_t& x1,int16_t& y1,uint16_t& w,uint16_t& h){
  glyphBounds(s?s:"",font,x1,y1,w,h);
}
static int textWidth(const char* s,const GFXfont* f){
  int16_t x=0,y=0;uint16_t w=0,h=0;measureText(s,f,x,y,w,h);return int(w);
}
static void drawLeft(int x,int y,const char* s,const GFXfont* f,uint16_t ink){
  g_drawn.emplace_back(s?s:"");
  glyphDraw(s?s:"",f,x,y,ink);
}
static void fitTextToWidth(const char* src,char* dst,size_t dstSize,int maxWidth,const GFXfont* font){
  if(!dst||!dstSize)return;
  dst[0]=0;
  if(!src||!src[0])return;
  if(textWidth(src,font)<=maxWidth){safeCopy(dst,dstSize,src);return;}
  const int srcLen=int(strlen(src));
  for(int n=srcLen;n>=1;--n){
    char buf[80]={0};
    int take=min(n,int(sizeof(buf))-4);
    memcpy(buf,src,take);buf[take]=0;
    strlcat(buf,"...",sizeof(buf));
    if(textWidth(buf,font)<=maxWidth){safeCopy(dst,dstSize,buf);return;}
  }
  safeCopy(dst,dstSize,"...");
}
static const char* emptyPhrase(){return g_cache.languageNo?"Alt er klart":"All set";}
static void formatItem(const GroceryItem& item,char* out,size_t n){
  if(!out||!n)return;
  if(item.qty>1)snprintf(out,n,"%dx %s",item.qty,item.name);
  else safeCopy(out,n,item.name);
}
static int wrapIndex(int i,int count){
  if(count<=0)return 0;
  while(i<0)i+=count;
  while(i>=count)i-=count;
  return i;
}
static int getRotationStep4h(){return g_rotationStep;}

// The *production* renderAdaptiveGroceries and its collaborators are generated
// and compiled from the actual branch source, including the R1 GFX helpers.
#include "extracted_adaptive.cpp.inc"

static void setItem(int n,const char* name,int quantity=1){
  if(n<0||n>=MAX_ITEMS)return;
  GroceryItem& it=g_cache.items[n];
  it.used=true;it.qty=max(1,quantity);
  safeCopy(it.name,sizeof(it.name),name);
}
static std::string isoDate(int days){
  time_t now=time(nullptr);
  struct tm tmv;
  localtime_r(&now,&tmv);tmv.tm_hour=12;tmv.tm_mday+=days;
  mktime(&tmv);
  char buf[16]={0};
  strftime(buf,sizeof(buf),"%Y-%m-%d",&tmv);
  return buf;
}
static void dinner(int offset,const char* title){
  if(g_cache.dinnerCount>=MAX_DINNER_ITEMS)return;
  DinnerPlanItem& item=g_cache.dinners[g_cache.dinnerCount++];
  item.used=true;
  safeCopy(item.date,sizeof(item.date),isoDate(offset).c_str());
  safeCopy(item.dayLabel,sizeof(item.dayLabel),offset==0?"Today":offset==1?"Sat":"Sun");
  safeCopy(item.title,sizeof(item.title),title);
}
static void fixture(const std::string& scene,int rotation){
  g_cache=GroceryCache{};
  g_cache.loaded=true;g_cache.ok=true;
  g_cache.languageNo=(scene!="english");
  safeCopy(g_cache.header,sizeof(g_cache.header),g_cache.languageNo?"Handleliste":"Grocery List");
  g_rotationStep=rotation;
  if(scene=="failed"){g_cache.ok=false;return;}
  if(scene=="empty")return;
  int count=5;
  if(scene=="one")count=1;
  if(scene=="two")count=2;
  if(scene=="twelve")count=12;
  if(scene=="forty")count=40;
  if(scene=="dinner_only")count=0;
  if(scene=="long"||scene=="quantity"||scene=="norwegian")count=8;
  const char* names[]={"Melk","Br\xF8" "d","Epler","Kaffe","Egg","Ris",
                       "Havregryn","Sm\xF8" "r","Gulrot","Tomat",
                       "Ost","Sjokolade","Olivenolje","Vaskemiddel"};
  const char* longNames[]={"Extra virgin olive oil for cooking",
                           "Organic sourdough bread sliced",
                           "Laundry detergent for sensitive skin",
                           "Wholegrain jasmine rice family",
                           "Cold pressed lemon and ginger drink"};
  for(int i=0;i<count;++i){
    char name[48]={0};
    if(scene=="long")safeCopy(name,sizeof(name),longNames[i%5]);
    else if(scene=="norwegian" && i==0)
      safeCopy(name,sizeof(name),"\xC6" "blemost \xF8" "kologisk \xE5" "rstid");
    else if(scene=="english")safeCopy(name,sizeof(name),i?"Coffee":"Bread");
    else if(count>=12)snprintf(name,sizeof(name),"Vare %02d %s",i+1,names[i%14]);
    else safeCopy(name,sizeof(name),names[i%14]);
    setItem(i,name,(scene=="quantity"||scene=="forty")?((i%4)+1):i==0?2:1);
  }
  if(scene=="dinner_only"||scene=="normal"||scene=="long"||scene=="english"||scene=="quantity"){
    dinner(0,"Taco i kveld");
    dinner(1,"Pasta med tomat");
    dinner(2,"Kyllingsuppe");
    dinner(3,"Hjemmelaget pizza");
    g_cache.runningLowCount=2;
    safeCopy(g_cache.runningLow[0].name,40,"Kaffe");
    safeCopy(g_cache.runningLow[0].label,40,"Lite igjen");
    safeCopy(g_cache.runningLow[1].name,40,"Ris");
    safeCopy(g_cache.runningLow[1].label,40,"Snart tomt");
    g_cache.recipeCount=2;
    safeCopy(g_cache.recipes[0].name,48,"Taco");
    g_cache.recipes[0].missingCount=2;
    safeCopy(g_cache.recipes[0].missing[0],32,"Salsa");
    safeCopy(g_cache.recipes[0].missing[1],32,"Mais");
    safeCopy(g_cache.recipes[1].name,48,"Pasta");
    g_cache.recipes[1].missingCount=1;
    safeCopy(g_cache.recipes[1].missing[0],32,"Basilikum");
  }
}
} // namespace ModuleGroceries

static void writePBM(const fs::path& p){
  std::ofstream f(p,std::ios::binary);
  f<<"P4\n"<<g_w<<" "<<g_h<<"\n";
  for(int y=0;y<g_h;++y)for(int b=0;b<(g_w+7)/8;++b){
    uint8_t byte=0;
    for(int bit=0;bit<8;++bit)if(b*8+bit<g_w &&
         !g_pixels[(size_t)y*g_w+b*8+bit])byte|=(uint8_t)(128>>bit);
    f.put(char(byte));
  }
}
int main(int argc,char** argv){
  const fs::path out=argc>1?argv[1]:"groceries-native-output";
  fs::create_directories(out/"pbm");
  std::ofstream csv(out/"manifest.csv");
  csv<<"scenario,theme,cols,rows,rotation,capacity,overflow,menu,low,ideas,clipped,diamonds,pbm\n";
  const std::string scenes[]={
    "normal","one","two","twelve","forty","long","quantity",
    "norwegian","english","dinner_only","empty","failed"
  };
  int total=0,failed=0,clipped=0,diamondCases=0;
  for(const auto& scene:scenes)for(int cols=1;cols<=4;++cols)
  for(int rows=1;rows<=4;++rows)for(int dark=0;dark<2;++dark){
    const int rotation=(scene=="forty" || scene=="quantity")?5:1;
    ModuleGroceries::fixture(scene,rotation);
    const ModuleGroceries::GroceryCache before=ModuleGroceries::g_cache;
    Theme::dark=(dark!=0);
    g_w=cols*200;g_h=rows*120;
    g_pixels.assign((size_t)g_w*g_h,Theme::dark?0:1);
    g_outside=0;g_diamondPixels=0;g_drawn.clear();
    const Cell c={0,0,g_w,g_h};
    ModuleGroceries::renderAdaptiveGroceries(c);
    if(memcmp(&ModuleGroceries::g_cache,&before,sizeof(before)))++failed;
    if(g_outside)++clipped; // test reports existing render bounds separately
    if(g_diamondPixels)++diamondCases;

    const auto& cache=ModuleGroceries::g_cache;
    char today[16]={0};ModuleGroceries::adaptiveToday(today,sizeof(today));
    const int todayIndex=ModuleGroceries::adaptiveTodayDinner(today);
    const int future=ModuleGroceries::adaptiveFutureCount(today);
    const auto family=GroceriesAdaptivePolicy::compose({
      g_w,g_h,!cache.ok,uint8_t(cache.count),
      uint8_t(cache.dinnerCount),uint8_t(future),todayIndex>=0,
      uint8_t(cache.runningLowCount),uint8_t(cache.recipeCount)});
    const int pad=max(9,min(14,g_w*35/1000)),gap=12;
    int topH=max(1,g_h-pad*2);
    if(family.showRunningLow||family.showMealIdeas)
      topH=max(1,topH-min(116,g_h*31/100)-gap);
    int groceryW=max(1,g_w-pad*2);
    if(family.showMenu)
      groceryW=max(1,max(g_w*54/100,250)-pad);
    const int headerH=(family.todayIsHeading && todayIndex>=0 &&
      family.family!=GroceriesAdaptivePolicy::ITEM_STRIP &&
      family.family!=GroceriesAdaptivePolicy::MICRO)?48:32;
    const int listH=max(0,topH-headerH-8);
    const int columns=family.horizontal?min(3,max(1,cache.count)):family.columns;
    const int initial=family.horizontal?min(3,cache.count):max(0,listH/26)*columns;
    int capacity=cache.count<=initial?initial:
      family.horizontal?min(3,cache.count):max(0,(listH-18)/26)*columns;
    capacity=min(12,min(capacity,cache.count));
    if(family.family==GroceriesAdaptivePolicy::EMPTY)capacity=0;
    if(cache.count>0 && capacity<0)++failed;
    if(capacity==1 && g_diamondPixels>0)++failed;
    if(cache.count==0 && g_diamondPixels>0)++failed;
    if(g_diamondPixels%15!=0)++failed; // 4*3 + 3 ink pixel attempts per diamond
    // Actual source rotates the *visible* item list by exactly four-hour steps.
    // Neither the selected raw order nor any ingredient quantity may mutate.
    for(int i=0;i<capacity;++i){
      const auto& want=before.items[ModuleGroceries::wrapIndex(rotation+i,cache.count)];
      const auto& got=cache.items[ModuleGroceries::wrapIndex(rotation+i,cache.count)];
      if(strcmp(want.name,got.name) || want.qty!=got.qty)++failed;
    }
    std::string name=scene+"_"+(dark?"dark":"light")+"_"+std::to_string(cols)+"x"+std::to_string(rows)+".pbm";
    writePBM(out/"pbm"/name);
    csv<<scene<<","<<(dark?"dark":"light")<<","<<cols<<","<<rows<<","
       <<rotation<<","<<capacity<<","<<max(0,cache.count-capacity)<<","
       <<family.showMenu<<","<<family.showRunningLow<<","<<family.showMealIdeas<<","
       <<g_outside<<","<<g_diamondPixels<<",pbm/"<<name<<"\n";
    ++total;
  }
  printf("Native Groceries: %d original C++ adaptive renders, %d item/cache invariant errors, %d images with off-panel ink, %d diamond-marked images\n",
         total,failed,clipped,diamondCases);
  // Existing legacy geometry clipping is reported, not silently hidden.
  // New errors (source mutation, diamond-only-one, broken marker shape) fail CI.
  return failed?1:0;
}
