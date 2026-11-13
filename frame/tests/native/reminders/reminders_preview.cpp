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
  bool ok=false;
  int count=0;
  ReminderItem items[MAX_REMINDERS];
};
static ReminderCache cache;
static ReminderCache* g_cache=&cache;
static void safeCopy(char* dst,size_t n,const char* str) {
  if (!n) return;
  if (!str) { dst[0]='\0'; return; }
  const size_t len = std::min(std::strlen(str), n - 1);
  std::memcpy(dst, str, len);
  dst[len]='\0';
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
static int findPrimaryBucketIndex(const ReminderBucket* buckets,int count) {
  if(!buckets || count<=0)return -1;
  for(int i=0;i<count;++i)if(buckets[i].used&&buckets[i].daysUntil==0)return i;
  for(int i=0;i<count;++i)if(buckets[i].used&&buckets[i].daysUntil==1)return i;
  for(int i=0;i<count;++i)if(buckets[i].used)return i;
  return -1;
}
// Native equivalents of the existing ModuleReminders.cpp date-label helpers.
// This harness includes the EXACT preview C++ header and original font bits;
// its storage/display adapters are deliberately small, dependency-free shims.
static void buildRelativeDateText(int days,bool overdue,char* out,size_t n) {
  if(!out||!n)return;
  out[0]='\0';
  if(overdue || days<0) {
    const int late=std::abs(days);
    if(late==1)std::snprintf(out,n,"1 day late");
    else std::snprintf(out,n,"%d days late",late);
  } else if(days==0) std::snprintf(out,n,"Today");
  else if(days==1) std::snprintf(out,n,"Tomorrow");
  else std::snprintf(out,n,"In %d days",days);
}
static bool parseYMD10(const char* str,int& y,int& m,int& d) {
  if(!str || std::strlen(str)<10 || str[4]!='-' || str[7]!='-')return false;
  for(int i=0;i<10;++i)if(i!=4&&i!=7&&(str[i]<'0'||str[i]>'9'))
    return false;
  y=(str[0]-'0')*1000+(str[1]-'0')*100+(str[2]-'0')*10+(str[3]-'0');
  m=(str[5]-'0')*10+(str[6]-'0');
  d=(str[8]-'0')*10+(str[9]-'0');
  return m>=1&&m<=12&&d>=1&&d<=31;
}
static int weekdayIndexYMD(int y,int m,int d) {
  static int table[]={0,3,2,5,0,3,5,1,4,6,2,4};
  if(m<3)y-=1;
  return (y+y/4-y/100+y/400+table[m-1]+d)%7;
}
static const char* weekdayNameFull(int index) {
  static const char* names[]={"Sunday","Monday","Tuesday","Wednesday",
                              "Thursday","Friday","Saturday"};
  return index>=0&&index<7?names[index]:"";
}
static void buildAdaptiveFallbackHeading(const ReminderBucket& bucket,
                                         char* out,size_t n) {
  if(!out||!n)return;
  out[0]='\0';
  if(bucket.isOverdue || bucket.daysUntil<0) {
    buildRelativeDateText(bucket.daysUntil,true,out,n);
    return;
  }
  const int idx=bucket.count>0?bucket.itemIdx[0]:-1;
  if(idx>=0&&idx<g_cache->count) {
    const ReminderItem& r=g_cache->items[idx];
    int y=0,m=0,d=0;
    if(parseYMD10(r.occurrenceDate,y,m,d)) {
      const char* weekday=weekdayNameFull(weekdayIndexYMD(y,m,d));
      if(bucket.daysUntil<=7)std::snprintf(out,n,"On %s",weekday);
      else if(bucket.daysUntil<=14)std::snprintf(out,n,"%s next week",weekday);
      else if(r.displayDate[0])safeCopy(out,n,r.displayDate);
    } else if(r.displayDate[0])safeCopy(out,n,r.displayDate);
  }
  if(!out[0])buildRelativeDateText(bucket.daysUntil,false,out,n);
  if(!out[0])safeCopy(out,n,"Upcoming");
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
  cache.items[idx].isOverdue=bucket.isOverdue;
  bucket.itemIdx[bucket.count++]=idx;
}
static void fixture(const std::string& scenario,ReminderBucket* b) {
  cache=ReminderCache{};
  cache.ok=true;
  b[0]=ReminderBucket{};b[1]=ReminderBucket{};b[2]=ReminderBucket{};
  b[0].used=b[1].used=true;
  b[0].daysUntil=0;b[1].daysUntil=1;
  if(scenario=="single"){
    append(b[0],"Hente pakke","16:00");
  } else if(scenario=="few"){
    append(b[0],"Handle melk og kaffe","09:00");
    append(b[0],"Vanne plantene","");
  } else if(scenario=="six"){
    for(int i=0;i<3;++i){
      char label[80];
      std::snprintf(label,sizeof(label),"Dagens avtale %d",i+1);
      append(b[0],label,(i%2==0)?"09:00":"");
    }
    for(int i=0;i<3;++i){
      char label[80];
      std::snprintf(label,sizeof(label),"Morgendagens plan %d",i+1);
      append(b[1],label,(i%2==0)?"18:00":"");
    }
  } else if(scenario=="normal"){
    append(b[0],"Handle melk og kaffe","09:00");
    append(b[0],"M\xF8te med banken","12:30");
    append(b[0],"Hente pakke","16:00");
    append(b[1],"Vanne plantene","");
    append(b[1],"Sykkelservice","14:00");
  } else if(scenario=="long"){
    append(b[0],"Ring R\xF8rleggeren om arbeidet i kjelleren","08:30");
    append(b[0],"Planlegge bursdagsmiddag for \xC5se og \xD8yvind","");
    append(b[1],"Husk \xE5 hente varer p\xE5 postkontoret","17:15");
  } else if(scenario=="tomorrow"){
    b[0].used=false;
    append(b[1],"Lever \xE5rsrapport for prosjektet","08:15");
    append(b[1],"Bes\xF8ke foreldrene","");
    append(b[1],"Handle frukt","18:00");
  } else if(scenario=="norwegian"){
    append(b[0],"\xC5se og \xD8yvind: \xE6rlig innsats","07:45");
    append(b[0],"P\xE5minnelse om m\xF8te p\xE5 J\xE6ren","");
    append(b[1],"Bestill \xF8" "lbr\xF8" "d og bl\xE5" "b\xE6" "r","14:20");
    // All six Norwegian bitmap glyphs, uppercase and lowercase, on one row.
    append(b[0],"\xC6\xD8\xC5 \xE6\xF8\xE5","");
  } else if(scenario=="future"){
    b[0].used=false;b[1].daysUntil=4;
    append(b[1],"Dette skjer om fire dager","");
  } else if(scenario=="overdue"){
    b[1].used=false;b[0].daysUntil=-2;b[0].isOverdue=true;
    append(b[0],"Ring tannlegen om timen","09:30");
    safeCopy(cache.items[0].occurrenceDate,
             sizeof(cache.items[0].occurrenceDate),"2026-11-09");
  } else if(scenario=="distant"){
    b[0].used=false;b[1].daysUntil=22;
    append(b[1],"Julemarked med venner","");
    safeCopy(cache.items[0].occurrenceDate,
             sizeof(cache.items[0].occurrenceDate),"2026-12-03");
    safeCopy(cache.items[0].displayDate,
             sizeof(cache.items[0].displayDate),"3 December");
  } else if(scenario=="mixed"){
    b[2].used=true;b[2].daysUntil=4;
    append(b[0],"M\xF8te med selger","10:00");
    append(b[1],"Hente n\xF8kler","");
    append(b[2],"Bestille materialer","17:30");
    safeCopy(cache.items[2].occurrenceDate,
             sizeof(cache.items[2].occurrenceDate),"2026-11-15");
  } else if(scenario=="unbreakable"){
    append(b[0],"Supercalifragilisticexpialidociousutenmellomrom","15:00");
  } else if(scenario=="unavailable"){
    cache.ok=false;
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
  csv<<"scenario,theme,cols,rows,rendered,clipped,shown,overflow,pbm\n";
  const std::string scenarios[]={"single","few","normal","six","long","many",
       "tomorrow","norwegian","future","overdue","distant","mixed","unbreakable",
       "empty","unavailable"};
  int mainFailures=0;
  for(const auto& scene:scenarios)for(int dark=0;dark<2;++dark)
    for(int cols=1;cols<=4;++cols)for(int rows=1;rows<=4;++rows){
      Theme::dark=dark!=0;
      g_width=cols*200;g_height=rows*120;g_clipped=0;
      g_pixels.assign((size_t)g_width*g_height,dark?1:0);
      ModuleReminders::ReminderBucket buckets[3];
      ModuleReminders::fixture(scene,buckets);
      // Freeze all input fields and bucket references. This is a renderer-only
      // PR: rendering must not alter title profiles, time, dates, source
      // index positions, count or any server-provided order.
      const ModuleReminders::ReminderCache beforeCache=ModuleReminders::cache;
      const ModuleReminders::ReminderBucket beforeBuckets[3]={
        buckets[0],buckets[1],buckets[2]
      };
      // All C++ preview code is exactly the firmware header (including the
      // GFX text preflight), rasterized with original glyph bitmap bytes.
      const Cell c={0,0,g_width,g_height};
      // Same field layout as frame Cell's rectangle members.
      // Header accepts c.x/y/w/h only and uses no type-specific overload.
      const bool rendered=ModuleReminders::renderEditorialRemindersPreview(c,buckets,3);
      if(scene=="unavailable" && rendered)++mainFailures;
      if(ModuleReminders::cache.count!=beforeCache.count ||
         ModuleReminders::cache.ok!=beforeCache.ok)++mainFailures;
      for(int k=0;k<beforeCache.count;++k){
        const auto& old=beforeCache.items[k];
        const auto& now=ModuleReminders::cache.items[k];
        if(std::strcmp(old.title,now.title)!=0 ||
           std::strcmp(old.time,now.time)!=0 ||
           std::strcmp(old.occurrenceDate,now.occurrenceDate)!=0 ||
           std::strcmp(old.displayDate,now.displayDate)!=0 ||
           old.daysUntil!=now.daysUntil || old.isOverdue!=now.isOverdue)
          ++mainFailures;
      }
      for(int k=0;k<3;++k){
        if(buckets[k].count!=beforeBuckets[k].count ||
           buckets[k].used!=beforeBuckets[k].used ||
           buckets[k].daysUntil!=beforeBuckets[k].daysUntil ||
           buckets[k].isOverdue!=beforeBuckets[k].isOverdue)
          ++mainFailures;
        for(int i=0;i<beforeBuckets[k].count;++i)
          if(buckets[k].itemIdx[i]!=beforeBuckets[k].itemIdx[i])
            ++mainFailures;
      }
      if(scene=="empty" && !rendered)++mainFailures;
      if(rendered && ModuleReminders::cache.count>0){
        const auto& plan=*ModuleReminders::g_remindersEditorialPlan;
        if(plan.shown<=0 || plan.shown>ModuleReminders::cache.count ||
           plan.shown+plan.overflow!=ModuleReminders::cache.count)
          ++mainFailures;
        if((scene=="normal" && std::strcmp(plan.primaryHeading,"Today")!=0) ||
           (scene=="tomorrow" && std::strcmp(plan.primaryHeading,"Tomorrow")!=0) ||
           (scene=="future" && std::strcmp(plan.primaryHeading,"In 4 days")!=0) ||
           (scene=="overdue" && std::strcmp(plan.primaryHeading,"2 days late")!=0) ||
           (scene=="distant" && std::strcmp(plan.primaryHeading,"3 December")!=0))
          ++mainFailures;
        // The date must NEVER be a visual hero while a reminder exists.
        if(plan.family==ModuleReminders::REM_EDIT_PANORAMA &&
           plan.panoramaHeadingFont!=RemindEditorialFonts::dm18())
          ++mainFailures;
        for(int sectionIndex=0;sectionIndex<plan.sectionCount;++sectionIndex){
          const auto& section=plan.sections[sectionIndex];
          if(section.headingFont &&
             section.headingFont!=RemindEditorialFonts::dm18() &&
             section.headingFont!=ModuleReminders::FONT_B9)
            ++mainFailures;
          if(section.headingFont && section.w<=220 &&
             section.headingFont!=ModuleReminders::FONT_B9)
            ++mainFailures;
          // Density never changes importance/order: sparse views highlight
          // the real first task, and busy overview does not single it out.
          if((scene=="many" || scene=="six") && section.shown &&
              section.rows[0].font==RemindEditorialFonts::fraunces48())
            ++mainFailures;
          if((scene=="single" || scene=="few") && cols==4 && rows==4 &&
             section.shown &&
             section.rows[0].font!=RemindEditorialFonts::fraunces48())
            ++mainFailures;
          // A roomy ordinary list must privilege readable reminder typography.
          if(scene=="normal" && cols>=2 && rows>=2 && section.shown &&
             (section.rows[0].font==ModuleReminders::FONT_B9 ||
              section.rows[0].font==RemindEditorialFonts::dm18()))
            ++mainFailures;
          // A horizontal spread is intentionally two rows at the SAME y,
          // in separate measured x rectangles. Other families stay stacked.
          const bool spread=plan.family==ModuleReminders::REM_EDIT_SPREAD;
          int previousEnd=section.y;
          for(int i=0;i<section.shown;++i){
            const auto& row=section.rows[i];
            if((!spread && row.y<previousEnd) ||
               row.y<section.y || row.y+row.h>section.y+section.h ||
               row.x<section.x || row.x+row.w>section.x+section.w ||
               row.titleX<row.x || row.titleX>=row.x+row.w ||
               row.lineCount<1 || row.lineCount>3)
              ++mainFailures;
            if(spread && i>0) {
              const auto& prev=section.rows[i-1];
              if(prev.x+prev.w>=row.x || row.y!=prev.y)
                ++mainFailures;
            }
            // This verifies the FULL title survives word wrapping; no cropped
            // facts or unannounced ellipses in an "accepted" C++ preview row.
            std::string recovered;
            for(int line=0;line<row.lineCount;++line){
              if(line)recovered+=" ";
              recovered+=row.lines[line];
            }
            if(row.itemIdx<0 || row.itemIdx>=ModuleReminders::cache.count ||
               recovered!=ModuleReminders::cache.items[row.itemIdx].title ||
               row.itemIdx!=section.bucket->itemIdx[i])
              ++mainFailures;
            previousEnd=row.y+row.h;
          }
        }
      }
      std::string file="";
      if(rendered){
        file=scene+"_"+(dark?"dark":"light")+"_"+std::to_string(cols)+"x"+std::to_string(rows)+".pbm";
        savePBM(root/file);
      }
      const int shown=(rendered && ModuleReminders::cache.count>0)
         ?ModuleReminders::g_remindersEditorialPlan->shown:0;
      const int overflow=(rendered && ModuleReminders::cache.count>0)
         ?ModuleReminders::g_remindersEditorialPlan->overflow:0;
      // Physical owner feedback: full-width shallow/half-height areas
      // must not leave the right side empty when complete items fit.
      if(scene=="normal" && cols==4 && rows==1 &&
         (!rendered || shown<2 ||
          ModuleReminders::g_remindersEditorialPlan->family!=ModuleReminders::REM_EDIT_SPREAD ||
          ModuleReminders::g_remindersEditorialPlan->sections[0].rows[1].x<=400))
        ++mainFailures;
      if(scene=="normal" && cols==4 && rows==2 &&
         (!rendered || shown<4 ||
          ModuleReminders::g_remindersEditorialPlan->family!=ModuleReminders::REM_EDIT_TWO_COLUMNS ||
          ModuleReminders::g_remindersEditorialPlan->sectionCount!=2))
        ++mainFailures;
      // Full 800x480 day-overview reference: useful space must not be
      // sacrificed to a giant heading or wastefully hidden action rows.
      if((scene=="six" || scene=="many") && cols==4 && rows==4 &&
         (!rendered || shown!=ModuleReminders::cache.count || overflow!=0))
        ++mainFailures;
      csv<<scene<<","<<(dark?"dark":"light")<<","<<cols<<","<<rows<<","
         <<(rendered?1:0)<<","<<g_clipped<<","<<shown<<","<<overflow<<","<<file<<"\n";
      // First visual review anchors must produce native bitmaps.
      // Non-overfull reference scenes must use the new editorial renderer on
      // ALL 16 shapes, in BOTH themes; failure/unbreakable keep safe fallback.
      if((scene=="single" || scene=="few" || scene=="normal" ||
          scene=="six" || scene=="future" || scene=="overdue" ||
          scene=="distant" || scene=="mixed" || scene=="empty") && !rendered)
        ++mainFailures;
      if(g_clipped)++mainFailures;
    }
  return mainFailures?1:0;
}
