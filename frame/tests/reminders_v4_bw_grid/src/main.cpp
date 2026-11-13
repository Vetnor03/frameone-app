// RE:MIND Alfred V4 — standalone black/white Reminders 16-layout GRID QA.
//
// IMPORTANT: This is NOT production firmware. Only the original,
// unmodified RemindersEditorialPreview.h + approved bitmap fonts are used
// for actual content. Fixtures are local; no backend, WiFi, Skip or NVS writes.
// This sketch powers the EPD only when USB is present, uses only full-screen
// original GxEPD2_BW full refreshes and the existing power-off sequence.
//
// UART: 115200, newline. 1..16 selects Surf-style geometry, L/D/T theme.
// Full 4x4 grid visible for every selection; active rectangle double outlined.
// Offline fixed Reminders samples only. No OTA / no auto flash.

#include <Arduino.h>
#include <SPI.h>
#include <GxEPD2_BW.h>
#include <Fonts/FreeSans9pt7b.h>
#include <driver/gpio.h>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include "../../../src/device/HardwareProfile.h"
#include "../../../src/assets/fonts/RemindEditorialFonts.h"
#include "../../../src/assets/fonts/FreeSans9ptNO.h"

#if !defined(FRAME_IS_ALFRED_V1_2)
#error "This experimental build is only for the Alfred V4 ESP32-S3 board"
#endif

// Original black/white Waveshare 800x480 driver and V4 GPIO pinout.
static GxEPD2_BW<GxEPD2_750_T7,120> display(
 GxEPD2_750_T7(HardwareProfile::kEpdCs,HardwareProfile::kEpdDc,
               HardwareProfile::kEpdReset,HardwareProfile::kEpdBusy));
static SPIClass epdSPI(FSPI);
static bool gDark=false;
static uint8_t gSelection=16;
static const char* gScenario="normal";
static bool gBusy=false;
static constexpr int kW=800,kH=480;
static uint16_t gInk=GxEPD_BLACK;
namespace Theme {static uint16_t ink(){return gInk;}}
struct Cell {int x,y,w,h;};

