"""GxEPD2_BW-style 1-bit byte/page packing *model* (NOT driver capture).

Based on GxEPD2_BW's rotation=0 drawPixel addressing and public page loop:
row-major, MSB-first, bit=1 paper/WHITE, bit=0 ink/BLACK.
This byte-packing model is NOT compiled upstream GxEPD2 v1.6.4 and must
never be reported as a real panel-controller buffer or SPI capture.
"""
from __future__ import annotations
from pathlib import Path

WIDTH=800
HEIGHT=480
PGM_HEADER=b"P5\n800 480\n255\n"

def pgm_pixels(path:Path)->bytes:
    content=path.read_bytes()
    if not content.startswith(PGM_HEADER):
        raise ValueError("Wrong PGM header: expected 800x480 8bit image")
    pixels=content[len(PGM_HEADER):]
    if len(pixels)!=WIDTH*HEIGHT or set(pixels)-{0,255}:
        raise ValueError("Capture pixels must be exactly 800x480 1-bit BW")
    return pixels

def aligned_window(x:int,y:int,w:int,h:int):
    """GxEPD2_BW::setPartialWindow() rounds horizontal boundaries to 8px."""
    if w<=0 or h<=0 or x<0 or y<0 or x+w>WIDTH or y+h>HEIGHT:
        raise ValueError("Invalid panel window")
    ax=x-(x%8)
    right=(x+w+7)//8*8
    return ax,y,right-ax,h

def pack_window(pixels:bytes,x:int,y:int,w:int,h:int,page_height:int):
    """Return (aligned geometry, list of (local pageY, MSB-first bytes))."""
    if len(pixels)!=WIDTH*HEIGHT:
        raise ValueError("Unexpected full 800x480 host raster")
    if page_height<1:
        raise ValueError("page height must be positive")
    ax,ay,aw,ah=aligned_window(x,y,w,h)
    pages=[]
    row_bytes=aw//8
    for offset in range(0,ah,page_height):
        page_h=min(page_height,ah-offset)
        buf=bytearray(row_bytes*page_h)
        for row in range(page_h):
            raw_start=(ay+offset+row)*WIDTH+ax
            dest=row*row_bytes
            for x8 in range(row_bytes):
                byte=0
                for bit in range(8):
                    pixel=pixels[raw_start+x8*8+bit]
                    if pixel==255: # white / paper is 1, black ink is 0
                        byte|=0x80>>bit
                    elif pixel!=0:
                        raise ValueError("Nonbinary pixel in host image")
                buf[dest+x8]=byte
        pages.append((offset,bytes(buf)))
    return (ax,ay,aw,ah),pages

def unpack_window(geometry,pages):
    """Decode byte model in the SAME coordinate space; invert bit to ink."""
    ax,ay,aw,ah=geometry
    if ax<0 or ay<0 or aw%8 or ah<1 or ax+aw>WIDTH or ay+ah>HEIGHT:
        raise ValueError("Invalid aligned window")
    out=bytearray(aw*ah)
    covered=bytearray(ah)
    for start,packed in pages:
        if start<0 or len(packed)%(aw//8):
            raise ValueError("Malformed page")
        height=len(packed)//(aw//8)
        if start+height>ah:
            raise ValueError("Page overlaps end")
        for row in range(height):
            if covered[start+row]:
                raise ValueError("Overlapping page")
            covered[start+row]=1
            src=row*(aw//8)
            for x8 in range(aw//8):
                byte=packed[src+x8]
                for bit in range(8):
                    # Return PGM white=255, black=0
                    out[(start+row)*aw+x8*8+bit]=255 if (
                        byte & (0x80>>bit)) else 0
    if not all(covered):
        raise ValueError("Pages leave gaps")
    return bytes(out)

def crop_window(pixels:bytes,geometry):
    ax,ay,aw,ah=geometry
    return b"".join(pixels[(ay+yy)*WIDTH+ax:(ay+yy)*WIDTH+ax+aw]
                    for yy in range(ah))

def audit_capture(pixels:bytes,x=0,y=0,w=800,h=480):
    """Roundtrip full 1-bit screen and 16/64/480 high paged subsets."""
    hashes={}
    for pagesize in (16,64,480):
        geometry,pages=pack_window(pixels,x,y,w,h,pagesize)
        if unpack_window(geometry,pages)!=crop_window(pixels,geometry):
            raise AssertionError("MSB-first GxEPD2 page model differs from ink")
        hashes[pagesize]=b"".join(page for _,page in pages)
    if hashes[16]!=hashes[64] or hashes[64]!=hashes[480]:
        raise AssertionError("GxEPD2 page-height changed packed pixels")
    return dict(pageCount={k:(h+k-1)//k for k in hashes},
                payloadBytes=len(hashes[16]),byteIdentical=True)
