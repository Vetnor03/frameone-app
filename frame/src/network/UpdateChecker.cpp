#include "UpdateChecker.h"
#include "Config.h"
#include "NetClient.h"
#include "DeviceIdentity.h"
#include <ArduinoJson.h>
#include <Preferences.h>
#include <string.h>

static Preferences prefs;

namespace {
bool authenticatedGet(const String& url, const String& token, int& code, String& body) {
  bool ok = NetClient::httpGetAuth(url, token, code, body);
  if (code == 401 || code == 403) {
    Serial.println("auth failed -> clearing token");
    DeviceIdentity::clearToken();
    return false;
  }
  return ok;
}
}

void UpdateChecker::begin() { prefs.begin("frame", false); }

bool UpdateChecker::fetchContentSignature(const String& deviceToken, String& outSignature) {
  const String url = String(BASE_URL) + "/api/device/content-signature?device_id=" + DeviceIdentity::getDeviceId();
  int code = 0;
  String body;
  if (!authenticatedGet(url, deviceToken, code, body) || code != 200) return false;
  StaticJsonDocument<192> doc;
  if (deserializeJson(doc, body)) return false;
  const char* signature = doc["signature"];
  if (!signature || strlen(signature) != 64) return false;
  outSignature = signature;
  return true;
}

String UpdateChecker::getLastContentSignature() { return prefs.getString("content_sig", ""); }
void UpdateChecker::saveContentSignature(const String& signature) {
  if (signature.length() == 64) prefs.putString("content_sig", signature);
}
void UpdateChecker::saveFirmwareVersion(const char* fwVer) { prefs.putString("fw_ver", String(fwVer)); }
bool UpdateChecker::hasLastUsbPresent() { return prefs.getBool("usb_seen", false); }
bool UpdateChecker::getLastUsbPresent() { return prefs.getBool("usb_prev", false); }
void UpdateChecker::saveUsbPresent(bool present) {
  prefs.putBool("usb_prev", present);
  prefs.putBool("usb_seen", true);
}
bool UpdateChecker::detectAndPersistUsbStateChange(bool present, bool stable, bool& hadPrevious) {
  hadPrevious = hasLastUsbPresent();
  const bool changed = stable && hadPrevious && present != getLastUsbPresent();
  if (stable) saveUsbPresent(present);
  else Serial.println("USB sample unstable; keeping persisted charger state");
  return changed;
}
void UpdateChecker::saveBatteryPercent(int percent) { prefs.putInt("bat_prev", percent); }