namespace ModuleReminders {
static const GFXfont* FONT_B9=&FreeSans9pt8b;
struct ReminderItem {
  bool used=false;
  char title[96]={0};
  char time[12]={0};
  char occurrenceDate[16]={0};
  char displayDate[24]={0};
  int daysUntil=0;
  bool isOverdue=false;
};
struct ReminderBucket {
  bool used=false;
  int daysUntil=0;
  bool isOverdue=false;
  int count=0;
  int itemIdx[10]={0};
};
struct ReminderCache {
  bool loaded=false;
  bool ok=false;
  int count=0;
  ReminderItem items[10];
};
static ReminderCache g_storage;
static ReminderCache* g_cache=&g_storage;
static ReminderBucket g_buckets[3];

static void safeCopy(char* dest,size_t cap,const char* from) {
  if(!cap)return;
  snprintf(dest,cap,"%s",from?from:"");
}
static void measureText(const char* str,const GFXfont* font,
                        int16_t& x1,int16_t& y1,uint16_t& w,uint16_t& h) {
  display.setFont(font);
  display.setTextSize(1);
  display.getTextBounds(str,0,0,&x1,&y1,&w,&h);
}
static int textWidth(const char* txt,const GFXfont* font) {
  int16_t x=0,y=0;uint16_t w=0,h=0;
  measureText(txt,font,x,y,w,h);
  return (int)w;
}
static void drawLeft(int x,int baseline,const char* txt,const GFXfont* font,
                     uint16_t color) {
  display.setTextColor(color);
  display.setFont(font);
  display.setTextSize(1);
  display.setCursor(x,baseline);
  display.print(txt);
}
static int wrapTextToLines(const char* src,char lines[][128],int maxLines,
                           int maxWidth,const GFXfont* font,bool& complete) {
  // The exact production Reminders C++ algorithm; never ellipsis a word.
  complete=false;
  if(!lines||maxLines<=0||maxWidth<=0)return 0;
  for(int i=0;i<maxLines;++i)lines[i][0]='\0';
  if(!src||!src[0])return 0;
  char work[240];safeCopy(work,sizeof(work),src);
  int lineCount=0;char current[128]={0};char* save=nullptr;
  char* word=strtok_r(work," ",&save);
  while(word) {
    char candidate[128];
    const int written=current[0]?
      snprintf(candidate,sizeof(candidate),"%s %s",current,word):
      snprintf(candidate,sizeof(candidate),"%s",word);
    if(written>=0 && written<(int)sizeof(candidate) &&
       textWidth(candidate,font)<=maxWidth) {
      safeCopy(current,sizeof(current),candidate);
    } else {
      if(current[0]) {
        if(lineCount>=maxLines)return lineCount;
        safeCopy(lines[lineCount++],128,current);
        current[0]='\0';
      }
      if(textWidth(word,font)<=maxWidth)
        safeCopy(current,sizeof(current),word);
      else return 0;
    }
    word=strtok_r(nullptr," ",&save);
  }
  if(current[0]) {
    if(lineCount>=maxLines)return lineCount;
    safeCopy(lines[lineCount++],128,current);
  }
  complete=true;
  return lineCount;
}
static int findBucketByDaysUntil(const ReminderBucket* buckets,int count,int days) {
  for(int i=0;i<count;++i)
    if(buckets[i].used && buckets[i].daysUntil==days)return i;
  return -1;
}
static int findPrimaryBucketIndex(const ReminderBucket* buckets,int count) {
  const int today=findBucketByDaysUntil(buckets,count,0);
  if(today>=0)return today;
  const int tomorrow=findBucketByDaysUntil(buckets,count,1);
  if(tomorrow>=0)return tomorrow;
  for(int i=0;i<count;++i)if(buckets[i].used)return i;
  return -1;
}
static void buildAdaptiveFallbackHeading(const ReminderBucket& b,
                                         char* out,size_t size) {
  // Native fixture dates intentionally avoid fake dynamic wall-clock semantics.
  if(b.isOverdue || b.daysUntil<0) {
    snprintf(out,size,"%d days late",abs(b.daysUntil));
  } else if(b.daysUntil==0) safeCopy(out,size,"Today");
  else if(b.daysUntil==1) safeCopy(out,size,"Tomorrow");
  else snprintf(out,size,"In %d days",b.daysUntil);
}

// Included EXACTLY from the branch production renderer. Its geometry, real
// bitmap text preflight, group composition and overflow are unchanged.
#include "../../../src/modules/RemindersEditorialPreview.h"

static void append(ReminderBucket& b,const char* title,const char* time="") {
  if(g_cache->count>=10 || b.count>=10)return;
  const int n=g_cache->count++;
  ReminderItem& item=g_cache->items[n];
  item.used=true;item.daysUntil=b.daysUntil;item.isOverdue=b.isOverdue;
  safeCopy(item.title,sizeof(item.title),title);
  safeCopy(item.time,sizeof(item.time),time);
  b.itemIdx[b.count++]=n;
}
static void fixtures(const char* name) {
  g_storage=ReminderCache{};
  g_storage.loaded=true;g_storage.ok=true;
  for(auto& b:g_buckets)b=ReminderBucket{};
  g_buckets[0].used=g_buckets[1].used=true;
  g_buckets[0].daysUntil=0;g_buckets[1].daysUntil=1;
  if(strcmp(name,"few")==0) {
    append(g_buckets[0],"Handle melk og kaffe","09:00");
    append(g_buckets[0],"Vanne plantene","");
  } else if(strcmp(name,"many")==0) {
    for(int i=0;i<5;++i){
      char s[80];snprintf(s,sizeof(s),"Dagens p\xE5" "minnelse %d med avtale",i+1);
      append(g_buckets[0],s,i%2?"":"10:30");
    }
    for(int i=0;i<5;++i){
      char s[80];snprintf(s,sizeof(s),"Morgendagens gj\xF8" "rem\xE5l %d",i+1);
      append(g_buckets[1],s,i%2?"":"18:00");
    }
  } else if(strcmp(name,"long")==0) {
    append(g_buckets[0],"Ring r\xF8" "rleggeren om arbeidet i kjelleren","08:30");
    append(g_buckets[0],"Planlegge bursdagsmiddag for \xC5" "se og \xD8" "yvind");
    append(g_buckets[1],"Husk \xE5 hente varer p\xE5 postkontoret","17:15");
  } else if(strcmp(name,"tomorrow")==0) {
    g_buckets[0].used=false;
    append(g_buckets[1],"Lever \xE5" "rsrapport for prosjektet","08:15");
    append(g_buckets[1],"Bes\xF8" "ke foreldrene");
    append(g_buckets[1],"Handle frukt","18:00");
  } else if(strcmp(name,"norwegian")==0) {
    append(g_buckets[0],"\xC5" "se og \xD8" "yvind: \xE6" "rlig innsats","07:45");
    append(g_buckets[0],"P\xE5" "minnelse om m\xF8te p\xE5 J\xE6" "ren");
    append(g_buckets[1],"\xC6\xD8\xC5 \xE6\xF8\xE5");
  } else if(strcmp(name,"empty")==0) {
    g_buckets[0].used=g_buckets[1].used=false;
  } else { // normal
    append(g_buckets[0],"Handle melk og kaffe","09:00");
    append(g_buckets[0],"M\xF8te med banken","12:30");
    append(g_buckets[0],"Hente pakke","16:00");
    append(g_buckets[1],"Vanne plantene");
    append(g_buckets[1],"Sykkelservice","14:00");
  }
}
} // ModuleReminders

