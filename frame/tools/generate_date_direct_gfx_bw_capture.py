#!/usr/bin/env python3
"""Unmodified ModuleDate.cpp -> Adafruit_GFX 1.12.6 -> GxEPD2_BW 1.6.4.

Original GFX draws each glyph/line/circle DIRECTLY to BW::drawPixel.
The original BW internal buffer is sent to a mock T7 (NO SPI/panel).
Compare with earlier host raster *without assuming equality*. Every
difference remains a reportable QA finding, never silently green pixel parity.
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
from generate_date_real_gxepd_bw_capture import (
    PINNED_GIT_BLOB_SHA1, pinned_header_bytes,
)

ROOT=Path(__file__).resolve().parents[2]
FRAME=ROOT/"frame"
HOST=FRAME/"tests/driver_capture"
INTEG=HOST/"integration"
BASESTUB=HOST/"stubs"
NATIVESTUB=FRAME/"tests/native_capture/include"
CLI=HOST/"direct_gfx_bw_date_cli.cpp"
ADAFRUIT_FILES={
    "Adafruit_GFX.h": "dd9dc0dcae8991307c88f6ae6a7038b8e76f1431",
    "Adafruit_GFX.cpp": "ae26bf118cf8dbe8e48c9ee47d680314f739320a",
    "gfxfont.h": "175bad637ac214d8495a16758ded61b76ba324ff",
    "glcdfont.c": "535da3a396867b55e88dcee7c806ec83f43bd9f3",
}

def checked_blob(name:str,sha:str)->bytes:
    url="https://raw.githubusercontent.com/adafruit/Adafruit-GFX-Library/1.12.6/"+name
    with urlopen(url,timeout=30) as response:
        data=response.read()
    blob=hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()
    if blob!=sha:raise RuntimeError(name+" pinned Git blob mismatch: "+blob)
    return data

def compile_original_chain(executable:Path,upstream:Path,source:Path=CLI):
    upstream.mkdir(parents=True,exist_ok=True)
    (upstream/"GxEPD2_BW.h").write_bytes(pinned_header_bytes())
    for name,sha in ADAFRUIT_FILES.items():
        (upstream/name).write_bytes(checked_blob(name,sha))
    flags=["g++","-std=c++11","-DARDUINO=100","-O1","-Wall","-Wextra",
           "-Werror","-pedantic",
           # Original GxEPD2 v1.6.4 has an extra, harmless ';' at line 724.
           "-Wno-error=pedantic",
           "-Wno-error=unused-function","-Wno-error=format-truncation",
           "-DREMIND_DATE_ROLE_PREVIEW_ENABLED=1",
           "-DREMIND_DATE_EDITORIAL_PREVIEW_ENABLED=1"]
    includes=[
        INTEG,upstream,BASESTUB,NATIVESTUB,
        FRAME/"tests/native_capture",
        FRAME/"src/modules",FRAME/"src/display",
        FRAME/"src/core",FRAME/"src/assets/fonts",
    ]
    source=[
        source,upstream/"Adafruit_GFX.cpp",
        FRAME/"src/display/DateEditorialF2Adapter.cpp",
        FRAME/"src/display/DateF2InkAdapter.cpp",
        FRAME/"src/display/EditorialText.cpp",
        FRAME/"src/display/FrameText.cpp",
        FRAME/"src/assets/fonts/RemindEditorialFonts.cpp",
    ]
    cmd=flags+sum((["-I",str(p)] for p in includes),[])+list(map(str,source))+[
        "-o",str(executable)
    ]
    result=subprocess.run(cmd,cwd=ROOT,capture_output=True,text=True,timeout=150)
    if result.returncode:
        raise RuntimeError("Original GFX+BW Date compilation failed:\n"+
                           result.stderr[-16000:])
    return executable

def generate(output:Path):
    output.mkdir(parents=True,exist_ok=True)
    manifest=[]
    with tempfile.TemporaryDirectory(prefix="full_gfx_bw_date_") as dirname:
        tmp=Path(dirname)
        gfx=compile_original_chain(tmp/"actual-gfx-bw",tmp/"pinned")
        old=compile_native(tmp/"previous-native-capture")
        for i,fixture in enumerate(cases()):
            reference=tmp/(str(i)+".pgm")
            previous=capture(old,fixture,reference)
            expected=pack_independent_from_pgm(reference.read_bytes())
            assert previous["admitted"],("previous editorial rejected",fixture)
            path=tmp/(str(i)+".expected.bin")
            path.write_bytes(expected)
            out=output/("case-"+str(i)+"-actual-gfx-bw.bin")
            args=[str(gfx),str(out),str(path)]+[
                str(fixture[k]) for k in (
                    "year","month0","day","x","y","w","h","dark","holiday")]
            process=subprocess.run(args,cwd=ROOT,capture_output=True,
                                   text=True,timeout=40)
            if process.returncode:
                raise RuntimeError(fixture["name"]+" direct paint failed:\n"+
                                   process.stderr[-9000:]+"\n"+process.stdout)
            result=json.loads(process.stdout)
            actual=out.read_bytes()
            assert len(actual)==len(expected)==48000
            assert result["realModuleDate"] is True
            assert result["realAdafruitGFX"] is True
            assert result["realGxEPD2BW"] is True
            assert result["realPanel"] is False
            assert result["editorialAdmitted"] is True
            assert result["mismatchBits"]==sum(
                (x^y).bit_count() for x,y in zip(actual,expected)
            ),"reported differences do not match raw output"
            # Save the prior emulator side by side, for precise diff tools.
            oldfile=output/("case-"+str(i)+"-previous-host.bin")
            oldfile.write_bytes(expected)
            manifest.append(dict(name=fixture["name"],fixture=fixture,
                admitted=result["editorialAdmitted"],
                realGFXAndBWExecuted=True,realPanelTested=False,
                file=out.name,sha256=hashlib.sha256(actual).hexdigest(),
                priorHostFile=oldfile.name,
                previousHostSha256=hashlib.sha256(expected).hexdigest(),
                mismatchBits=result["mismatchBits"],
                mismatchBounds=result["mismatchBounds"],
                inkInside=result["inkInside"],
                outOfCell=result["inkOutside"],
                outsideMatte=result["outsideMatte"],
                fullWrites=result["fullWrites"],
                refreshes=result["refreshes"]))
    report=dict(
        actualProductionDateCpp=True,
        actualAdafruitGFXCpp=True,
        actualGxEPD2BWHeader=True,
        mockT7Transport=True,
        actualGxEPD2_750_T7=False,
        realSPI=False,realPanel=False,flashed=False,
        physicalReadabilityApproved=False,
        originalGfxVersion="1.12.6",
        originalGFXSourceGitBlobs=ADAFRUIT_FILES,
        originalGxEPD2Version="1.6.4",
        originalGxEPD2HeaderBlob=PINNED_GIT_BLOB_SHA1,
        changedPixelsAreFindings=True,
        cases=manifest)
    (output/"manifest.json").write_text(
        json.dumps(report,indent=2,ensure_ascii=False)+"\n",
        encoding="utf-8")
    return report

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    report=generate(args.output)
    print(json.dumps(dict(
        cases=len(report["cases"]),
        admitted=sum(c["admitted"] for c in report["cases"]),
        mismatchBits=sum(c["mismatchBits"] for c in report["cases"]),
        realAdafruitGFXCpp=True,realGxEPD2BW=True,realPanel=False)))
