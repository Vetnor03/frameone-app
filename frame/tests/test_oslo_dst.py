"""Regression checks for the Norway clock transition on the ESP32 frame."""

from datetime import datetime, timezone
import os
from pathlib import Path
import time

import pytest


OSLO_POSIX_TZ = "CET-1CEST,M3.5.0/02,M10.5.0/03"
TIME_SYNC_CPP = Path(__file__).resolve().parents[1] / "src/device/TimeSync.cpp"


def test_firmware_preserves_oslo_timezone_when_starting_ntp():
    source = TIME_SYNC_CPP.read_text(encoding="utf-8")
    assert f'configTzTime("{OSLO_POSIX_TZ}"' in source
    # Arduino-ESP32 2.0.14 resets TZ when the numeric-offset overload is used.
    assert "configTime(0, 0," not in source


@pytest.mark.skipif(not hasattr(time, "tzset"), reason="POSIX TZ requires tzset")
def test_oslo_fallback_repeats_two_oclock_with_different_utc_offsets():
    original_tz = os.environ.get("TZ")
    try:
        os.environ["TZ"] = OSLO_POSIX_TZ
        time.tzset()

        # At 03:00 summer time on 25 Oct 2026, local clocks go back to 02:00.
        first_230 = datetime(2026, 10, 25, 0, 30, tzinfo=timezone.utc).timestamp()
        second_230 = datetime(2026, 10, 25, 1, 30, tzinfo=timezone.utc).timestamp()
        assert (time.localtime(first_230).tm_hour, time.localtime(first_230).tm_min, time.localtime(first_230).tm_isdst) == (2, 30, 1)
        assert (time.localtime(second_230).tm_hour, time.localtime(second_230).tm_min, time.localtime(second_230).tm_isdst) == (2, 30, 0)

        # Calendar advances at Oslo midnight, not UTC midnight.
        pre_midnight = datetime(2026, 10, 25, 22, 59, tzinfo=timezone.utc).timestamp()
        midnight = datetime(2026, 10, 25, 23, 0, tzinfo=timezone.utc).timestamp()
        assert (time.localtime(pre_midnight).tm_mday, time.localtime(pre_midnight).tm_hour) == (25, 23)
        assert (time.localtime(midnight).tm_mday, time.localtime(midnight).tm_hour) == (26, 0)
    finally:
        if original_tz is None:
            os.environ.pop("TZ", None)
        else:
            os.environ["TZ"] = original_tz
        time.tzset()
