// Host-only seed adapter for the ORIGINAL, unchanged ModuleNews.cpp.
// News remains its own C++ translation unit, preserving production's
// independent font data and namespace helper resolution.
#include "Arduino.h"
#include <stdexcept>
HostSerialLogger Serial;

#include "../../src/modules/ModuleNews.cpp"

const char* BASE_URL="https://offline-host-test.invalid";
namespace DeviceIdentity { String getToken(){return "";} }
bool NetClient::httpGetAuth(const String&,const String&,int&,String&){
  throw std::runtime_error("Networking forbidden in seeded News fixture");
}
void seedRealNewsHeadlines() {
  if(!ModuleNews::ensureCacheAllocated())
    throw std::runtime_error("Failed to allocate original News cache");
  ModuleNews::clearCache();
  const char* headlines[]={
    "Wind forecast updated for the coast",
    "Pilot frames arrive this week",
    "New editorial design review completed"
  };
  for(int i=0;i<3;++i){
    ModuleNews::NewsItem& item=ModuleNews::g_cache->items[i];
    snprintf(item.title,sizeof(item.title),"%s",headlines[i]);
    item.used=true;
  }
  ModuleNews::g_cache->count=3;
  ModuleNews::g_cache->loaded=true; // A request here would call the throwing stub.
  ModuleNews::g_cache->ok=true;
}
