// ProvisioningPortal.cpp
#include "ProvisioningPortal.h"
#include "WiFiManager.h"
#include "DisplayCore.h"
#include "Config.h"
#include "Theme.h"

#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>

#include <Fonts/FreeMonoBold9pt7b.h>
#include <Fonts/FreeMonoBold12pt7b.h>
#include <Fonts/FreeMonoBold18pt7b.h>

static const byte DNS_PORT = 53;
static DNSServer dnsServer;
static WebServer server(80);

static String apSsid;

static String htmlPage(const String& msg) {
  String s;
  s += "<!doctype html><html><head>";
  s += "<meta name='viewport' content='width=device-width,initial-scale=1'/>";
  s += "<meta name='theme-color' content='#061b24'/>";
  s += "<title>Connect your frame</title>";
  s += "<style>";
  s += ":root{color-scheme:dark;background:#061b24;color:#f4fbff;}";
  s += "body{font-family:system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;padding:20px;max-width:520px;margin:0 auto;background:#061b24;color:#f4fbff;}";
  s += ".card{background:#0b2733;border:1px solid rgba(255,255,255,.16);border-radius:22px;padding:20px;box-shadow:0 18px 50px rgba(0,0,0,.3);}";
  s += "h2{margin:0 0 8px;font-size:28px;}p{line-height:1.45}.muted{margin-top:0;color:rgba(244,251,255,.72)}";
  s += ".msg{color:#6fd3ff;font-weight:700;background:rgba(42,163,255,.12);border:1px solid rgba(111,211,255,.28);padding:10px 12px;border-radius:14px;}";
  s += "label{display:block;margin:14px 0 6px;color:rgba(244,251,255,.84);font-weight:650;}";
  s += "input{width:100%;box-sizing:border-box;font-size:16px;padding:13px 12px;margin:0 0 8px;border:1px solid rgba(255,255,255,.18);border-radius:14px;background:#04141b;color:#f4fbff;outline:none;}";
  s += "input:focus{border-color:#2aa3ff;box-shadow:0 0 0 3px rgba(42,163,255,.18)}";
  s += "button{width:100%;padding:14px;font-size:16px;font-weight:800;background:#2aa3ff;color:#00131c;border:none;border-radius:14px;}";
  s += ".foot{color:rgba(244,251,255,.62);margin-top:14px;}";
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

static void drawCenteredLine(const char* text, int y, const GFXfont* font) {
  auto& d = DisplayCore::get();
  d.setFont(font);

  int16_t x1, y1;
  uint16_t w, h;
  d.getTextBounds(text, 0, 0, &x1, &y1, &w, &h);

  int x = FRAME_X + (FRAME_W - (int)w) / 2;
  d.setCursor(x, y);
  d.print(text);
}

static void drawWrappedLine(const String& line, int x, int& y, int maxW, const GFXfont* font, int lineStep) {
  auto& d = DisplayCore::get();
  d.setFont(font);

  int16_t x1, y1;
  uint16_t w, h;
  d.getTextBounds(line.c_str(), 0, 0, &x1, &y1, &w, &h);

  if ((int)w <= maxW) {
    d.setCursor(FRAME_X + x, FRAME_Y + y);
    d.print(line.c_str());
    y += lineStep;
    return;
  }

  String remaining = line;
  remaining.trim();

  while (remaining.length() > 0) {
    int bestCut = -1;

    for (int i = 1; i <= remaining.length(); i++) {
      String part = remaining.substring(0, i);
      int spacePos = part.lastIndexOf(' ');
      if (spacePos > 0) part = remaining.substring(0, spacePos);

      part.trim();
      if (part.length() == 0) continue;

      d.getTextBounds(part.c_str(), 0, 0, &x1, &y1, &w, &h);
      if ((int)w <= maxW) bestCut = part.length();
      else break;
    }

    if (bestCut <= 0) bestCut = 1;

    String out = remaining.substring(0, bestCut);
    out.trim();

    d.setCursor(FRAME_X + x, FRAME_Y + y);
    d.print(out.c_str());
    y += lineStep;

    remaining = remaining.substring(bestCut);
    remaining.trim();
  }
}

namespace ProvisioningPortal {

void runBlocking() {
  Theme::set(THEME_DARK);

  // Create AP name Frame-Setup-XXXX using last 2 bytes of MAC
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char suffix[5];
  snprintf(suffix, sizeof(suffix), "%02X%02X", mac[4], mac[5]);
  apSsid = String("Frame-Setup-") + suffix;

  WiFi.mode(WIFI_AP);
  WiFi.softAP(apSsid.c_str());

  IPAddress apIP = WiFi.softAPIP();

  auto& display = DisplayCore::get();
  display.setFullWindow();
  display.firstPage();
  do {
    display.fillScreen(Theme::paper());
    display.setTextColor(Theme::ink());

    const int left = 28;
    const int maxW = FRAME_W - (left * 2);

    drawCenteredLine("CONNECT TO WIFI", FRAME_Y + 58, &FreeMonoBold18pt7b);
    drawCenteredLine("JOIN THIS NETWORK", FRAME_Y + 112, &FreeMonoBold12pt7b);

    display.setFont(&FreeMonoBold18pt7b);
    display.setCursor(FRAME_X + left, FRAME_Y + 160);
    display.print(apSsid.c_str());

    int y = 220;
    drawWrappedLine("1) Setup page should open", left, y, maxW, &FreeMonoBold12pt7b, 24);
    y += 8;
    drawWrappedLine("2) If not, open 192.168.4.1", left, y, maxW, &FreeMonoBold12pt7b, 24);
    y += 8;
    drawWrappedLine("3) Enter your home Wi-Fi", left, y, maxW, &FreeMonoBold12pt7b, 24);

    display.drawLine(FRAME_X + left, FRAME_Y + FRAME_H - 46, FRAME_X + FRAME_W - left, FRAME_Y + FRAME_H - 46, Theme::ink());

    display.setFont(&FreeMonoBold9pt7b);
    display.setCursor(FRAME_X + left, FRAME_Y + FRAME_H - 18);
    display.print("FRAME WILL CONTINUE SETUP AFTER SAVE");

  } while (display.nextPage());

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