static void stopEPD() {
  display.epd2.hibernate();
  display.end();
  epdSPI.end();
  // Identical electrical ordering to V4 DisplayCore:
  // disable translator before switching off the panel supply.
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
static bool startEPD() {
  if(digitalRead(HardwareProfile::kPgoodN)!=LOW) {
    Serial.println("ERROR: V4 black/white grid QA is USB ONLY. Plug USB in and retry render.");
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
static void drawLabel(const char* text,const GFXfont* font,
                      int x,int top,uint16_t ink) {
  int16_t ox=0,oy=0;uint16_t w=0,h=0;
  display.setFont(font);
  display.setTextSize(1);
  display.getTextBounds(text,0,0,&ox,&oy,&w,&h);
  display.setTextColor(ink);
  display.setCursor(x-ox,top-oy);
  display.print(text);
}
static void drawGrid(const Cell& c) {
  const uint16_t ink=gInk;
  // Dotted 4x4 guides remain visible INSIDE larger spanning rectangles.
  for(int x=200;x<800;x+=200)
    for(int y=0;y<480;y+=10) display.drawFastVLine(x,y,4,ink);
  for(int y=120;y<480;y+=120)
    for(int x=0;x<800;x+=10) display.drawFastHLine(x,y,4,ink);
  display.drawRect(c.x,c.y,c.w,c.h,ink);
  if(c.w>4&&c.h>4)display.drawRect(c.x+1,c.y+1,c.w-2,c.h-2,ink);
  display.drawRect(0,0,800,480,ink);
}
static void printStatus(){
  const int cols=(gSelection-1)/4+1;
  const int rows=(gSelection-1)%4+1;
  Serial.printf("REMINDERS QA %d/16 = %dx%d (%dx%d px), %s, scene=%s\n",
    int(gSelection),cols,rows,cols*200,rows*120,gDark?"DARK":"LIGHT",gScenario);
}
static void printHelp(){
  Serial.println("\nRE:MIND REMINDERS — B/W GRID QA, SERIAL 115200");
  Serial.println("1=1x1  2=1x2  3=1x3  4=1x4");
  Serial.println("5=2x1  6=2x2  7=2x3  8=2x4");
  Serial.println("9=3x1  10=3x2  11=3x3  12=3x4");
  Serial.println("13=4x1 14=4x2 15=4x3 16=4x4");
  Serial.println("L Light / D Dark / T toggle; N next / P previous");
  Serial.println("Optional: scene normal|few|many|long|tomorrow|norwegian|empty");
  Serial.println("Full 4x4 grid always drawn, active region double-outlined.");
  Serial.println("Other: render, status, help. USB-only, offline sample data.");
}
static void renderNow(){
  if(gBusy)return;
  gBusy=true;
  if(!startEPD()){gBusy=false;return;}
  ModuleReminders::fixtures(gScenario);
  const int cols=(gSelection-1)/4+1;
  const int rows=(gSelection-1)%4+1;
  const Cell c={0,0,cols*200,rows*120};
  const uint16_t bg=gDark?GxEPD_BLACK:GxEPD_WHITE;
  gInk=gDark?GxEPD_WHITE:GxEPD_BLACK;
  const uint32_t started=millis();
  display.firstPage();
  do{
    display.fillScreen(bg);
    if(!ModuleReminders::renderEditorialRemindersPreview(c,ModuleReminders::g_buckets,3)){
      drawLabel("PREVIEW FALLBACK",RemindEditorialFonts::dm18(),8,12,gInk);
    }
    drawGrid(c);
  }while(display.nextPage());
  stopEPD();
  Serial.printf("B/W full refresh %lu ms\n",(unsigned long)(millis()-started));
  printStatus();
  gBusy=false;
}
static void process(const String& input){
  String cmd=input;cmd.trim();cmd.toUpperCase();
  if(cmd=="HELP"||cmd=="?"){printHelp();return;}
  if(cmd=="STATUS"){printStatus();return;}
  if(cmd=="RENDER"){renderNow();return;}
  if(cmd=="L"||cmd=="LIGHT"){gDark=false;renderNow();return;}
  if(cmd=="D"||cmd=="DARK"){gDark=true;renderNow();return;}
  if(cmd=="T"){gDark=!gDark;renderNow();return;}
  if(cmd=="N"){gSelection=gSelection==16?1:gSelection+1;renderNow();return;}
  if(cmd=="P"){gSelection=gSelection==1?16:gSelection-1;renderNow();return;}
  if(cmd.startsWith("SCENE ")){
    String name=cmd.substring(6);name.trim();name.toLowerCase();
    const char* valid[]={"normal","few","many","long","tomorrow","norwegian","empty"};
    for(const char* item:valid)if(name==item){gScenario=item;renderNow();return;}
    Serial.println("Unknown scene");return;
  }
  if(cmd.length()&&cmd.length()<=2){
    bool digits=true;
    for(size_t i=0;i<cmd.length();++i)if(cmd[i]<'0'||cmd[i]>'9')digits=false;
    if(digits){
      const int n=cmd.toInt();
      if(n>=1&&n<=16){gSelection=(uint8_t)n;renderNow();return;}
    }
  }
  Serial.println("Use 1-16, L, D, T, N, P, help.");
}
void setup() {
  // Exactly the normal V4 power-up hold: neither VCC nor OE energised.
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
  Serial.println("\nRE:MIND V4 B/W Reminders 16-layout GRID QA");
  Serial.printf("PSRAM detected: %u bytes\n",(unsigned)ESP.getPsramSize());
  printHelp();
  renderNow(); // initial 4x4-grid layout; no OTA
}
void loop() {
  if(Serial.available()>0)process(Serial.readStringUntil('\n'));
  delay(10);
}
