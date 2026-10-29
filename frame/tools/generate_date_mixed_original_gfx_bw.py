#!/usr/bin/env python3
"""Real C++ Date + Adafruit GFX 1.12.6 + GxEPD2_BW 1.6.4 mixed layouts.

All 11 previously established mixed layouts are checked in their actual 4x4
pixel geometry. ONLY editorial-admitted Date cells are rendered; other modules
and legacy Date are intentionally left blank. Never call this a whole-frame
multi-module preview or an e-paper panel capture.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import html
import json
import subprocess
import tempfile
from pathlib import Path

from generate_date_mixed_layout_review import scenarios, validate_cells, plans
from generate_date_native_painter_capture import compile_native, capture, pgm_to_png
from generate_date_direct_gfx_bw_capture import compile_original_chain
from generate_date_gxepd_packed_evidence import pack_independent_from_pgm

ROOT=Path(__file__).resolve().parents[2]
FRAME=ROOT/"frame"
MIXED_CLI=FRAME/"tests/driver_capture/mixed_gfx_bw_date_cli.cpp"
DATE_CLI=FRAME/"tests/driver_capture/direct_gfx_bw_date_cli.cpp"
WIDTH,HEIGHT=800,480
ROW_BYTES=WIDTH//8


def run_json(args,timeout=30):
    run=subprocess.run(list(map(str,args)),cwd=ROOT,text=True,
                       capture_output=True,timeout=timeout)
    if run.returncode:
        raise RuntimeError("C++ original-GFX scene failed: "+
                           " ".join(map(str,args[:2]))+"\n"+
                           run.stdout[-4000:]+"\n"+run.stderr[-4000:])
    return json.loads(run.stdout)


def compose_editorial(background_dark,individual_bytes):
    # Independently compose original GFX + BW single-slot byte streams.
    # Only editorial-admitted Date slots: blank elsewhere by design.
    result=bytearray([0x00 if background_dark else 0xFF]*48000)
    for raw in individual_bytes:
        assert len(raw)==48000
        for i,b in enumerate(raw):
            if background_dark:result[i]|=b # white ink on black paper
            else:result[i]&=b # black ink on white paper
    return bytes(result)


def bitmap_png(raw):
    assert len(raw)==48000
    pgm=bytearray(b"P5\n800 480\n255\n")
    for b in raw:
        pgm.extend(255 if b&(0x80>>i) else 0 for i in range(8))
    return pgm_to_png(bytes(pgm))


def generate(output:Path):
    output.mkdir(parents=True,exist_ok=True)
    scenes=scenarios()
    predicted=plans(scenes)
    report=[]
    with tempfile.TemporaryDirectory(prefix="mixed_original_gfx_bw_") as folder:
        tmp=Path(folder)
        upstream=tmp/"upstream"
        native=compile_native(tmp/"native")
        single=compile_original_chain(tmp/"actual_single",upstream,DATE_CLI)
        combined=compile_original_chain(tmp/"actual_mixed",upstream,MIXED_CLI)
        for si,scene in enumerate(scenes):
            validate_cells(scene["cells"])
            fact=scene["facts"]
            date_cells=[(j,c) for j,c in enumerate(scene["cells"])
                        if c["module"]=="date"]
            assert date_cells
            dark=1 if scene["theme"].lower()=="dark" else 0
            holiday=1 if fact.get("holidays") else 0
            inputs=[
                fact["year"],fact["month0"],fact["day"],dark,holiday
            ]
            source_admissions=[]
            native_admissions=[]
            singles=[]
            slots=[]
            original_comparison=[]
            for j,cell in date_cells:
                x,y,w,h=(cell[k] for k in ("x","y","w","h"))
                source_admissions.append(bool(predicted[si,j]["accepted"]))
                item=dict(name=f"{scene['name']} / Date {j}",
                          year=fact["year"],month0=fact["month0"],
                          day=fact["day"],x=x,y=y,w=w,h=h,
                          dark=dark,holiday=holiday)
                pgm=tmp/f"scene{si}-slot{j}.pgm"
                native_status=capture(native,item,pgm)
                accepted=bool(native_status["admitted"])
                native_admissions.append(accepted)
                if accepted:
                    expected=pack_independent_from_pgm(pgm.read_bytes())
                    reference=tmp/f"reference-{si}-{j}.bin"
                    reference.write_bytes(expected)
                    direct=tmp/f"single-{si}-{j}.bin"
                    actual=run_json([
                        single,direct,reference,
                        item["year"],item["month0"],item["day"],
                        x,y,w,h,dark,holiday
                    ])
                    raw=direct.read_bytes()
                    assert actual["editorialAdmitted"] is True
                    assert actual["inkOutside"]==0
                    assert actual["outsideMatte"]==0
                    assert len(raw)==48000
                    assert actual["mismatchBits"]==sum(
                        (u^v).bit_count() for u,v in zip(raw,expected))
                    singles.append(raw)
                    original_comparison.append(dict(
                        slot=j,ink=actual["inkInside"],
                        pixelDifferencesFromPriorHost=actual["mismatchBits"],
                        priorDifferenceBounds=actual["mismatchBounds"]))
                slots.append(dict(index=j,
                                  cell={k:cell[k] for k in ("x","y","w","h")},
                                  sourceAdmitted=source_admissions[-1],
                                  nativeCppAdmitted=accepted,
                                  legacyFallbackOmitted=not accepted))
            merged=output/f"scene-{si:02d}-date-only-original-gfx-bw.bin"
            args=[combined,merged,*inputs,len(date_cells)]
            for _,c in date_cells:
                args.extend(c[k] for k in ("x","y","w","h"))
            combined_status=run_json(args,timeout=35)
            assert combined_status["realModuleDateCpp"] is True
            assert combined_status["realAdafruitGFXCpp"] is True
            assert combined_status["realGxEPD2BW"] is True
            assert combined_status["realOtherModules"] is False
            assert combined_status["legacyFallbackPainted"] is False
            assert combined_status["slotAdmissions"]==native_admissions,(
                scene["name"],"native gate vs original driver admission",
                combined_status["slotAdmissions"],native_admissions)
            assert combined_status["inkOutsideAdmittedCells"]==0
            assert combined_status["inkOutsideMatte"]==0
            actual=merged.read_bytes()
            independently_merged=compose_editorial(dark,singles)
            assert len(actual)==48000==combined_status["transferBytes"]
            diff=sum((x^y).bit_count()
                     for x,y in zip(actual,independently_merged))
            if diff:
                raise AssertionError((scene["name"],
                   "native original GFX multi-slot composition changes pixels",
                   diff))
            png=output/f"scene-{si:02d}-date-only.png"
            png.write_bytes(bitmap_png(actual))
            report.append(dict(
                name=scene["name"],theme=scene["theme"],
                dates=len(date_cells),dateSlots=slots,
                sourceVsNativeAdmissionMismatches=sum(
                    a!=b for a,b in zip(source_admissions,native_admissions)),
                actualDriverAdmitted=sum(combined_status["slotAdmissions"]),
                skippedLegacyDates=sum(not x for x in native_admissions),
                nonDateCells=[dict(module=c["module"],x=c["x"],y=c["y"],
                      w=c["w"],h=c["h"]) for c in scene["cells"]
                      if c["module"]!="date"],
                actualOtherModuleRasterCaptured=False,
                individualOriginalGfxComparisons=original_comparison,
                originalGfxCombinedVsIndependentCompositionBitDifferences=diff,
                outOfDateSlots=combined_status["inkOutsideAdmittedCells"],
                outOfMatte=combined_status["inkOutsideMatte"],
                inkPixels=combined_status["paintedInk"],
                sourceBin=merged.name,sha256=hashlib.sha256(actual).hexdigest(),
                previewPng=png.name))
    summary=dict(
        proof="unmodified-ModuleDate-AdafruitGFX-GxEPD2BW-host-only",
        scenarioCount=len(report),
        dateSlotCount=sum(s["dates"] for s in report),
        admittedDateSlots=sum(s["actualDriverAdmitted"] for s in report),
        omittedLegacyDateSlots=sum(s["skippedLegacyDates"] for s in report),
        sourceVsNativeAdmissionMismatches=sum(
            s["sourceVsNativeAdmissionMismatches"] for s in report),
        realOtherModuleRenderersExecuted=False,
        actualPhysicalPanel=False,realT7Transport=False,realSPI=False,
        flashed=False,physical1to2mLegibilityApproved=False,
        dateOnlyComposite=True,
        scenarios=report)
    (output/"manifest.json").write_text(
        json.dumps(summary,indent=2,ensure_ascii=False)+"\n",
        encoding="utf-8")
    figures=[]
    for s in report:
        png=output/s["previewPng"]
        img=base64.b64encode(png.read_bytes()).decode("ascii")
        omitted=", ".join(c["module"] or "blank"
            for c in s["nonDateCells"]) or "none"
        figures.append(
            "<article><img alt='Date-only host composite' src='data:image/png;base64,"
            +img+"'><h3>"+html.escape(s["name"])+"</h3>"
            +f"<p>{s['actualDriverAdmitted']}/{s['dates']} editorial Dates. "
            +f"{s['skippedLegacyDates']} legacy fallback(s) OMITTED. "
            +f"Non-Date content NOT rendered: {html.escape(omitted)}."
            +"</p></article>")
    doc=("<!doctype html><html lang='en'><meta charset='utf-8'>"
       "<meta name='viewport' content='width=device-width,initial-scale=1'>"
       "<title>RE Date original GFX mixed host proof (NOT a full frame)</title>"
       "<style>body{font:15px system-ui;margin:24px;background:#efeee9;color:#242424}"
       "main{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px}"
       "article{background:white;border:1px solid #ccc;padding:12px;border-radius:10px}"
       "img{width:100%;image-rendering:pixelated;border:1px solid #aaa}"
       "h3{font-size:15px}p{font-size:12px;line-height:1.5}</style>"
       "<h1>11 mixed layouts: genuine C++ Date-only paint</h1>"
       "<p><strong>Not a physical GxEPD2_T7 panel image or a real full "
       "Weather/Surf/News/Reminders composition.</strong> Only C++-accepted "
       "editorial Date cells are painted with upstream Adafruit GFX and GxEPD2_BW. "
       "Legacy Date cells and all other modules are intentionally BLANK. "
       "This is QA evidence, not approval of 1–2 m readability.</p>"
       "<main>"+"".join(figures)+"</main></html>")
    (output/"review.html").write_text(doc,encoding="utf-8")
    return summary

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    result=generate(args.output)
    print(json.dumps({k:result[k] for k in (
        "scenarioCount","dateSlotCount","admittedDateSlots",
        "omittedLegacyDateSlots","sourceVsNativeAdmissionMismatches")},
        ensure_ascii=False))
