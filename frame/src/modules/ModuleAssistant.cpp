#include "ModuleAssistant.h"
#include "AiFollowAdaptivePolicy.h"
#include "DisplayCore.h"
#include "Theme.h"
#include "Config.h"
#include "DeviceIdentity.h"
#include "NetClient.h"
#include "FrameText.h"
#include "Fonts/FreeSans9ptNO.h"
#include "Fonts/FreeSansBold12ptNO.h"
#include <ArduinoJson.h>
#include <string.h>
#include <stdio.h>

namespace ModuleAssistant {
static const uint8_t MAX_UPDATES = 8;
static const size_t MAX_RESPONSE_BYTES = 6144;
struct Update { char topic[64]; char summary[192]; };
struct AssistantCache { bool loaded; bool ok; bool languageNo; uint8_t followingCount; uint8_t count; uint8_t totalCount; Update updates[MAX_UPDATES]; };
static AssistantCache g_cache = {};

static void copyDisplay(char* out, size_t size, const char* value) { FrameText::normalizeUtf8ForDisplay(out, size, value ? value : ""); }
static int widthOf(const char* value, const GFXfont* font) { int16_t x,y; uint16_t w,h; auto& d=DisplayCore::get(); d.setFont(font); d.getTextBounds(value,0,0,&x,&y,&w,&h); return w; }
static void draw(int x,int baseline,const char* value,const GFXfont* font) { auto& d=DisplayCore::get(); d.setFont(font); d.setTextColor(Theme::ink()); d.setCursor(x,baseline); d.print(value); d.setFont(nullptr); }
static void fit(const char* value,char* out,size_t size,int maxWidth,const GFXfont* font) {
  strlcpy(out,value ? value : "",size); if(widthOf(out,font)<=maxWidth)return;
  const size_t suffix=3; size_t n=strlen(out); while(n>0){out[--n]='\0'; if(n+suffix+1<size){strlcat(out,"...",size);if(widthOf(out,font)<=maxWidth)return;out[n]='\0';}}
  strlcpy(out,"...",size);
}
static bool fetch() {
  AssistantCache fresh={}; fresh.loaded=true;
  String url=String(BASE_URL)+"/api/device/assistant?device_id="+DeviceIdentity::getDeviceId(); int code=0; String body;
  if(!NetClient::httpGetAuth(url,DeviceIdentity::getToken(),code,body)||code!=200||body.length()>MAX_RESPONSE_BYTES){g_cache=fresh;return false;}
  StaticJsonDocument<256> filter; filter["ok"]=true; filter["language"]=true; filter["active_watch_count"]=true; filter["update_count"]=true; filter["updates"][0]["topic"]=true; filter["updates"][0]["summary"]=true;
  DynamicJsonDocument doc(4096); const size_t responseBytes=body.length();
  DeserializationError error=deserializeJson(doc,body,DeserializationOption::Filter(filter)); body=String();
  if(error){Serial.print("Assistant JSON parse failed, bytes=");Serial.println(responseBytes);g_cache=fresh;return false;}
  fresh.ok=doc["ok"]|false; fresh.languageNo=strcmp(doc["language"]|"en","no")==0;
  fresh.followingCount=static_cast<uint8_t>(min(255,static_cast<int>(doc["active_watch_count"]|0)));
  fresh.totalCount=static_cast<uint8_t>(min(255,static_cast<int>(doc["update_count"]|0)));
  for(JsonObject item:doc["updates"].as<JsonArray>()){if(fresh.count>=MAX_UPDATES)break;copyDisplay(fresh.updates[fresh.count].topic,sizeof(fresh.updates[0].topic),item["topic"]|"");copyDisplay(fresh.updates[fresh.count].summary,sizeof(fresh.updates[0].summary),item["summary"]|"");if(fresh.updates[fresh.count].topic[0]&&fresh.updates[fresh.count].summary[0])fresh.count++;}
  if(fresh.totalCount<fresh.count)fresh.totalCount=fresh.count; g_cache=fresh; return fresh.ok;
}
static void wrapSummary(const char* text,int x,int y,int maxWidth,int lines) {
  char remaining[192];strlcpy(remaining,text,sizeof(remaining));char* cursor=remaining;
  for(int line=0;line<lines&&*cursor;line++){while(*cursor==' ')cursor++;char output[192]={0};char* end=cursor;
    while(*end){char* next=strchr(end,' ');if(!next)next=end+strlen(end);char saved=*next;*next='\0';if(widthOf(cursor,&FreeSans9pt8b)>maxWidth){*next=saved;break;}strlcpy(output,cursor,sizeof(output));*next=saved;if(!saved){end=next;break;}end=next+1;}
    if(!output[0]){fit(cursor,output,sizeof(output),maxWidth,&FreeSans9pt8b);cursor+=strlen(cursor);}else cursor=end;
    if(line==lines-1&&*cursor){char fitted[192];strlcat(output,"...",sizeof(output));fit(output,fitted,sizeof(fitted),maxWidth,&FreeSans9pt8b);strlcpy(output,fitted,sizeof(output));}
    draw(x,y+line*16,output,&FreeSans9pt8b);
  }
}
void reset(){g_cache=AssistantCache{};}
void render(const Cell& c) {
  if(!g_cache.loaded)fetch();
  const AiFollowAdaptivePolicy::Output policy=AiFollowAdaptivePolicy::compose({c.w,c.h,g_cache.followingCount,g_cache.totalCount});
  const int pad=c.w*35/1000<8?8:(c.w*35/1000>14?14:c.w*35/1000);char fitted[80];fit("AI Follow",fitted,sizeof(fitted),c.w-pad*2,&FreeSansBold12pt8b);draw(c.x+pad,c.y+pad+20,fitted,&FreeSansBold12pt8b);
  if(!g_cache.ok){draw(c.x+pad,c.y+c.h/2,"Updates unavailable",&FreeSans9pt8b);return;}
  if(policy.mode!=AiFollowAdaptivePolicy::UPDATES){const char* primary=policy.mode==AiFollowAdaptivePolicy::ZERO_FOLLOW?(g_cache.languageNo?"Ingenting folges enna":"Nothing followed yet"):(g_cache.languageNo?"Ingen nye oppdateringer":"No new updates");fit(primary,fitted,sizeof(fitted),c.w-pad*2,&FreeSansBold12pt8b);draw(c.x+pad,c.y+c.h/2,fitted,&FreeSansBold12pt8b);if(policy.showQuietSecondary){char secondary[64];if(policy.mode==AiFollowAdaptivePolicy::ZERO_FOLLOW)strlcpy(secondary,g_cache.languageNo?"Folg temaer i appen":"Follow topics in the app",sizeof(secondary));else snprintf(secondary,sizeof(secondary),g_cache.languageNo?"Folger %u tema%s":"Following %u topic%s",g_cache.followingCount,g_cache.followingCount==1?"":"s");draw(c.x+pad,c.y+c.h/2+28,secondary,&FreeSans9pt8b);}return;}
  const int top=c.y+pad+38,rowH=18+policy.summaryLines*16+3,gap=8;
  for(uint8_t i=0;i<policy.visibleCapacity&&i<g_cache.count;i++){int y=top+i*(rowH+gap);fit(g_cache.updates[i].topic,fitted,sizeof(fitted),c.w-pad*2,&FreeSansBold12pt8b);draw(c.x+pad,y+15,fitted,&FreeSansBold12pt8b);wrapSummary(g_cache.updates[i].summary,c.x+pad,y+35,c.w-pad*2,policy.summaryLines);}
  if(policy.overflowCount){char more[24];snprintf(more,sizeof(more),policy.verboseOverflow?"+%u more":"+%u",policy.overflowCount);draw(c.x+pad,top+policy.visibleCapacity*(rowH+gap)+10,more,&FreeSans9pt8b);}
}
} // namespace ModuleAssistant
