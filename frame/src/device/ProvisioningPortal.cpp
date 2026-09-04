// ProvisioningPortal.cpp
#include "ProvisioningPortal.h"
#include "WiFiManager.h"
#include "ScreenPairing.h"

#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <algorithm>
#include <vector>

static const byte DNS_PORT = 53;
static DNSServer dnsServer;
static WebServer server(80);

static String apSsid;

struct ScannedNetwork {
  String ssid;
  int32_t rssi;
};

static String escapeHtml(const String& value) {
  String escaped;
  escaped.reserve(value.length());
  for (size_t i = 0; i < value.length(); ++i) {
    switch (value[i]) {
      case '&': escaped += "&amp;"; break;
      case '<': escaped += "&lt;"; break;
      case '>': escaped += "&gt;"; break;
      case '\"': escaped += "&quot;"; break;
      case '\'': escaped += "&#39;"; break;
      default: escaped += value[i]; break;
    }
  }
  return escaped;
}

static std::vector<ScannedNetwork> scanNearbyNetworks() {
  std::vector<ScannedNetwork> scannedNetworks;
  const int count = WiFi.scanNetworks(false, false);
  for (int i = 0; i < count; ++i) {
    const String ssid = WiFi.SSID(i);
    if (ssid.length() == 0) continue;

    bool alreadyAdded = false;
    for (const ScannedNetwork& network : scannedNetworks) {
      if (network.ssid == ssid) {
        alreadyAdded = true;
        break;
      }
    }
    if (!alreadyAdded) scannedNetworks.push_back({ssid, WiFi.RSSI(i)});
  }
  WiFi.scanDelete();

  std::sort(scannedNetworks.begin(), scannedNetworks.end(),
            [](const ScannedNetwork& a, const ScannedNetwork& b) {
              return a.rssi > b.rssi;
            });
  return scannedNetworks;
}

static String pageStyle() {
  String s;
  s += "<style>";
  s += ":root{color-scheme:light;background:#f5f6f8;color:#1d252c;}";
  s += "body{font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;padding:20px;max-width:520px;margin:0 auto;background:#f5f6f8;color:#1d252c;}";
  s += ".card{background:#fff;border:1px solid rgba(0,0,0,.06);border-radius:22px;padding:20px;box-shadow:0 18px 50px rgba(24,32,40,.12);}";
  s += "h2{margin:0 0 8px;font-size:28px;}p{line-height:1.45}.muted{margin-top:0;color:rgba(29,37,44,.68)}";
  s += ".msg{color:#168de2;font-weight:700;background:rgba(42,163,255,.10);border:1px solid rgba(42,163,255,.20);padding:10px 12px;border-radius:14px;}";
  s += "label{display:block;margin:14px 0 6px;color:rgba(29,37,44,.80);font-weight:650;}";
  s += "input{width:100%;box-sizing:border-box;font-size:16px;padding:13px 12px;margin:0 0 8px;border:1px solid rgba(0,0,0,.08);border-radius:14px;background:#f3f4f6;color:#1d252c;outline:none;}";
  s += "input:focus{border-color:#2aa3ff;box-shadow:0 0 0 3px rgba(42,163,255,.18)}";
  s += ".networks{border:1px solid rgba(0,0,0,.08);border-radius:14px;overflow:hidden;background:#f3f4f6;}";
  s += ".network{display:flex;align-items:center;gap:10px;margin:0;padding:12px;border-bottom:1px solid rgba(0,0,0,.06);font-weight:500;cursor:pointer;}";
  s += ".network:last-child{border-bottom:0}.network input{width:auto;margin:0}.manual{font-size:14px;color:#168de2;background:none;border:0;padding:10px 0;width:auto;font-weight:650;}";
  s += ".selected-network{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 12px;border:1px solid rgba(0,0,0,.08);border-radius:14px;background:#f3f4f6;font-weight:700;}";
  s += ".change{width:auto;padding:0;background:none;color:#168de2;font-size:14px;font-weight:700;}";
  s += "button{width:100%;padding:14px;font-size:16px;font-weight:800;background:#2aa3ff;color:#fff;border:none;border-radius:14px;cursor:pointer;}";
  s += ".foot{color:rgba(29,37,44,.58);margin-top:14px;}";
  s += ".connecting{text-align:center;padding:16px 2px 8px}.spinner{width:38px;height:38px;margin:8px auto 22px;border-radius:50%;border:4px solid rgba(42,163,255,.18);border-top-color:#2aa3ff;animation:spin .9s linear infinite;}";
  s += "@keyframes spin{to{transform:rotate(360deg)}}";
  s += "</style>";
  return s;
}

