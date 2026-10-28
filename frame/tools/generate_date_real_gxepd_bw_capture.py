#!/usr/bin/env python3
"""Run ACTUAL unmodified GxEPD2_BW v1.6.4 class in a host C++ harness.

Mock ONLY its Adafruit_GFX base (no glyph rendering) and T7/SPI transport.
Feed real ModuleDate.cpp host-captured pixel PGM into real BW::drawPixel,
firstPage, nextPage; compare transferred actual BW bytes to the independently
verified packed host oracle. This is NOT a physical display or real T7 driver.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
from urllib.request import urlopen

from generate_date_native_painter_capture import compile_native, capture, cases
from generate_date_gxepd_packed_evidence import pack_independent_from_pgm

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/"frame/tests/driver_capture/real_gxepd2_bw_transfer_cli.cpp"
STUBS=ROOT/"frame/tests/driver_capture/stubs"
PINNED_URL=("https://raw.githubusercontent.com/ZinggJM/GxEPD2/"
            "1.6.4/src/GxEPD2_BW.h")
PINNED_GIT_BLOB_SHA1="10140475964878a5249506005e31dee8a93ac078"


def pinned_header_bytes()->bytes:
    with urlopen(PINNED_URL,timeout=25) as response:
        data=response.read()
    # Check actual Git object bytes, not just tag name or HTTP status.
    git_blob=hashlib.sha1(
        b"blob "+str(len(data)).encode("ascii")+b"\0"+data
    ).hexdigest()
    if git_blob!=PINNED_GIT_BLOB_SHA1:
        raise RuntimeError("Unexpected upstream GxEPD2_BW header Git blob "+
                           git_blob)
    return data


def compile_driver(binary:Path,source_dir:Path):
    source_dir.mkdir(parents=True,exist_ok=True)
    (source_dir/"GxEPD2_BW.h").write_bytes(pinned_header_bytes())
    cmd=["g++","-std=c++11","-O1","-Wall","-Wextra","-Werror",
         # The ORIGINAL upstream header has a legal-but-pedantic extra ';'
         # after _swap_ (v1.6.4 line 724); do not patch its bytes.
         "-pedantic","-Wno-error=pedantic","-I",str(source_dir),"-I",str(STUBS),
         str(SOURCE),"-o",str(binary)]
    build=subprocess.run(cmd,cwd=ROOT,text=True,capture_output=True,timeout=75)
    if build.returncode:
        raise RuntimeError("Unmodified pinned GxEPD2_BW failed to compile:\n"+
                           build.stderr[-12000:])
    return binary


def generate(output:Path):
    output.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="real_gxepd2_bw_host_") as folder:
        temp=Path(folder)
        upstream=compile_driver(temp/"gxepd2_bw_capture",temp/"original_upstream")
        native=compile_native(temp/"native_date_capture")
        records=[]
        for index,item in enumerate(cases()):
            pgm=temp/(str(index)+".pgm")
            native_result=capture(native,item,pgm)
            actual_oracle=pack_independent_from_pgm(pgm.read_bytes())
            # The existing shim's separately generated packed buffer is a
            # SECOND reference, but oracle originates from PGM independently.
            shim_bytes=Path(str(pgm)+".packed.bin").read_bytes()
            assert actual_oracle==shim_bytes
            incoming=temp/(str(index)+".expected.bin")
            incoming.write_bytes(actual_oracle)
            out=output/("case-"+str(index)+"-real-gxepd2-bw-host.bin")
            run=subprocess.run(
                [str(upstream),str(pgm),str(incoming),str(out)],
                cwd=ROOT,capture_output=True,text=True,timeout=35)
            if run.returncode:
                raise RuntimeError("Original GxEPD2_BW failed case "+
                                   item["name"]+": "+run.stderr+
                                   "\n"+run.stdout)
            status=json.loads(run.stdout)
            raw=out.read_bytes()
            assert len(raw)==48000
            assert raw==actual_oracle
            assert status["realGxEPD2BWClassExecuted"] is True
            assert status["differingBytes"]==0
            records.append(dict(
                name=item["name"],
                admitted=native_result["admitted"],
                nativePixelHash=native_result["hash"],
                realGxEPD2BWClassExecuted=True,
                mockUnderlying750T7=True,realAdafruitGFXRendered=False,
                panelTested=False,
                outputFile=out.name,
                sha256=hashlib.sha256(raw).hexdigest(),
                transferBytes=len(raw),
                byteMismatches=status["differingBytes"],
                fullWrites=status["fullWrites"],
                refreshes=status["refreshes"],
                repeatWrites=status["repeatWrites"],
                powerOffs=status["powerOffs"]))
    manifest=dict(
        nativePainter="frame/src/modules/ModuleDate.cpp",
        actualDriverHeader="GxEPD2_BW.h v1.6.4 (byte-for-byte from upstream)",
        upstreamGitBlobSHA1=PINNED_GIT_BLOB_SHA1,
        actualGxEPD2BWClassExecuted=True,
        actualAdafruitGFXClassExecuted=False,
        actualT7PanelClassExecuted=False,
        actualSPIOrPhysicalDisplay=False,
        physicalReadabilityApproved=False,
        flashed=False,
        panelModel="GxEPD2_750_T7 compatible mock 800x480",
        cases=records)
    (output/"manifest.json").write_text(
        json.dumps(manifest,indent=2,ensure_ascii=False)+"\n",
        encoding="utf-8")
    return manifest


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    result=generate(args.output)
    print(json.dumps({
        "cases":len(result["cases"]),
        "admitted":sum(x["admitted"] for x in result["cases"]),
        "transferBytesEach":48000,
        "driverByteMismatches":sum(x["byteMismatches"] for x in result["cases"]),
        "unmodifiedGxEPD2BWExecuted":result["actualGxEPD2BWClassExecuted"],
        "physicalPanelTested":result["actualSPIOrPhysicalDisplay"]}))
