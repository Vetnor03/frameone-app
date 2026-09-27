#!/usr/bin/env python3
"""Check the live backend TLS chain using exactly the firmware's trusted roots.

Runs in CI, not on a production device. No credentials or firmware install.
An unreachable domain or an unexpected certificate chain fails closed.
"""

from __future__ import annotations

import re
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlsplit


FRAME_ROOT = Path(__file__).resolve().parents[1]
TRUST_SOURCE = FRAME_ROOT / "src/network/BackendTrust.cpp"
CONFIG_SOURCE = FRAME_ROOT / "src/core/Config.cpp"

CERTIFICATE_PATTERN = re.compile(
    r"-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----"
)
BACKEND_PATTERN = re.compile(r'const char\* BASE_URL\s*=\s*"([^"]+)"')


def main() -> int:
    config = CONFIG_SOURCE.read_text(encoding="utf-8")
    match = BACKEND_PATTERN.search(config)
    if not match:
        raise SystemExit("TLS check: BASE_URL not found")

    origin = urlsplit(match.group(1))
    if (origin.scheme != "https" or not origin.hostname or origin.username or origin.password or origin.port not in (None, 443)):
        raise SystemExit("TLS check: backend must have a standard HTTPS origin")

    source = TRUST_SOURCE.read_text(encoding="utf-8")
    certs = CERTIFICATE_PATTERN.findall(source)
    if len(certs) != 2:
        raise SystemExit("TLS check: expected two embedded ISRG trust anchors")

    with tempfile.TemporaryDirectory() as tmpdir:
        bundle = Path(tmpdir) / "firmware-roots.pem"
        bundle.write_text("\n".join(certs) + "\n", encoding="ascii")
        host = origin.hostname

        cmd = [
            "openssl", "s_client",
            "-connect", f"{host}:443",
            "-servername", host,
            "-verify_hostname", host,
            "-verify_return_error",
            "-CAfile", str(bundle),
        ]
        try:
            checked = subprocess.run(
                cmd, input="", text=True, capture_output=True, timeout=20,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise SystemExit(f"TLS check: connection or openssl failed: {type(exc).__name__}") from exc

    transcript = checked.stdout + checked.stderr
    passed = (
        checked.returncode == 0
        and "Verification: OK" in transcript
        and "Verify return code: 0 (ok)" in transcript
    )
    if not passed:
        # Do not print cert contents or response bodies; no app tokens are used.
        print(f"TLS check failed for {host}: OpenSSL exit={checked.returncode}")
        print("Verification OK:", "Verification: OK" in transcript)
        print("Return code 0:", "Verify return code: 0 (ok)" in transcript)
        raise SystemExit(1)

    # Prove the test really checks the hostname rather than merely accepting
    # any certificate signed by the same root.
    wrong_host_cmd = cmd.copy()
    wrong_host_cmd[7] = "wrong-host.invalid"
    try:
        rejected = subprocess.run(
            wrong_host_cmd, input="", text=True, capture_output=True,
            timeout=20, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise SystemExit(f"TLS check: negative hostname probe unavailable: {type(exc).__name__}") from exc
    rejected_output = (rejected.stdout + rejected.stderr).lower()
    if rejected.returncode == 0 or "hostname mismatch" not in rejected_output:
        raise SystemExit("TLS check: invalid hostname did not produce a verified mismatch")

    print(f"TLS chain and hostname verified for {host} with firmware CA bundle.")
    print("Invalid hostname correctly rejected.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
