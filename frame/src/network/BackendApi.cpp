#include "BackendApi.h"
#include "Config.h"
#include "NetClient.h"
#include "DeviceIdentity.h"
#include <ArduinoJson.h>

bool BackendApi::pairStart(PairStartResponse& out) {
  String url = String(BASE_URL) + "/api/device/pair/start?device_id=" + DeviceIdentity::getDeviceId();

  int code = 0;
  String body;
  bool ok = NetClient::httpGet(url, code, body);

  Serial.print("pair/start HTTP: ");
  Serial.println(code);
  Serial.println(body);

  if (!ok || code != 200) return false;

  StaticJsonDocument<768> doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) return false;

  out.pair_code = (const char*)doc["pair_code"];

  if (doc.containsKey("expires_in")) out.expires_in_sec = doc["expires_in"].as<int>();
  else if (doc.containsKey("expires_in_sec")) out.expires_in_sec = doc["expires_in_sec"].as<int>();
  else out.expires_in_sec = 0;

  return out.pair_code.length() > 0;
}

bool BackendApi::pairStatus(PairStatusResponse& out) {
  String url = String(BASE_URL) + "/api/device/pair/status?device_id=" + DeviceIdentity::getDeviceId();

  int code = 0;
  String body;
  bool ok = NetClient::httpGet(url, code, body);

  Serial.print("pair/status HTTP: ");
  Serial.println(code);
  Serial.println(body);

  if (!ok || code != 200) return false;

  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    Serial.println("pair/status JSON parse failed");
    return false;
  }

  out.paired = doc["paired"].as<bool>();

  const char* tok = doc["device_token"].as<const char*>();
  if (tok && tok[0] != '\0') out.device_token = String(tok);
  else out.device_token = "";

  Serial.print("parsed paired=");
  Serial.print(out.paired ? "true" : "false");
  Serial.print(" token_len=");
  Serial.println(out.device_token.length());

  return true;
}