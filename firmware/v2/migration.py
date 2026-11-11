"""Pure migration planner. No USB access or device mutations in this module."""
from pathlib import Path
import struct,hashlib
BASE=0x10000000
FLASH_SIZE=0x1000000

def decode_uf2(data):
    assert data and len(data)%512==0,'Invalid UF2 length'
    count=len(data)//512;out=bytearray()
    for i in range(count):
        h=struct.unpack_from('<8I',data,i*512)
        assert h==(0x0a324655,0x9e5d5157,0x2000,BASE+i*256,256,i,count,0xe48bff56),'Unexpected UF2 block'
        assert struct.unpack_from('<I',data,i*512+508)[0]==0x0ab16f30
        out+=data[i*512+32:i*512+288]
    out+=b'\xff'*((-len(out))%4096)
    assert len(out)<0x1f0000,'Firmware overlaps original settings'
    return bytes(out)

def qgf(data):
    assert len(data)>=28 and data[:9]==bytes([0,255,18,0,0,81,71,70,1]),'Invalid source animation'
    size,inverse,w,h,frames=struct.unpack_from('<IIHHH',data,9)
    assert size==(inverse^0xffffffff) and w==h==128 and 1<=frames<=63 and size==28+frames*32788 and size<=len(data)
    return data[:size]

def plan(current,v1,v2,pet):
    assert len(current)==FLASH_SIZE
    assert current[:len(v1)]==v1,'Connected keyboard is not the verified v1 r3 image; stop for review'
    assert len(pet)==6400 and pet[:10]==bytes([80,84,51,50,1,32,32,2,6,4])
    orbit=qgf(current[0xc00000:0xe00000]);qgf(current[0x600000:0x800000]);qgf(current[0x800000:0xa00000])
    target=bytearray(current);target[:len(v2)]=v2
    target[0x400000:0x600000]=b'\xff'*0x200000
    target[0x400000:0x400000+len(orbit)]=orbit
    target[0xa00000:0xe00000]=b'\xff'*0x400000
    target[0xa00000:0xa00000+len(pet)]=pet
    sectors=[i for i in range(0,FLASH_SIZE,4096) if current[i:i+4096]!=target[i:i+4096]]
    assert all(i<len(v2) or 0x400000<=i<0x600000 or 0xa00000<=i<0xe00000 for i in sectors)
    assert target[0x1f0000:0x200000]==current[0x1f0000:0x200000]
    assert target[0x600000:0xa00000]==current[0x600000:0xa00000]
    assert target[0xe00000:]==current[0xe00000:]
    return bytes(target),sectors,{'image1_source':'legacy GIF 5','image1_frames':struct.unpack_from('<H',orbit,21)[0],'image1_sha256':hashlib.sha256(orbit).hexdigest(),'image2_source':'legacy GIF 2 unchanged','image3_source':'legacy GIF 3 unchanged','pet_bytes':len(pet),'changed_sectors':len(sectors),'settings_preserved':True,'other_ranges_preserved':True}

def full_recovery_uf2(data):
    assert len(data)==FLASH_SIZE
    count=len(data)//256;out=bytearray(count*512)
    for i in range(count):
        struct.pack_into('<8I',out,i*512,0x0a324655,0x9e5d5157,0x2000,BASE+i*256,256,i,count,0xe48bff56)
        out[i*512+32:i*512+288]=data[i*256:(i+1)*256]
        struct.pack_into('<I',out,i*512+508,0x0ab16f30)
    return out
