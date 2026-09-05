# Alfred V1.2 hardware and integrated-firmware verification

## Completed board-level validation

The ESP32-S3-WROOM-1-N16R8 Alfred V1.2 PCB has physically passed USB boot/flashing; BOOT and RESET test points; the 3.3 V rail; MAX17048 I2C; BQ24074 USB/charging detection; USB/battery handover; switched e-paper rail; reset, busy, and SPI display control; full refresh on USB and battery; return of the e-paper rail to 0 V; zero-power image retention; timer wake; and deep sleep below the resolution of the 200 mA meter (less than approximately 0.1 mA observed). Awake board current was approximately 32.3 mA in the diagnostic.

These results supersede old statements that Alfred V1.2 hardware still needs manual pin, flash, or peripheral confirmation. Comments in old V1.0 diagnostics about invalid MAX17048 data do not apply to V1.2.

## Integrated firmware validation still required

The final application firmware in this PR is **not yet physically validated**. Before any release or OTA publication, USB-flash the `alfred_v1_2` environment onto an assembled V1.2 and verify:

1. Boot reports 16 MB flash and detects 8 MB OPI PSRAM.
2. Provisioning, identity derived from the unit's own eFuse MAC, pairing, networking, backend APIs, revision/ACK behavior, and real-time test behavior are unchanged.
3. MAX17048 voltage and SOC are believable; PGOOD_N LOW reports USB; CHG_N LOW reports charging only while USB is present.
4. Every screen path performs a full 800x480 refresh and GPIO12 returns LOW afterward, including while real-time mode remains awake.
5. Repeated updates power and initialize the display again successfully.
6. GPIO12 remains LOW during boot and deep sleep; both USB plug and unplug wake with the correct polarity on GPIO17.
7. Recharge shutdown near 3.35 V and USB-powered recovery near 3.55 V retain their hysteresis.
8. Both OTA slots accept the linked binary and rollback remains possible. Publishing an OTA image/manifest is a separate release action and is explicitly outside this PR.

Also repeat the existing module/layout matrix and compare rendered output against the current firmware; this hardware port intentionally changes no rendering or backend behavior.
