#include "UpdateChecker.h"
#include "Config.h"
#include "NetClient.h"
#include "DeviceIdentity.h"
#include <Preferences.h>
#include <ArduinoJson.h>

static Preferences prefs;

namespace {
  String urlEncode(const char* s) {
    if (!s) return "";
    String out;
    const char* hex = "0123456789ABCDEF";

    for (size_t i = 0; s[i]; i++) {
      uint8_t c = (uint8_t)s[i];
      bool safe =
        (c >= 'a' && c <= 'z') ||
        (c >= 'A' && c <= 'Z') ||
        (c >= '0' && c <= '9') ||
        c == '-' || c == '_' || c == '.' || c == '~';

      if (safe) out += (char)c;
      else {
        out += '%';
        out += hex[(c >> 4) & 0xF];
        out += hex[c & 0xF];
      }
    }

    return out;
  }

  bool isTodaysBestConfig(const SurfModuleConfig& surf) {
    if (surf.spotId[0] && String(surf.spotId).equalsIgnoreCase("__todays_best__")) return true;

    String spot = String(surf.spot);
    spot.trim();
    spot.toLowerCase();

    return (
      spot == "today's best" ||
      spot == "todays best" ||
      spot == "dagens beste"
    );
  }

  bool httpGetAuthWithTokenAwareness(
    const String& url,
    const String& deviceToken,
    int& code,
    String& body
  ) {
    bool ok = NetClient::httpGetAuth(url, deviceToken, code, body);

    if (code == 401 || code == 403) {
      Serial.println("auth failed -> clearing token");
      DeviceIdentity::clearToken();
      return false;
    }

    return ok;
  }

  String buildRemindersUrl() {
    String url = String(BASE_URL)
               + "/api/device/reminders?device_id="
               + DeviceIdentity::getDeviceId()
               + "&limit=20&tz=Europe/Oslo";
    return url;
  }

  String buildSurfMetaUrl(const FrameConfig& cfg, const SurfModuleConfig& surf) {
    String url = String(BASE_URL) + "/api/device/surf-meta?";
    url += "device_id=" + urlEncode(DeviceIdentity::getDeviceId().c_str());

    if (surf.spotId[0]) {
      url += "&spotId=" + urlEncode(surf.spotId);
    } else if (surf.spot[0]) {
      url += "&spot=" + urlEncode(surf.spot);
    } else {
      url += "&spot=Surf";
    }

    url += "&hours=4";

    if (isTodaysBestConfig(surf)) {
      url += "&fuelPenalty=";
      url += (cfg.surfSettings.fuelPenalty ? "1" : "0");

      if (cfg.surfSettings.fuelPenalty && cfg.surfSettings.hasHome()) {
        url += "&homeLat=" + String(cfg.surfSettings.homeLat, 6);
        url += "&homeLon=" + String(cfg.surfSettings.homeLon, 6);
      }
    }

    return url;
  }

  uint32_t fnv1a32(const String& s) {
    uint32_t hash = 2166136261u;
    for (size_t i = 0; i < s.length(); i++) {
      hash ^= (uint8_t)s[i];
      hash *= 16777619u;
    }
    return hash;
  }

  String toHex8(uint32_t v) {
    char buf[9];
    snprintf(buf, sizeof(buf), "%08lx", (unsigned long)v);
    return String(buf);
  }

  String reminderHashSig(const String& body) {
    return toHex8(fnv1a32(body));
  }
}

void UpdateChecker::begin() {
  prefs.begin("frame", false);
}

String UpdateChecker::getLastApplied() {
  return prefs.getString("last_upd", "");
}

void UpdateChecker::saveApplied(const String& updatedAt) {
  prefs.putString("last_upd", updatedAt);
}

bool UpdateChecker::shouldForceRedrawForFirmware(const char* fwVer) {
  String last = prefs.getString("fw_ver", "");
  return last != String(fwVer);
}

void UpdateChecker::saveFirmwareVersion(const char* fwVer) {
  prefs.putString("fw_ver", String(fwVer));
}

void UpdateChecker::noteWake() {
  uint32_t c = prefs.getUInt("wake_c", 0);
  c++;
  prefs.putUInt("wake_c", c);
  Serial.print("wake_c=");
  Serial.println(c);
}

