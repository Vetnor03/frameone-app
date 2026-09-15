#!/usr/bin/env bash
set -eo pipefail

# Rebuild the ESP32-S3 SDK used by Arduino-ESP32 2.0.14 with the two
# ESP-IDF features required for automatic light sleep:
#   CONFIG_PM_ENABLE=y
#   CONFIG_FREERTOS_USE_TICKLESS_IDLE=y
#
# This deliberately keeps the same Arduino core generation as the existing
# RE:MIND Alfred build rather than migrating firmware APIs/framework versions.
# Note: Espressif's legacy release/v4.4 builder intentionally probes optional
# unset shell variables, so this wrapper does not enable bash `nounset`.

ARDUINO_TAG="2.0.14"
LIB_BUILDER_BRANCH="release/v4.4"
IDF_BRANCH="release/v4.4"
IDF_COMMIT="357290093430e41e7e3338227a61ef5162f2deed" # ESP-IDF v4.4.6

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
WORK_DIR="${PM_CORE_WORK_DIR:-$REPO_ROOT/.pm-core-build}"
DIST_DIR="${PM_CORE_DIST_DIR:-$REPO_ROOT/frame/tools/pm_core/dist}"
BUILDER_DIR="$WORK_DIR/esp32-arduino-lib-builder"

rm -rf "$WORK_DIR" "$DIST_DIR"
mkdir -p "$WORK_DIR" "$DIST_DIR"

git clone --depth 1 --branch "$LIB_BUILDER_BRANCH" \
  https://github.com/espressif/esp32-arduino-lib-builder.git "$BUILDER_DIR"

cd "$BUILDER_DIR"

# Define the IDF location/version before the legacy helper scripts source their
# shared config.
export IDF_PATH="$BUILDER_DIR/esp-idf"
export IDF_BRANCH
export IDF_COMMIT

# Let the official builder fetch the component set expected by its v4.4 branch.
./tools/update-components.sh

# Pin Arduino itself to exactly the version RE:MIND currently builds against.
git -C components/arduino fetch --tags --force
git -C components/arduino checkout --detach "$ARDUINO_TAG"

# Add RE:MIND's PM config to the builder's common sdkconfig defaults so it is
# applied to the ESP32-S3 IDF libraries and all required S3 memory variants.
cat "$SCRIPT_DIR/defconfig.remind_pm" >> configs/defconfig.common

# Pin the underlying IDF exactly to the release used by Arduino-ESP32 2.0.14.
source ./tools/install-esp-idf.sh

# ESP-IDF 4.4 installs Jinja2 2.x, which imports MarkupSafe.soft_unicode.
# MarkupSafe 2.1+ removed that symbol, so a modern CI runner can otherwise
# break this historical, pinned toolchain before compilation begins. Install
# the final compatible MarkupSafe release into the *IDF Python environment*
# selected by export.sh above. Keeping this here makes local and CI builds
# deterministic instead of relying on whatever Python packages happen to be
# present on the machine.
python -m pip install --disable-pip-version-check --no-input "MarkupSafe==2.0.1"
python - <<'PY'
import markupsafe
assert hasattr(markupsafe, "soft_unicode"), "ESP-IDF 4.4 requires MarkupSafe.soft_unicode"
print("Verified ESP-IDF Python compatibility: MarkupSafe", markupsafe.__version__)
PY

# Components/IDF are now pinned and installed; -s prevents the builder from
# updating them again. Build the complete ESP32-S3 Arduino SDK output.
./build.sh -s -t esp32s3

SDK_DIR="$BUILDER_DIR/out/tools/sdk/esp32s3"
if [[ ! -d "$SDK_DIR" ]]; then
  echo "ERROR: expected SDK directory was not produced: $SDK_DIR" >&2
  exit 1
fi

# Verify the generated headers, not merely the input config fragment.
CONFIG_HEADER="$(find "$SDK_DIR" -path '*/config/sdkconfig.h' -print -quit)"
if [[ -z "$CONFIG_HEADER" ]]; then
  echo "ERROR: generated sdkconfig.h not found in ESP32-S3 SDK" >&2
  exit 1
fi

grep -q '^#define CONFIG_PM_ENABLE 1$' "$CONFIG_HEADER"
grep -q '^#define CONFIG_FREERTOS_USE_TICKLESS_IDLE 1$' "$CONFIG_HEADER"

cat > "$DIST_DIR/BUILD_INFO.txt" <<EOF
RE:MIND Alfred V1.2 PM-enabled Arduino SDK
Arduino-ESP32: $ARDUINO_TAG
ESP-IDF commit: $IDF_COMMIT (v4.4.6)
Target: esp32s3
CONFIG_PM_ENABLE=y
CONFIG_FREERTOS_USE_TICKLESS_IDLE=y
CONFIG_FREERTOS_IDLE_TIME_BEFORE_SLEEP=3
EOF

# A zip is convenient on Windows. Its root contains the replacement esp32s3
# folder expected under Arduino-ESP32 2.0.14/tools/sdk/.
(
  cd "$BUILDER_DIR/out/tools/sdk"
  zip -qr "$DIST_DIR/remind-arduino-esp32-2.0.14-esp32s3-pm-sdk.zip" esp32s3
)

echo "Built and verified PM-enabled ESP32-S3 Arduino SDK:"
echo "  $DIST_DIR/remind-arduino-esp32-2.0.14-esp32s3-pm-sdk.zip"