static String htmlPage(const String& msg,
                       const std::vector<ScannedNetwork>& scannedNetworks) {
  String s;
  s += "<!doctype html><html><head>";
  s += "<meta name='viewport' content='width=device-width,initial-scale=1'/>";
  s += "<meta name='theme-color' content='#f5f6f8'/>";
  s += "<title>Connect your frame</title>";
  s += pageStyle();
  s += "</head><body><main class='card'>";
  s += "<h2>Connect your frame</h2>";
  s += "<p class='muted'>Choose the Wi-Fi network your frame should use.</p>";
  if (msg.length()) s += "<p class='msg'>" + escapeHtml(msg) + "</p>";
  s += "<form id='wifiForm' method='POST' action='/save'>";

  if (scannedNetworks.empty()) {
    s += "<label for='manual'>Wi-Fi name</label>";
    s += "<input id='manual' name='manual_ssid' placeholder='Your Wi-Fi name' required />";
    s += "<div id='passwordSection'>";
  } else {
    s += "<div id='networkPicker'>";
    s += "<label>Wi-Fi network</label>";
    s += "<div class='networks'>";
    for (size_t i = 0; i < scannedNetworks.size(); ++i) {
      const String ssid = escapeHtml(scannedNetworks[i].ssid);
      s += "<label class='network'><input type='radio' name='ssid' value='" + ssid + "' onchange='selectNetwork(this)'";
      if (i == 0) s += " required";
      s += "><span>" + ssid + "</span></label>";
    }
    s += "</div>";
    s += "<button class='manual' type='button' onclick='manualNetwork()'>Enter network manually</button>";
    s += "</div>";

    s += "<div id='selectedNetwork' hidden>";
    s += "<label>Wi-Fi network</label>";
    s += "<div class='selected-network'><span id='selectedSsid'></span><button class='change' type='button' onclick='changeNetwork()'>Change</button></div>";
    s += "</div>";

    s += "<div id='manualNetwork' hidden>";
    s += "<label for='manual'>Wi-Fi name</label>";
    s += "<input id='manual' name='manual_ssid' placeholder='Your Wi-Fi name' />";
    s += "</div>";

    s += "<div id='passwordSection' hidden>";
  }

  s += "<label for='pass'>Password</label>";
  s += "<input id='pass' name='pass' type='password' placeholder='Wi-Fi password' />";
  s += "<button type='submit'>Connect frame</button>";
  s += "</div>";
  s += "</form>";
  s += "<p class='foot'>After connecting, the frame will restart and continue setup.</p>";

  if (!scannedNetworks.empty()) {
    s += "<script>";
    s += "function selectNetwork(input){";
    s += "document.getElementById('networkPicker').hidden=true;";
    s += "document.getElementById('manualNetwork').hidden=true;";
    s += "var manual=document.getElementById('manual');manual.required=false;manual.value='';";
    s += "document.getElementById('selectedSsid').textContent=input.value;";
    s += "document.getElementById('selectedNetwork').hidden=false;";
    s += "document.getElementById('passwordSection').hidden=false;";
    s += "document.getElementById('pass').focus();}";
    s += "function changeNetwork(){";
    s += "document.getElementById('selectedNetwork').hidden=true;";
    s += "document.getElementById('manualNetwork').hidden=true;";
    s += "document.getElementById('passwordSection').hidden=true;";
    s += "document.getElementById('pass').value='';";
    s += "document.getElementById('networkPicker').hidden=false;}";
    s += "function manualNetwork(){";
    s += "document.querySelectorAll('[name=ssid]').forEach(function(e){e.checked=false;e.required=false});";
    s += "document.getElementById('networkPicker').hidden=true;";
    s += "document.getElementById('selectedNetwork').hidden=true;";
    s += "document.getElementById('manualNetwork').hidden=false;";
    s += "var manual=document.getElementById('manual');manual.required=true;";
    s += "document.getElementById('passwordSection').hidden=false;manual.focus();}";
    s += "</script>";
  }

  s += "</main></body></html>";
  return s;
}

static String connectingPage(const String& ssid) {
  String s;
  s += "<!doctype html><html><head>";
  s += "<meta name='viewport' content='width=device-width,initial-scale=1'/>";
  s += "<meta name='theme-color' content='#f5f6f8'/>";
  s += "<title>Connecting your frame</title>";
  s += pageStyle();
  s += "</head><body><main class='card'>";
  s += "<div class='connecting'><div class='spinner'></div>";
  s += "<h2>Connecting your frame</h2>";
  s += "<p class='muted'>Trying to connect to <strong>" + escapeHtml(ssid) + "</strong>.</p>";
  s += "<p class='muted'>You don't need to enter your Wi-Fi details again. The frame will restart and continue setup automatically.</p>";
  s += "</div></main></body></html>";
  return s;
}

static void handleRoot(const std::vector<ScannedNetwork>& scannedNetworks) {
  server.send(200, "text/html", htmlPage("", scannedNetworks));
}

static void handleSave(const std::vector<ScannedNetwork>& scannedNetworks) {
  String ssid = server.arg("manual_ssid");
  if (ssid.length() == 0) ssid = server.arg("ssid");
  String pass = server.arg("pass");

  ssid.trim();

  if (ssid.length() == 0) {
    server.send(400, "text/html",
                htmlPage("Wi-Fi name required.", scannedNetworks));
    return;
  }

  WiFiManagerV2::saveCreds(ssid, pass);
  server.send(200, "text/html", connectingPage(ssid));
  delay(900);
  ESP.restart();
}

static void handleNotFound() {
  server.sendHeader("Location", String("http://") + WiFi.softAPIP().toString(), true);
  server.send(302, "text/plain", "");
}

namespace ProvisioningPortal {

void runBlocking() {
  // Create AP name FRAME-000-XXXX using last 2 bytes of MAC
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char suffix[5];
  snprintf(suffix, sizeof(suffix), "%02X%02X", mac[4], mac[5]);
  apSsid = String("FRAME-000-") + suffix;

  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(apSsid.c_str());

  IPAddress apIP = WiFi.softAPIP();

  const std::vector<ScannedNetwork> scannedNetworks = scanNearbyNetworks();

  ScreenPairing::showWifiSetup(apSsid.c_str());

  Serial.println("=== Provisioning Portal ===");
  Serial.print("AP SSID: ");
  Serial.println(apSsid);
  Serial.print("AP IP: ");
  Serial.println(apIP);

  dnsServer.start(DNS_PORT, "*", apIP);

  server.on("/", HTTP_GET, [&scannedNetworks]() { handleRoot(scannedNetworks); });
  server.on("/save", HTTP_POST,
            [&scannedNetworks]() { handleSave(scannedNetworks); });
  server.onNotFound(handleNotFound);
  server.begin();

  while (true) {
    dnsServer.processNextRequest();
    server.handleClient();
    delay(5);
  }
}

} // namespace ProvisioningPortal
