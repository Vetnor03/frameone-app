// ProvisioningPortal.cpp
#include "ProvisioningPortal.h"
#include "WiFiManager.h"
#include "ScreenPairing.h"

#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>

static const byte DNS_PORT = 53;
static DNSServer dnsServer;
static WebServer server(80);

static String apSsid;

static String htmlPage(const String& msg) {
  String s;
  s += "<!doctype html><html><head>";
  s += "<meta name='viewport' content='width=device-width,initial-scale=1'/>";
  s += "<meta name='theme-color' content='#f5f6f8'/>";
  s += "<title>Connect your frame</title>";
  s += "<style>";
  s += ":root{color-scheme:light;background:#f5f6f8;color:#1d252c;}";
  s += "body{font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;padding:20px;max-width:520px;margin:0 auto;background:#f5f6f8;color:#1d252c;}";
  s += ".card{background:#fff;border:1px solid rgba(0,0,0,.06);border-radius:22px;padding:20px;box-shadow:0 18px 50px rgba(24,32,40,.12);}";
  s += "h2{margin:0 0 8px;font-size:28px;}p{line-height:1.45}.muted{margin-top:0;color:rgba(29,37,44,.68)}";
  s += ".msg{color:#168de2;font-weight:700;background:rgba(42,163,255,.10);border:1px solid rgba(42,163,255,.20);padding:10px 12px;border-radius:14px;}";
  s += "label{display:block;margin:14px 0 6px;color:rgba(29,37,44,.80);font-weight:650;}";
  s += "input{width:100%;box-sizing:border-box;font-size:16px;padding:13px 12px;margin:0 0 8px;border:1px solid rgba(0,0,0,.08);border-radius:14px;background:#f3f4f6;color:#1d252c;outline:none;}";
  s += "input:focus{border-color:#2aa3ff;box-shadow:0 0 0 3px rgba(42,163,255,.18)}";
  s += "button{width:100%;padding:14px;font-size:16px;font-weight:800;background:#2aa3ff;color:#fff;border:none;border-radius:14px;}";
  s += ".foot{color:rgba(29,37,44,.58);margin-top:14px;}";
  s += "</style>";
  s += "</head><body><main class='card'>";
  s += "<h2>Connect your frame</h2>";
  s += "<p class='muted'>Choose the Wi-Fi network your frame should use.</p>";
  if (msg.length()) s += "<p class='msg'>" + msg + "</p>";
  s += "<form method='POST' action='/save'>";
  s += "<label>Wi-Fi name</label>";
  s += "<input name='ssid' placeholder='Your Wi-Fi name' required />";
  s += "<label>Password</label>";
  s += "<input name='pass' type='password' placeholder='Wi-Fi password' />";
  s += "<button>Connect frame</button>";
  s += "</form>";
  s += "<p class='foot'>After saving, the frame will restart and continue setup.</p>";
  s += "</main></body></html>";
  return s;
}

static void handleRoot() {
  server.send(200, "text/html", htmlPage(""));
}

static void handleSave() {
  String ssid = server.arg("ssid");
  String pass = server.arg("pass");

  ssid.trim();

  if (ssid.length() == 0) {
    server.send(400, "text/html", htmlPage("Wi-Fi name required."));
    return;
  }

  WiFiManagerV2::saveCreds(ssid, pass);
  server.send(200, "text/html", htmlPage("Saved. Reconnecting your frame..."));
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

  WiFi.mode(WIFI_AP);
  WiFi.softAP(apSsid.c_str());

  IPAddress apIP = WiFi.softAPIP();

  ScreenPairing::showWifiSetup(apSsid.c_str());

  Serial.println("=== Provisioning Portal ===");
  Serial.print("AP SSID: ");
  Serial.println(apSsid);
  Serial.print("AP IP: ");
  Serial.println(apIP);

  dnsServer.start(DNS_PORT, "*", apIP);

  server.on("/", HTTP_GET, handleRoot);
  server.on("/save", HTTP_POST, handleSave);
  server.onNotFound(handleNotFound);
  server.begin();

  while (true) {
    dnsServer.processNextRequest();
    server.handleClient();
    delay(5);
  }
}

} // namespace ProvisioningPortal
