"""Real Gregorian calendar grid preflight, independent of time zone.

This tests exact legacy geometry eligibility before GxEPD calls; an unchanged
legacy renderer still paints actual dates/today/holiday dots under opt-in.
"""
import datetime
import itertools
from pathlib import Path
import subprocess

ROOT=Path(__file__).resolve().parents[2]
SRC=ROOT/"frame/tests/helpers/date_month_grid_cli.cpp"
HEADER=ROOT/"frame/src/display/DateMonthGridPlan.h"

def test_month_grid_preflight_all_gregorian_months_and_matte_edges(tmp_path):
    exe=tmp_path/"month_grid"
    p=subprocess.run(["g++","-std=c++11","-Wall","-Wextra","-pedantic",
      "-Werror","-I",str(ROOT/"frame/src/display"),str(SRC),"-o",str(exe)],
      cwd=ROOT,capture_output=True,text=True,timeout=25)
    assert p.returncode==0,p.stderr

    # Current and next-month windows, December rollover, all leap types;
    # 2200/2300/2400 plus invalid area/month/year edge cases.
    years=list(range(1900,2101))+[2200,2300,2400,9999]
    areas=[(58,39,680,436,1,1,1),(80,80,300,240,1,1,1),
           (100,90,190,130,0,1,1),(100,90,160,100,0,0,0),
           (10,10,700,460,0,0,0),(100,100,100,80,0,0,0)]
    records=[(*a[:4],year,month0,*a[4:])
             for year,month0,a in itertools.product(years,range(12),areas)]
    records += [(58,39,680,436,1899,0,1,1,1),
                (58,39,680,436,2026,-1,1,1,1),
                (58,39,680,436,2026,12,1,1,1),
                (58,39,680,436,10000,0,1,1,1)]
    data="".join(" ".join(map(str,row))+"\n" for row in records)
    p=subprocess.run([str(exe)],cwd=ROOT,input=data,capture_output=True,
                     text=True,check=True,timeout=35)
    rows=p.stdout.splitlines()
    assert len(rows)==len(records)
    valid=0
    for row,output in zip(records,rows):
        x,y,w,h,year,month,title,dow,weeks=row
        if output=="fallback":
            assert x<58 or y<39 or x+w>738 or y+h>475 or w<154 or h<92 or (
                year<1900 or year>9999 or month<0 or month>11) or (
                weeks and w<190) or (title and h<146) or (
                dow and h<112)
            continue
        valid+=1
        vals=list(map(int,output.split(",")))
        assert len(vals)==13
        first,dim,nrows,cw,ch,bx,by,bw,bh,gridtop,dowx,ny,nm=vals
        assert first==datetime.date(year,month+1,1).weekday()
        if month==11 and year==9999:
            assert (ny,nm)==(0,-1)
        else:
            assert (ny,nm)==(year+(month==11),(month+1)%12)
        nextmonth=(datetime.date(year,month+1,1).replace(day=28)+
                   datetime.timedelta(days=4)).replace(day=1) if year<9999 else None
        actualDim=(datetime.date(year+1,1,1)-datetime.date(year,12,1)).days if month==11 and year<9999 else (
            (datetime.date(year,month+2,1)-datetime.date(year,month+1,1)).days if month<11 else 31)
        assert dim==actualDim
        assert nrows==max(4,min(6,(first+dim+6)//7))
        assert cw>=9 and ch>=10
        assert x<=bx and y<=by and bx+bw<=x+w and by+bh<=y+h
        assert by<=gridtop and gridtop+nrows*ch<=by+bh
        assert bx<=dowx<=bx+bw
    assert valid>1000

def test_preflight_source_does_not_draw_or_touch_surf():
    s=HEADER.read_text(encoding="utf-8")
    assert "drawMonthCalendar" in s  # referenced as documented legacy contract
    for banned in ("DisplayCore::","drawPixel(","setCursor(","colSpan","rowSpan",
                   "ModuleSurf","fillRect("):
        assert banned not in s
    assert "return nextYear<=DateRolePolicy::CONTEXT_YEAR_MAX" in s
