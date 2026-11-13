// RE:MIND News R2 — OFFLINE V4 USB-only black/white physical QA.
// This sketch compiles the EXACT editorial News source header from PR #1516.
// No live NRK fetch, OTA, settings, device pairing, NVS, or production changes.
// Use 1..16 for layouts, L/D for theme, S for sample article sets.

#include <Arduino.h>
#include <SPI.h>
#include <GxEPD2_BW.h>
#include <Adafruit_GFX.h>
#include <driver/gpio.h>
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <new>
#include "../../../src/device/HardwareProfile.h"
#include "../../../src/assets/fonts/RemindEditorialFonts.h"

#if !defined(FRAME_IS_ALFRED_V1_2)
#error "V4 News QA is for the Alfred V4 ESP32-S3 hardware profile only"
#endif

static GxEPD2_BW<GxEPD2_750_T7,120> display(
  GxEPD2_750_T7(HardwareProfile::kEpdCs,HardwareProfile::kEpdDc,
                HardwareProfile::kEpdReset,HardwareProfile::kEpdBusy));
static SPIClass epdSPI(FSPI);
static bool gDark=false;
static uint8_t gSelection=16; // same 1–16 mapping as Surf and Reminders QA
static const char* gScenario="normal";
static bool gBusy=false;
static constexpr int kW=800,kH=480;

// Use a local 1-bit canvas so ALL article glyph pixels are confined to the
// highlighted rectangle, even when layout data is pathological.
class CheckedNewsCanvas : public GFXcanvas1 {
public:
  CheckedNewsCanvas(int16_t w,int16_t h):GFXcanvas1(w,h) {}
  void drawPixel(int16_t x,int16_t y,uint16_t color) override {
    if(x<0||y<0||x>=width()||y>=height()){++outOfBounds;return;}
    GFXcanvas1::drawPixel(x,y,color);
  }
  uint32_t outOfBounds=0;
};
static CheckedNewsCanvas* gCanvas=nullptr;

namespace Theme {
  // The canvas always uses bit=1 for foreground; the EPD blitter converts
  // this to BLACK ink in Light and WHITE ink in Dark.
  static uint16_t ink(){return 1;}
}
namespace DisplayCore {
  static CheckedNewsCanvas& get(){return *gCanvas;}
}
struct Cell {int x,y,w,h;};

