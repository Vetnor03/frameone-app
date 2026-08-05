#!/usr/bin/env python3
"""Static safety checks for the Alfred Stage 2 display diagnostic.

This intentionally does not compile or upload firmware. It verifies the core
source-level safety invariants that are easy to regress during review:

- the custom Alfred FSPI instance is explicitly bound to GxEPD2 before init;
- the display init path does not rely on the default/global SPI binding;
- the diagnostic remains unarmed by default;
- protected production firmware files are not modified in the working tree.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
SKETCH = ROOT / "frame/diagnostics/alfred_stage2/Alfred_Stage2_Display_Test.ino"
PROTECTED_PRODUCTION_FILES = [
    "frame/src/frame_v2.5.1.ino",
    "frame/src/display/DisplayCore.cpp",
    "frame/src/display/DisplayCore.h",
    "frame/src/display/DisplayType.h",
    "frame/src/core/Config.h",
]


def fail(message: str) -> None:
    print(f"FAIL: {message}", file=sys.stderr)
    sys.exit(1)


def require(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


def main() -> None:
    source = SKETCH.read_text(encoding="utf-8")

    require(
        "#define ALFRED_STAGE2_PANEL_TEST_ARMED 0" in source,
        "ALFRED_STAGE2_PANEL_TEST_ARMED must remain 0 by default",
    )

    require(
        "static SPIClass alfredEpdSpi(FSPI);" in source,
        "custom FSPI instance alfredEpdSpi is missing",
    )

    select_spi = "display.epd2.selectSPI(alfredEpdSpi, SPISettings(ALFRED_STAGE2_SPI_HZ, MSBFIRST, SPI_MODE0));"
    extended_init = re.compile(
        r"display\.init\s*\([^;]*alfredEpdSpi\s*,\s*SPISettings\s*\(\s*ALFRED_STAGE2_SPI_HZ\s*,\s*MSBFIRST\s*,\s*SPI_MODE0\s*\)",
        re.DOTALL,
    )
    require(
        select_spi in source or extended_init.search(source) is not None,
        "custom SPI instance must be explicitly passed/bound to GxEPD2",
    )

    init_pos = source.find("display.init(")
    select_pos = source.find("display.epd2.selectSPI(")
    require(init_pos != -1, "display.init() call not found")
    require(select_pos != -1 and select_pos < init_pos, "selectSPI() must occur before display.init()")

    require(
        "SPI.begin(" not in source and "::begin(" not in source,
        "Stage 2 must not call the global/default SPI begin path",
    )
    require(
        "alfredEpdSpi.begin(PIN_EPD_SCK, PIN_EPD_MISO_UNUSED, PIN_EPD_MOSI, PIN_EPD_CS);" in source,
        "custom SPI begin must use explicit Alfred pins",
    )

    status = subprocess.run(
        ["git", "status", "--porcelain", "--", *PROTECTED_PRODUCTION_FILES],
        cwd=ROOT,
        check=True,
        text=True,
        stdout=subprocess.PIPE,
    ).stdout.strip()
    require(not status, f"protected production files have working-tree changes:\n{status}")

    print("PASS: custom FSPI is explicitly bound to GxEPD2 before display.init().")
    print("PASS: no global/default SPI.begin() path is used by Stage 2.")
    print("PASS: Stage 2 remains unarmed by default.")
    print("PASS: protected production firmware files are untouched in the working tree.")


if __name__ == "__main__":
    main()
