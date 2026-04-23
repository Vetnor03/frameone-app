#include "DeviceIdentity.h"
#include <Preferences.h>
#include <WiFi.h>

static Preferences prefs;
static bool g_started = false;

namespace {
String makeDeviceId() {
  uint64_t mac = ESP.getEfuseMac();

  uint32_t hi = (uint32_t)(mac >> 24);
  uint32_t lo = (uint32_t)(mac & 0xFFFFFF);

  char buf[32];
  snprintf(buf, sizeof(buf), "frm_%06lX%06lX", (unsigned long)(hi & 0xFFFFFF), (unsigned long)lo);
  return String(buf);
}

void ensureDeviceIdInternal() {
  String id = prefs.getString("device_id", "");
  id.trim();

  if (id.length() > 0) return;

  String generated = makeDeviceId();
  prefs.putString("device_id", generated);

  Serial.print("Generated device_id: ");
  Serial.println(generated);
}
}

namespace DeviceIdentity {

void begin() {
  if (!g_started) {
    prefs.begin("frame", false);
    g_started = true;
  }
  ensureDeviceIdInternal();
}

bool hasDeviceId() {
  begin();
  String id = prefs.getString("device_id", "");
  id.trim();
  return id.length() > 0;
}

String getDeviceId() {
  begin();
  String id = prefs.getString("device_id", "");
  id.trim();

  if (id.length() == 0) {
    ensureDeviceIdInternal();
    id = prefs.getString("device_id", "");
    id.trim();
  }

  return id;
}

bool hasToken() {
  begin();
  String token = prefs.getString("token", "");
  token.trim();
  return token.length() > 0;
}

String getToken() {
  begin();
  String token = prefs.getString("token", "");
  token.trim();
  return token;
}

void saveToken(const String& token) {
  begin();
  String clean = token;
  clean.trim();
  prefs.putString("token", clean);
}

void clearToken() {
  begin();
  prefs.remove("token");
}

void clear() {
  clearToken();
}

void factoryWipeAll() {
  begin();
  prefs.clear();
}

}