void UpdateChecker::resetWakeCounter() {
  prefs.putUInt("wake_c", 0);
}

bool UpdateChecker::shouldForcePeriodicRefresh(uint16_t wakesPerRefresh) {
  uint32_t c = prefs.getUInt("wake_c", 0);
  return (c >= wakesPerRefresh);
}

String UpdateChecker::getLastReminderSig() {
  return prefs.getString("rem_sig", "");
}

void UpdateChecker::saveReminderSig(const String& sig) {
  prefs.putString("rem_sig", sig);
}

String UpdateChecker::getLastSurfSig() {
  return prefs.getString("surf_sig", "");
}

void UpdateChecker::saveSurfSig(const String& sig) {
  prefs.putString("surf_sig", sig);
}

bool UpdateChecker::getLastUsbPresent() {
  return prefs.getBool("usb_prev", false);
}

void UpdateChecker::saveUsbPresent(bool usbPresent) {
  prefs.putBool("usb_prev", usbPresent);
}

int UpdateChecker::getLastBatteryPercent() {
  return prefs.getInt("bat_prev", -1);
}

void UpdateChecker::saveBatteryPercent(int percent) {
  prefs.putInt("bat_prev", percent);
}

bool UpdateChecker::hasConfigChanged(const String& deviceToken, String& outUpdatedAt) {
  String url = String(BASE_URL) + "/api/device/config-meta?device_id=" + DeviceIdentity::getDeviceId();

  int code = 0;
  String body;

  bool ok = httpGetAuthWithTokenAwareness(url, deviceToken, code, body);
  if (!ok || code != 200) return false;

  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, body)) return false;

  const char* upd = doc["updated_at"];
  if (!upd) return false;

  outUpdatedAt = String(upd);

  String last = getLastApplied();

  Serial.print("last_upd: ");
  Serial.println(last);
  Serial.print("server_upd: ");
  Serial.println(outUpdatedAt);

  return outUpdatedAt != last;
}

bool UpdateChecker::hasRemindersChanged(const String& deviceToken, String& outSig) {
  int code = 0;
  String body;
  String url = buildRemindersUrl();

  bool ok = httpGetAuthWithTokenAwareness(url, deviceToken, code, body);
  if (!ok || code != 200) return false;

  StaticJsonDocument<16384> doc;
  if (deserializeJson(doc, body)) return false;

  JsonArray items = doc["items"].as<JsonArray>();
  if (items.isNull()) {
    outSig = "__NO_REM_ITEMS__";
  } else {
    String itemsJson;
    serializeJson(items, itemsJson);
    outSig = reminderHashSig(itemsJson);
  }

  String last = getLastReminderSig();

  Serial.print("last_rem_sig: ");
  Serial.println(last);
  Serial.print("new_rem_sig: ");
  Serial.println(outSig);

  return outSig != last;
}

bool UpdateChecker::hasSurfChanged(const FrameConfig& cfg, const String& deviceToken, String& outSig) {
  outSig = "";

  if (cfg.surfCount == 0) {
    outSig = "__NO_SURF__";
    return outSig != getLastSurfSig();
  }

  for (int i = 0; i < cfg.surfCount && i < 4; i++) {
    const SurfModuleConfig& surf = cfg.surf[i];

    if (!surf.spotId[0] && !surf.spot[0]) continue;

    String url = buildSurfMetaUrl(cfg, surf);

    int code = 0;
    String body;

    bool ok = httpGetAuthWithTokenAwareness(url, deviceToken, code, body);
    if (!ok || code != 200) return false;

    StaticJsonDocument<1024> doc;
    if (deserializeJson(doc, body)) return false;

    const char* sig = doc["surf_signature"] | "__NO_MATCHED_EXPERIENCE__";

    outSig += "ID:";
    outSig += String((int)surf.id);
    outSig += "|SIG:";
    outSig += String(sig);
    outSig += "\n";
  }

  if (outSig.length() == 0) {
    outSig = "__NO_SURF__";
  }

  String last = getLastSurfSig();

  Serial.print("last_surf_sig_len: ");
  Serial.println(last.length());
  Serial.print("new_surf_sig_len: ");
  Serial.println(outSig.length());

  return outSig != last;
}