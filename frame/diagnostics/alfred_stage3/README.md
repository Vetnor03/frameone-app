# RE:MIND Alfred Stage 3 Wi-Fi diagnostic

This standalone sketch checks Wi-Fi connectivity and long-running stability on an
**ESP32-S3-WROOM-1-N16R8** over native USB CDC. It does not initialize the display,
touch production configuration, or make authenticated API requests.

## First-run hardware state

Before powering the board, verify all three conditions:

- **USB connected** (the only power source)
- **Battery disconnected**
- **Display disconnected**

GPIO12 (`EPD_PWR`) is forced LOW before serial or Wi-Fi initialization and is
reasserted LOW continuously. Do not connect the display for this test.

## Local Wi-Fi credentials

Credentials must remain local and must never be committed. From this directory:

```sh
cp AlfredStage3Secrets.example.h AlfredStage3Secrets.h
```

Edit `AlfredStage3Secrets.h` and replace both `replace-me` values with the test
network SSID and password. The local file is ignored by Git. Connection progress
prints the SSID but never prints the password.

## Exact Arduino IDE settings

| Setting | Value |
| --- | --- |
| Board | ESP32S3 Dev Module |
| USB CDC On Boot | Enabled |
| Flash Size | 16MB |
| PSRAM | OPI PSRAM |
| USB Mode | Hardware CDC and JTAG |
| Upload Mode | UART0 / Hardware CDC |
| Partition Scheme | 16M Flash (3MB APP/9.9MB FATFS) |
| Serial Monitor | 115200 |

Compile and upload `Alfred_Stage3_WiFi_Test.ino`, then open the Serial Monitor at
115200 baud. The sketch waits for serial for at most three seconds, attempts its
initial Wi-Fi connection for 30 seconds, and continues running regardless of
failures. A status line is emitted every five seconds. Disconnect reasons and
automatic reconnect attempts remain visible; the diagnostic never automatically
reboots.

On the intended Alfred board, startup should report the Wi-Fi STA MAC as
`14:C1:9F:49:AC:88`, the production-algorithm device ID as
`frm_88AC499FC114`, and `Device-ID check: PASS`. A MAC read failure is reported
explicitly and makes this check fail.

Wi-Fi callbacks only enqueue minimal event data under a FreeRTOS critical
section. The main loop prints each retained disconnect reason and requests a
reconnect at most once every five seconds until the station is connected.

## Static safety check

Run from the repository root:

```sh
python3 frame/diagnostics/alfred_stage3/check_stage3_static.py
```

The checker rejects unsafe GPIO12 ordering or levels, forbidden peripheral and
storage APIs, credentials in tracked Stage 3 files, changes outside the diagnostic
and its required Git ignore entry, and use of protected GPIOs.
