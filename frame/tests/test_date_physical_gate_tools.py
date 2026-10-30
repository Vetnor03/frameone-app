"""Offline only: physical aperture reference and recovery-file provenance QA.

Tests use fabricated local fixtures, NOT a previously booted/working backup.
NEVER treat a successful unit test as physical rollback verification.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[2]
RECOVERY=ROOT/"frame/tools/verify_firmware_recovery.py"
OVERLAY=ROOT/"frame/tools/generate_date_aperture_reference.py"


def imported(path,name):
    spec=importlib.util.spec_from_file_location(name,path)
    obj=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(obj)
    return obj


def example_manifest(backup,digest):
    return {
      "hardware":{"module":"ESP32-S3-WROOM-1-N16R8",
                  "flash_size_bytes":16777216},
      "image":{"kind":"esp32s3-full-merged",
               "local_path":str(backup),
               "offset":"0x0",
               "length_bytes":16777216,
               "working_version":"TEST-FIXTURE-NOT-REAL",
               "sha256":digest},
      "evidence":{"booted_on_matching_v4":False,
                  "working_boot_date":"2026-10-29",
                  "working_boot_record":"TEST FAKE BOOT RECORD",
                  "restore_rehearsed":False,
                  "restore_rehearsal_date":"2026-10-29",
                  "restore_rehearsal_record":"TEST FAKE REHEARSAL"}
    }


def make_fake_bin(tmp_path):
    image=tmp_path/"FAKE-not-an-actual-firmware.bin"
    with image.open("wb") as f:
        # Sparse file, correct 16 MiB length and syntax markers ONLY.
        # It is not a valid ESP image and MUST NEVER be flashed.
        f.seek(16777216-1)
        f.write(b"\0")
        f.seek(0)
        f.write(b"\xe9")
        f.seek(0x8000)
        f.write(b"\xaa\x50")
        f.seek(0x10000)
        f.write(b"\xe9")
    digest=hashlib.sha256(image.read_bytes()).hexdigest()
    return image,digest


def test_rollback_missing_file_refuses_to_approve(tmp_path):
    checker=imported(RECOVERY,"recovery_missing")
    manifest=example_manifest(tmp_path/"no-such-file.bin","a"*64)
    p=tmp_path/"manifest.json"
    p.write_text(json.dumps(manifest))
    outcome=checker.check_manifest(p)
    assert outcome["errors"]
    assert not outcome["metadata_passes"]
    assert not outcome["physical_restore_verified_by_tool"]
    assert not outcome["flashing_performed"]


def test_fake_file_hash_passes_only_binary_syntax_not_manual_recovery(tmp_path):
    checker=imported(RECOVERY,"recovery_fake")
    backup,digest=make_fake_bin(tmp_path)
    data=example_manifest(backup,digest)
    p=tmp_path/"manifest.json"
    p.write_text(json.dumps(data))
    state=checker.check_manifest(p)
    assert state["binary_verified"] and state["checks"]["sha256_matches_manifest"]
    assert state["checks"]["partition_table_magic"]
    assert not state["metadata_passes"]
    assert not state["manual_evidence_complete"]
    assert state["errors"]
    # Simulate what happens when a user supplies manual attestation:
    # tool checks completeness but cannot verify if the claims are true.
    data["evidence"]["booted_on_matching_v4"]=True
    data["evidence"]["restore_rehearsed"]=True
    p.write_text(json.dumps(data))
    confirmed=checker.check_manifest(p)
    assert confirmed["metadata_passes"]
    assert confirmed["manual_evidence_complete"]
    assert confirmed["metadata_only"]
    assert not confirmed["physical_restore_verified_by_tool"]
    assert not confirmed["flashing_performed"]
    cli=subprocess.run([sys.executable,str(RECOVERY),"--manifest",str(p)],
        text=True,capture_output=True,timeout=20)
    assert cli.returncode==0,cli.stderr
    assert "NOT FLASH AUTHORIZATION" in cli.stdout


def test_hash_mismatch_and_incorrect_partition_never_pass(tmp_path):
    checker=imported(RECOVERY,"recovery_corrupt")
    backup,digest=make_fake_bin(tmp_path)
    wrong=example_manifest(backup,"0"*64)
    p=tmp_path/"manifest.json"
    p.write_text(json.dumps(wrong))
    assert any("SHA256" in err for err in checker.check_manifest(p)["errors"])
    with backup.open("r+b") as f:
        f.seek(0x8000)
        f.write(b"\0\0")
    fixed=example_manifest(backup,hashlib.sha256(backup.read_bytes()).hexdigest())
    p.write_text(json.dumps(fixed))
    state=checker.check_manifest(p)
    assert not state["binary_verified"]
    assert not state["checks"]["partition_table_magic"]
    assert any("partition" in err for err in state["errors"])


def test_recovery_rejects_app_only_or_impossible_device(tmp_path):
    checker=imported(RECOVERY,"recovery_wrong")
    backup,digest=make_fake_bin(tmp_path)
    bad=example_manifest(backup,digest)
    bad["image"]["kind"]="app-only"
    bad["hardware"]["flash_size_bytes"]=4*1024*1024
    manifest=tmp_path/"manifest.json"
    manifest.write_text(json.dumps(bad))
    errors=checker.check_manifest(manifest)["errors"]
    assert any("merged" in error for error in errors)
    assert any("16 MiB" in error for error in errors)


def test_aperture_reference_reads_generated_device_policy(tmp_path):
    overlay=imported(OVERLAY,"date_overlay")
    dims=overlay.policy_dimensions(
        (ROOT/"frame/src/display/DateRolePolicy.generated.h").read_text())
    assert tuple(dims[k] for k in
      ("PANEL_WIDTH","PANEL_HEIGHT","MATTE_X","MATTE_Y",
       "MATTE_WIDTH","MATTE_HEIGHT"))==(800,480,58,39,680,436)
    svg=tmp_path/"date-aperture.svg"
    report=overlay.generate(svg)
    assert not report["hardware_verified"]
    assert not report["flashing_performed"]
    source=svg.read_text()
    assert 'viewBox="0 0 800 480"' in source
    assert 'x="58" y="39" width="680" height="436"' in source
    assert source.count('stroke-dasharray="5,4"')==6
    assert "NOT A FLASH IMAGE" in source
    assert "NOT physically verified" in source
    assert len(re.findall(r'<path d="M ',source))==4
    # A policy edit MUST alter the reference instead of silently assuming
    # the old 680x436 aperture in an independent calibration utility.
    new_policy=(ROOT/"frame/src/display/DateRolePolicy.generated.h").read_text()
    changed=new_policy.replace("MATTE_X = 58;","MATTE_X = 48;")
    assert overlay.policy_dimensions(changed)["MATTE_X"]==48
