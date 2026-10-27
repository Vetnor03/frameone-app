"""F2 opt-in typography engine: native compilation and pixel geometry contracts.

Run via pytest -q frame/tests/test_editorial_text_native.py; no connected frame.
This host test deliberately links the REAL FrameText normalizer and F2 source.
"""
from pathlib import Path
import shutil
import subprocess
import textwrap

import pytest


FRAME = Path(__file__).resolve().parents[1]


def test_editorial_text_native_contract(tmp_path):
    cxx = shutil.which("g++")
    if cxx is None:
        pytest.skip("Native g++ is not installed")

    stub = tmp_path / "Adafruit_GFX.h"
    stub.write_text(textwrap.dedent("""\
        #pragma once
        #include <cstdint>
        struct GFXglyph {
            uint16_t bitmapOffset;
            uint8_t width, height, xAdvance;
            int8_t xOffset, yOffset;
        };
        struct GFXfont {
            uint8_t* bitmap;
            GFXglyph* glyph;
            uint16_t first, last;
            uint8_t yAdvance;
        };
        """))
    (tmp_path / "Arduino.h").write_text(textwrap.dedent("""\
        #pragma once
        #include <cstdint>
        #define pgm_read_byte(addr) (*reinterpret_cast<const uint8_t*>(addr))
        #define pgm_read_word(addr) (*reinterpret_cast<const uint16_t*>(addr))
        #define pgm_read_ptr(addr) (*(addr))
        """))
    src = tmp_path / "test.cpp"
    src.write_text(textwrap.dedent(r"""\
        #include "EditorialText.h"
        #include <cassert>
        #include <cstring>
        using namespace EditorialText;

        int main() {
            GFXglyph g[224] = {};
            for (auto& glyph : g) {
                glyph.width = 4; glyph.height = 8;
                glyph.xAdvance = 6; glyph.xOffset = 1; glyph.yOffset = -7;
            }
            g[0].width = 0; g[0].height = 0; g[0].xAdvance = 3; // space
            g['A'-0x20] = {0, 5, 10, 6, -2, -9}; // negative bearings
            g['B'-0x20] = {0, 5, 8, 6, 2, -8};
            GFXfont font = {nullptr, g, 0x20, 0xFF, 26};
            LineMetrics metrics;
            assert(measureLine(&font, "AB", metrics) == Status::OK);
            assert(metrics.minX == -2 && metrics.minY == -9);
            assert(metrics.inkWidth == 15 && metrics.inkHeight == 10);
            assert(metrics.advanceX == 12 && metrics.lineAdvance == 26);
            // Deliberately different advance and ink extents.
            assert(metrics.advanceX != metrics.inkWidth);

            char scratch[64] = {};
            LinePlan plan;
            Rect box = {0, 0, 40, 30};
            assert(planLine(&font, "AB", scratch, sizeof scratch, box, 2,
                            Horizontal::CENTER, Vertical::CENTER, plan) == Status::OK);
            assert(plan.ink.x == 12 && plan.ink.y == 10);
            assert(plan.ink.w == 15 && plan.ink.h == 10);
            assert(plan.cursorX == 14 && plan.baselineY == 19);
            assert(!std::strcmp(scratch, "AB"));
            assert(planLine(&font, "AB", scratch, sizeof scratch, box, 2,
                            Horizontal::RIGHT, Vertical::BOTTOM, plan) == Status::OK);
            assert(plan.ink.x == 23 && plan.ink.y == 18);
            assert(planLine(&font, "AB", scratch, sizeof scratch, box, 2,
                            Horizontal::LEFT, Vertical::TOP, plan) == Status::OK);
            assert(plan.ink.x == 2 && plan.ink.y == 2);

            assert(planLine(&font, u8"Æ Ø Å æ ø å °", scratch, sizeof scratch, box, 1,
                            Horizontal::CENTER, Vertical::CENTER, plan) == Status::DOES_NOT_FIT);
            // Longer norwegian line fits a wider native cell.
            Rect wide = {0, 0, 400, 240};
            assert(planLine(&font, u8"Æ Ø Å æ ø å °", scratch, sizeof scratch, wide, 8,
                            Horizontal::LEFT, Vertical::TOP, plan) == Status::OK);
            const unsigned char expected[] = {0xC6, ' ', 0xD8, ' ', 0xC5, ' ',
                                              0xE6, ' ', 0xF8, ' ', 0xE5, ' ', 0xB0, 0};
            assert(!std::memcmp(scratch, expected, sizeof expected));
            assert(planLine(&font, u8"A\u030A", scratch, sizeof scratch, wide, 8,
                            Horizontal::LEFT, Vertical::TOP, plan) == Status::OK);
            assert((unsigned char)scratch[0] == 0xC5 && scratch[1] == 0);

            assert(planLine(&font, "AB", scratch, sizeof scratch, {0, 0, 6, 6}, 0,
                            Horizontal::LEFT, Vertical::TOP, plan) == Status::DOES_NOT_FIT);
            char tiny[2] = {};
            assert(planLine(&font, "AB", tiny, sizeof tiny, wide, 0,
                            Horizontal::LEFT, Vertical::TOP, plan) == Status::BUFFER_TOO_SMALL);
            assert(!tiny[0]); // never leak partial text on rejection
            assert(planLine(&font, "AB", scratch, sizeof scratch, wide, -1,
                            Horizontal::LEFT, Vertical::TOP, plan) == Status::INVALID_ARGUMENT);
            assert(planLine(&font, "    ", scratch, sizeof scratch, wide, 0,
                            Horizontal::LEFT, Vertical::TOP, plan) == Status::EMPTY);
            assert(measureLine(&font, "\n", metrics) == Status::UNSUPPORTED_GLYPH);
            assert(measureLine(nullptr, "AB", metrics) == Status::INVALID_ARGUMENT);
            assert(planLine(&font, u8"🙂", scratch, sizeof scratch, wide, 0,
                            Horizontal::LEFT, Vertical::TOP, plan) == Status::EMPTY);
            // Return-path failure should never advertise a drawable plan.
            assert(plan.cursorX == 0 && plan.baselineY == 0);
        }
        """))
    executable = tmp_path / "f2_native"
    command = [
        cxx, "-std=c++17", "-Wall", "-Wextra", "-Werror", "-O2",
        "-I", str(tmp_path), "-I", str(FRAME / "src" / "display"),
        str(FRAME / "src" / "display" / "EditorialText.cpp"),
        str(FRAME / "src" / "display" / "FrameText.cpp"),
        str(src), "-o", str(executable),
    ]
    compiled = subprocess.run(command, text=True, capture_output=True, check=False)
    assert compiled.returncode == 0, compiled.stdout + compiled.stderr
    run = subprocess.run([str(executable)], text=True, capture_output=True, check=False)
    assert run.returncode == 0, run.stdout + run.stderr
