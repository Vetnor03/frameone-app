"""Structural audit of a private, offline ESP32-S3 16MiB flash image.

Only reads bytes. Never connects to hardware, decrypts, changes or flashes.
ESP-IDF partition entries are 32 bytes; image headers/segments use the ESP
image format. This is NOT signature verification, eFuse inspection, a working
boot proof, or proof of hardware restore.
"""
import hashlib
import struct

FLASH_SIZE=16*1024*1024
TABLE_OFFSET=0x8000
TABLE_SIZE=0x1000
IMAGE_MAGIC=0xE9
PART_MAGIC=b"\xaa\x50"
MD5_MAGIC=b"\xeb\xeb"
ESP32S3_IMAGE_CHIP_ID=9


def check_image(data,offset,limit,kind):
    """Parse actual segments, checksum and optional SHA-256 footer."""
    errors=[]
    if offset<0 or limit>len(data) or offset+24>limit:
        return [f"{kind}: image truncated at header"]
    header=data[offset:offset+24]
    if header[0]!=IMAGE_MAGIC:
        return [f"{kind}: invalid ESP image magic"]
    count=header[1]
    if count<1 or count>16:
        errors.append(f"{kind}: impossible segment count {count}")
    if header[2]>3:
        errors.append(f"{kind}: invalid flash mode")
    chip_id=struct.unpack_from("<H",header,12)[0]
    if chip_id!=ESP32S3_IMAGE_CHIP_ID:
        errors.append(f"{kind}: chip ID {chip_id}, expected ESP32-S3 (9)")
    has_hash=header[23]
    if has_hash not in (0,1):
        errors.append(f"{kind}: invalid image SHA256-footer flag")
    if kind=="bootloader" and header[3]>>4!=4:
        errors.append(f"{kind}: flash size field is not 16 MiB")
    if errors:return errors
    pos=offset+24
    checksum=0xEF
    for segment in range(count):
        if pos+8>limit:
            return [f"{kind}: segment {segment} header truncated"]
        load_addr,size=struct.unpack_from("<II",data,pos)
        pos+=8
        if size==0 or size>limit-pos:
            return [f"{kind}: segment {segment} length invalid or beyond region"]
        # Segment bytes are arbitrary data. XOR every byte with 0xEF.
        for byte in data[pos:pos+size]:
            checksum^=byte
        pos+=size
    # Footer is the LAST byte of a 16-byte-aligned image chunk.
    # Even when segment data itself ends on an alignment boundary, the
    # checksum needs its own next byte (15 pad bytes + checksum).
    footer=((pos-offset+16)//16)*16+offset-1
    if footer>=limit:
        return [f"{kind}: missing aligned checksum"]
    if any(byte!=0 for byte in data[pos:footer]):
        errors.append(f"{kind}: nonzero image padding before checksum")
    if data[footer]!=checksum:
        errors.append(f"{kind}: ESP image segment checksum mismatch")
    if has_hash:
        if footer+1+32>limit:
            errors.append(f"{kind}: missing appended SHA256 footer")
        elif hashlib.sha256(data[offset:footer+1]).digest()!=data[footer+1:footer+33]:
            errors.append(f"{kind}: ESP image appended SHA256 mismatch")
    return errors


def read_partition_table(data):
    errors=[]
    entries=[]
    table=data[TABLE_OFFSET:TABLE_OFFSET+TABLE_SIZE]
    if len(table)!=TABLE_SIZE:
        return [],["Partition table truncated"]
    digest=hashlib.md5()
    done=False
    has_md5=False
    for pos in range(0,TABLE_SIZE,32):
        block=table[pos:pos+32]
        if block==b"\xff"*32:
            done=True
            break
        if block[:2]==MD5_MAGIC:
            has_md5=True
            if block[16:32]!=digest.digest():
                errors.append("Partition table MD5 mismatch")
            if block[2:16]!=b"\xff"*14:
                errors.append("Invalid partition MD5 record structure")
            continue
        if block[:2]!=PART_MAGIC:
            errors.append(f"Invalid partition entry magic at 0x{TABLE_OFFSET+pos:x}")
            break
        if has_md5:
            errors.append("Partition entry appears after MD5 footer")
            break
        digest.update(block)
        part_type,part_subtype,offset,size,label,flags=struct.unpack_from("<BBII16sI",block,2)
        if offset<TABLE_OFFSET+TABLE_SIZE or size==0 or offset+size>FLASH_SIZE:
            errors.append("Partition offsets/lengths exceed available flash or overlap table")
        if part_type==0 and (offset%0x10000 or size%0x1000):
            errors.append("App partition offset is not 64KiB aligned or size is not sector aligned")
        if part_type==1 and offset%0x1000:
            errors.append("Data partition offset is not 4KiB aligned")
        try:
            name=label.split(b"\x00",1)[0].decode("ascii")
        except UnicodeDecodeError:
            name="<invalid>"
            errors.append("Invalid non-ASCII partition name")
        if not name:errors.append("Empty partition label")
        entries.append(dict(name=name,kind=part_type,subtype=part_subtype,
                            offset=offset,size=size,flags=flags))
    if not done:errors.append("No end marker in partition table")
    if not entries:errors.append("No actual partitions in partition table")
    if not has_md5:errors.append("No partition table MD5, cannot verify table integrity")
    by_start=sorted(entries,key=lambda p:p["offset"])
    for prev,nxt in zip(by_start,by_start[1:]):
        if prev["offset"]+prev["size"]>nxt["offset"]:
            errors.append(f"Overlapping partitions: {prev['name']} / {nxt['name']}")
    if len({p["name"] for p in entries})!=len(entries):
        errors.append("Duplicate partition names")
    return entries,errors


def inspect_merged_image(data):
    errors=[]
    if len(data)!=FLASH_SIZE:
        return {"errors":["Not a complete 16MiB flash image"],"partitions":[]}
    entries,part_errors=read_partition_table(data)
    errors.extend(part_errors)
    errors.extend(check_image(data,0,TABLE_OFFSET,"bootloader"))
    apps=[p for p in entries if p["kind"]==0]
    if not apps:errors.append("No application partition found")
    valid_apps=[]
    erased_apps=[]
    for p in apps:
        start=p["offset"]
        if data[start:start+24]==b"\xff"*24:
            erased_apps.append(p["name"])
            continue
        err=check_image(data,start,start+p["size"],"app "+p["name"])
        if err:errors.extend(err)
        else:valid_apps.append(p["name"])
    if not valid_apps:errors.append("No structurally valid ESP32-S3 app image")
    return {
       "errors":errors,
       "partitions":[dict(name=p["name"],kind=p["kind"],subtype=p["subtype"],
                           offset_hex=hex(p["offset"]),size_bytes=p["size"])
                     for p in entries],
       "valid_app_partitions":valid_apps,
       "erased_app_partitions":erased_apps,
       "structural_pass":not errors,
       "note":"Structure, chip ID and checksums only; cannot prove image boots, "
              "matches eFuses, or restores safely."
    }
