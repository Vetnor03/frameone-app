#include "WiFiManager.h"
#include <WiFi.h>
#include <Preferences.h>

static Preferences prefs;

namespace WiFiManagerV2 {

void begin() {
  prefs.begin("wifi", false);
}

bool hasCreds() {
  return prefs.isKey("ssid");
}

String getSsid() {
  return prefs.getString("ssid", "");
}

void saveCreds(const String& ssid, const String& pass) {
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
}

void clearCreds() {
  prefs.remove("ssid");
  prefs.remove("pass");
}

bool connectSaved(uint32_t timeoutMs) {
  if (!hasCreds()) return false;

  String ssid = prefs.getString("ssid", "");
  String pass = prefs.getString("pass", "");

  if (ssid.length() == 0) return false;

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), pass.c_str());

  Serial.print("Connecting WiFi (saved): ");
  Serial.println(ssid);

  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED && (millis() - start) < timeoutMs) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("✅ WiFi connected. IP: ");
    Serial.println(WiFi.localIP());
    return true;
  }

  Serial.println("❌ WiFi connect failed.");
  return false;
}

}