namespace ModuleNews {
static constexpr int MAX_NEWS_ITEMS=14;
static constexpr int NEWS_TITLE_BYTES=224;
static constexpr int NEWS_MAX_WRAP_LINES=6;
static constexpr int NEWS_WRAP_LINE_BYTES=128;
struct NewsItem {bool used=false;char title[NEWS_TITLE_BYTES]={0};};
struct NewsCache {
  bool loaded=false;
  bool ok=false;
  int count=0;
  NewsItem items[MAX_NEWS_ITEMS];
};
static NewsCache g_storage;
static NewsCache* g_cache=&g_storage;
static bool gNorwegian=true;

static const char* headerText(){return gNorwegian?"Nyheter":"News";}
static void safeCopy(char* dst,size_t cap,const char* src){
  if(!cap)return;
  if(!src){dst[0]='\0';return;}
  const size_t n=std::min(cap-1,strlen(src));
  memcpy(dst,src,n);
  dst[n]='\0';
}
static void measureText(const char* text,const GFXfont* font,
                        int16_t& x1,int16_t& y1,uint16_t& w,uint16_t& h){
  auto& d=DisplayCore::get();
  d.setFont(font);
  d.setTextSize(1);
  d.getTextBounds(text?text:"",0,0,&x1,&y1,&w,&h);
}
static int textWidth(const char* text,const GFXfont* font){
  int16_t x=0,y=0;uint16_t w=0,h=0;
  measureText(text,font,x,y,w,h);
  return (int)w;
}
static void drawLeft(int x,int baseline,const char* text,const GFXfont* font){
  auto& d=DisplayCore::get();
  d.setFont(font);
  d.setTextSize(1);
  d.setTextColor(Theme::ink());
  d.setCursor(x,baseline);
  d.print(text?text:"");
  d.setFont(nullptr);
}

// Identical whole-word / no-ellipsis logic to ModuleNews.cpp.
static int wrapTextToLines(const char* src,
                           char lines[][NEWS_WRAP_LINE_BYTES],
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
    if(written>=0 && written<(int)sizeof(candidate) &&
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

// EXACT News R2 compositor from experimental PR #1516, not a copied drawing.
#include "../../../src/modules/NewsEditorialPreview.h"

static void append(const char* title){
  if(g_storage.count>=MAX_NEWS_ITEMS)return;
  NewsItem& item=g_storage.items[g_storage.count++];
  item.used=true;
  safeCopy(item.title,sizeof(item.title),title);
}
static void sample(const char* kind){
  g_storage=NewsCache{};
  g_storage.loaded=true;
  g_storage.ok=true;
  gNorwegian=true;
  if(strcmp(kind,"unavailable")==0){g_storage.ok=false;return;}
  if(strcmp(kind,"empty")==0)return;
  if(strcmp(kind,"one")==0){
    append("Ny bro skal gjere reisa kortare for pendlarane");
  }else if(strcmp(kind,"two")==0){
    append("Ny bro skal gjere reisa kortare");
    append("Mildare v\xEA" "r venta i helga");
  }else if(strcmp(kind,"six")==0 || strcmp(kind,"fourteen")==0){
    const int n=strcmp(kind,"six")==0?6:14;
    for(int i=0;i<n;++i){
      char label[120];
      snprintf(label,sizeof(label),"Nyheit %d om utviklinga i landet",i+1);
      append(label);
    }
  }else if(strcmp(kind,"long")==0){
    append("Ein omfattande plan for vidare utvikling av samferdsla i regionen vart lagt fram i dag");
    append("Fleire nye tiltak skal gi betre kvardagar for innbyggjarane");
    append("Varslar store endringar i det nasjonale samarbeidet");
  }else if(strcmp(kind,"norwegian")==0){
    append("\xC5" "rets f\xF8" "rste m\xF8te er p\xE5" " J\xE6" "ren");
    append("\xD8" "konomien p\xE5" "virker b\xE5" "de \xE6" "rer og \xF8" "yer");
    append("\xC6\xD8\xC5 \xE6\xF8\xE5");
  }else if(strcmp(kind,"english")==0){
    gNorwegian=false;
    append("Rail commuters could see shorter journeys next year");
    append("Milder weather expected this weekend");
    append("New projects announced for the region");
  }else if(strcmp(kind,"unbreakable")==0){
    append("Supercalifragilisticexpialidociousutenmellomrom");
    append("Kort nytt i dag");
  }else{ // normal
    append("Fleire vil bruke toget til jobb");
    append("Slik blir v\xEA" "ret dei neste dagane");
    append("Lokale arrangement samlar familiar");
    append("Nye prosjekt er klare for bygging");
  }
}
} // namespace ModuleNews

static void stopEPD(){
  display.epd2.hibernate();
  display.end();
  epdSPI.end();
  // Original V4 order: level translator off BEFORE panel supply off.
  digitalWrite(HardwareProfile::kEpdOutputEnable,LOW);
  delay(20);
  digitalWrite(HardwareProfile::kEpdPower,LOW);
  pinMode(HardwareProfile::kEpdBusy,INPUT);
  pinMode(HardwareProfile::kEpdReset,INPUT);
  pinMode(HardwareProfile::kEpdDc,INPUT);
  pinMode(HardwareProfile::kEpdCs,INPUT);
  pinMode(HardwareProfile::kEpdSck,INPUT);
  pinMode(HardwareProfile::kEpdMosi,INPUT);
}
static bool startEPD(){
  if(digitalRead(HardwareProfile::kPgoodN)!=LOW){
    Serial.println("ERROR: USB power required (PGOOD_N not LOW).");
    return false;
  }
  digitalWrite(HardwareProfile::kEpdOutputEnable,LOW);
  digitalWrite(HardwareProfile::kEpdPower,LOW);
  delay(20);
  digitalWrite(HardwareProfile::kEpdPower,HIGH);
  delay(500);
  digitalWrite(HardwareProfile::kEpdOutputEnable,HIGH);
  delay(100);
  epdSPI.begin(HardwareProfile::kEpdSck,-1,HardwareProfile::kEpdMosi,
               HardwareProfile::kEpdCs);
  display.epd2.selectSPI(epdSPI,
    SPISettings(HardwareProfile::kEpdSpiHz,MSBFIRST,SPI_MODE0));
  display.init(115200,true,2,false);
  display.setRotation(0);
  display.setFullWindow();
  return true;
}
static void drawGuide(const Cell& area,uint16_t ink){
  // The dotted full 4x4 grid remains visible in every layout, including
  // full-width cells; a double solid frame marks the active geometry.
  for(int x=200;x<800;x+=200)
    for(int y=0;y<480;y+=10)
      display.drawFastVLine(x,y,4,ink);
  for(int y=120;y<480;y+=120)
    for(int x=0;x<800;x+=10)
      display.drawFastHLine(x,y,4,ink);
  display.drawRect(area.x,area.y,area.w,area.h,ink);
  if(area.w>4&&area.h>4)
    display.drawRect(area.x+1,area.y+1,area.w-2,area.h-2,ink);
  display.drawRect(0,0,800,480,ink);
}
static void caption(const char* text,const GFXfont* font,int x,int y){
  int16_t bx=0,by=0;uint16_t w=0,h=0;
  ModuleNews::measureText(text,font,bx,by,w,h);
  ModuleNews::drawLeft(x-bx,y-by,text,font);
}
static void status(bool native,uint32_t overrun){
  const int cols=(gSelection-1)/4+1;
  const int rows=(gSelection-1)%4+1;
  Serial.printf("NEWS R2: layout %d/16 = %dx%d (%dx%d px), %s, sample=%s\n",
    int(gSelection),cols,rows,cols*200,rows*120,gDark?"DARK":"LIGHT",gScenario);
  Serial.printf("Native preview: %s, outside-canvas attempted pixels: %lu\n",
    native?"YES":"FALLBACK / EMPTY",(unsigned long)overrun);
  if(overrun)Serial.println("WARNING: renderer attempted drawing beyond the active area.");
}
static void help(){
  Serial.println("\nRE:MIND NEWS R2 — V4 black/white 16-size GRID QA");
  Serial.println("115200 baud, Newline/LF; same numbering as Surf QA:");
  Serial.println(" 1=1x1  2=1x2  3=1x3  4=1x4");
  Serial.println(" 5=2x1  6=2x2  7=2x3  8=2x4");
  Serial.println(" 9=3x1 10=3x2 11=3x3 12=3x4");
  Serial.println("13=4x1 14=4x2 15=4x3 16=4x4");
  Serial.println("L=Light, D=Dark, T=toggle, N=next, P=previous");
  Serial.println("scene normal|one|two|six|fourteen|long|norwegian|english|unbreakable|empty|unavailable");
  Serial.println("render, status, help");
  Serial.println("USB only. No WiFi, NRK API, OTA, NVS, pairing or settings writes.");
}
static void renderNow(){
  if(gBusy)return;
  gBusy=true;
  const int cols=(gSelection-1)/4+1;
  const int rows=(gSelection-1)%4+1;
  const Cell active={0,0,cols*200,rows*120};
  if(!startEPD()){gBusy=false;return;}
  ModuleNews::sample(gScenario);
  gCanvas=new(std::nothrow) CheckedNewsCanvas(active.w,active.h);
  if(!gCanvas||!gCanvas->getBuffer()){
    Serial.println("ERROR: framebuffer allocation failed");
    delete gCanvas;gCanvas=nullptr;
    stopEPD();gBusy=false;return;
  }
  gCanvas->fillScreen(0);
  bool success=false;
  if(ModuleNews::g_storage.ok&&ModuleNews::g_storage.count>0){
    success=ModuleNews::renderEditorialNewsPreview(active);
    if(!success)
      caption("PREVIEW FALLBACK",RemindEditorialFonts::dm18(),10,14);
  } else if(!ModuleNews::g_storage.ok){
    caption("Nyheter utilgjengelig",RemindEditorialFonts::dm18(),10,14);
  } else {
    caption("Ingen nyheter",RemindEditorialFonts::dm18(),10,14);
  }
  const uint32_t outOfBounds=gCanvas->outOfBounds;
  const uint16_t paper=gDark?GxEPD_BLACK:GxEPD_WHITE;
  const uint16_t ink=gDark?GxEPD_WHITE:GxEPD_BLACK;
  const uint32_t started=millis();
  display.firstPage();
  do{
    display.fillScreen(paper);
    display.drawBitmap(0,0,gCanvas->getBuffer(),active.w,active.h,ink,paper);
    drawGuide(active,ink);
  }while(display.nextPage());
  stopEPD();
  Serial.printf("Full BW refresh: %lu ms\n",(unsigned long)(millis()-started));
  status(success,outOfBounds);
  delete gCanvas;gCanvas=nullptr;
  gBusy=false;
}
static void command(const String& line){
  String cmd=line;cmd.trim();cmd.toUpperCase();
  if(!cmd.length())return;
  if(cmd=="HELP"||cmd=="?"){help();return;}
  if(cmd=="STATUS"){status(false,0);return;}
  if(cmd=="RENDER"){renderNow();return;}
  if(cmd=="L"||cmd=="LIGHT"){gDark=false;renderNow();return;}
  if(cmd=="D"||cmd=="DARK"){gDark=true;renderNow();return;}
  if(cmd=="T"){gDark=!gDark;renderNow();return;}
  if(cmd=="N"){gSelection=gSelection==16?1:gSelection+1;renderNow();return;}
  if(cmd=="P"){gSelection=gSelection==1?16:gSelection-1;renderNow();return;}
  if(cmd.startsWith("SCENE ")){
    String v=cmd.substring(6);v.trim();v.toLowerCase();
    const char* allowed[]={"normal","one","two","six","fourteen","long",
                           "norwegian","english","unbreakable","empty","unavailable"};
    for(const char* item:allowed)
      if(v==item){gScenario=item;renderNow();return;}
    Serial.println("Unknown sample; type help.");return;
  }
  if(cmd.length()<=2){
    bool numeric=cmd.length()>0;
    for(size_t i=0;i<cmd.length();++i)
      if(cmd[i]<'0'||cmd[i]>'9')numeric=false;
    if(numeric){
      const int n=cmd.toInt();
      if(n>=1 && n<=16){gSelection=(uint8_t)n;renderNow();return;}
    }
  }
  Serial.println("Command not recognized. Use 1-16, L, D, T or help.");
}
void setup(){
  digitalWrite(HardwareProfile::kEpdOutputEnable,LOW);
  pinMode(HardwareProfile::kEpdOutputEnable,OUTPUT);
  digitalWrite(HardwareProfile::kEpdOutputEnable,LOW);
  digitalWrite(HardwareProfile::kEpdPower,LOW);
  pinMode(HardwareProfile::kEpdPower,OUTPUT);
  digitalWrite(HardwareProfile::kEpdPower,LOW);
  gpio_deep_sleep_hold_dis();
  gpio_hold_dis((gpio_num_t)HardwareProfile::kEpdOutputEnable);
  gpio_hold_dis((gpio_num_t)HardwareProfile::kEpdPower);
  pinMode(HardwareProfile::kPgoodN,INPUT);
  Serial.begin(115200);
  Serial.setTimeout(80);
  delay(300);
  Serial.println("\nRE:MIND V4 News R2 — isolated 1-bit GRID QA");
  Serial.printf("PSRAM detected: %u bytes\n",(unsigned)ESP.getPsramSize());
  help();
  renderNow();
}
void loop(){
  if(Serial.available()>0)command(Serial.readStringUntil('\n'));
  delay(10);
}
