#!/usr/bin/env bash
set -euo pipefail

# Build only the ESP32-S3 libraries RE:MIND needs for Alfred V1.2.
# This reproduces the PM-enabled Arduino-ESP32 3.3.11 / IDF 5.5.5 library
# generation used for the completed connected-light-sleep battery tests.\n# The builder implementation itself is pinned separately for reproducible CI;\n# its exact commit was not part of the battery-test record.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

ARDUINO_TAG="${ARDUINO_TAG:-3.3.11}"
IDF_BRANCH="${IDF_BRANCH:-release/v5.5}"
IDF_COMMIT="${IDF_COMMIT:-b774170ff46c393eeb5e495ea37936038d3f4f4f}"
BUILDER_COMMIT="${BUILDER_COMMIT:-6671d0bd65cdb9d4cc1001b759e8610de945a8d5}"
TINYUSB_COMMIT="${TINYUSB_COMMIT:-7c1afa837a28c7bd5210f57eda4afba4e171cad4}"

WORK_DIR="${PM_WORK_DIR:-$REPO_ROOT/.pm-production-build}"
DIST_DIR="${PM_DIST_DIR:-$REPO_ROOT/.pm-production-dist}"
BUILDER_DIR="$WORK_DIR/esp32-arduino-lib-builder"

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

git init "$BUILDER_DIR"
git -C "$BUILDER_DIR" remote add origin https://github.com/espressif/esp32-arduino-lib-builder.git
git -C "$BUILDER_DIR" fetch --depth 1 origin "$BUILDER_COMMIT"
git -C "$BUILDER_DIR" checkout --detach FETCH_HEAD

cd "$BUILDER_DIR"
export IDF_PATH="$BUILDER_DIR/esp-idf"
export IDF_BRANCH
export IDF_COMMIT

# Pin the Arduino component and TinyUSB dependency instead of using the
# builder's update-components.sh, which follows TinyUSB HEAD.
mkdir -p components/arduino_tinyusb
git clone --depth 1 --branch "$ARDUINO_TAG" \
  https://github.com/espressif/arduino-esp32.git components/arduino
git init components/arduino_tinyusb/tinyusb
git -C components/arduino_tinyusb/tinyusb remote add origin https://github.com/hathach/tinyusb.git
git -C components/arduino_tinyusb/tinyusb fetch --depth 1 origin "$TINYUSB_COMMIT"
git -C components/arduino_tinyusb/tinyusb checkout --detach FETCH_HEAD

# Install and export the matching IDF/toolchain, pinned to the same IDF commit
# used by the official 3.3.11 library package.
source ./tools/install-esp-idf.sh

cp "$SCRIPT_DIR/defconfig.remind_pm" configs/defconfig.remind_pm

# These are the two builds used by RE:MIND:
# 1) common S3 IDF libraries with PM/tickless enabled
# 2) the Alfred memory variant: QIO flash @ 80 MHz + OPI PSRAM
./build.sh -s -t esp32s3 -b idf-libs remind_pm
./build.sh -s -t esp32s3 -b mem-variant remind_pm qio 80m opi_ram

SDK_DIR="$BUILDER_DIR/out/tools/esp32-arduino-libs/esp32s3"
if [[ ! -d "$SDK_DIR" ]]; then
  echo "ERROR: PM-enabled ESP32-S3 SDK output was not produced: $SDK_DIR" >&2
  exit 1
fi

# The last build's sdkconfig is direct evidence that the libraries were compiled
# with the two features required by esp_pm_configure(light_sleep_enable=true).
grep -q '^CONFIG_PM_ENABLE=y$' "$BUILDER_DIR/sdkconfig"
grep -q '^CONFIG_FREERTOS_USE_TICKLESS_IDLE=y$' "$BUILDER_DIR/sdkconfig"
grep -q '^CONFIG_DIAG_USE_EXTERNAL_LOG_WRAP=y$' "$BUILDER_DIR/sdkconfig"

# Alfred uses the qio_opi memory type. Refuse to publish/copy an incomplete
# custom SDK that does not contain that variant.
if [[ ! -d "$SDK_DIR/qio_opi" ]]; then
  echo "ERROR: expected Alfred qio_opi memory variant is missing" >&2
  exit 1
fi

cp -a "$SDK_DIR" "$DIST_DIR/esp32s3"
cp "$BUILDER_DIR/sdkconfig" "$DIST_DIR/sdkconfig.build"

cat > "$DIST_DIR/BUILD_INFO.txt" <<EOF
RE:MIND Alfred V1.2 production PM libraries
Arduino-ESP32: $ARDUINO_TAG
ESP-IDF branch: $IDF_BRANCH
ESP-IDF commit: $IDF_COMMIT (v5.5.5 generation)
Builder commit: $BUILDER_COMMIT
TinyUSB commit: $TINYUSB_COMMIT
Target: esp32s3
Memory variant: qio_opi
CONFIG_PM_ENABLE=y
CONFIG_FREERTOS_USE_TICKLESS_IDLE=y
CONFIG_FREERTOS_IDLE_TIME_BEFORE_SLEEP=3
CONFIG_DIAG_USE_EXTERNAL_LOG_WRAP=y
EOF

echo "Built and verified RE:MIND PM-enabled ESP32-S3 libraries:"
echo "  $DIST_DIR/esp32s3"
