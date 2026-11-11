"""Pure1800 migration: explicit preserved daily images; original Flash stays backed up."""
import hashlib,struct
from qgf_rgb565 import normalize
FLASH_SIZE=0x1000000
LEGACY=(0x400000,0x500000,0x600000,0x800000,0xa00000,0xc00000)

def image(blob,slot):
 off=LEGACY[slot];p=blob[off:off+28]
 assert p[:9]==bytes.fromhex('00ff12000051474601'),'Missing QGF header'
 size,inv,w,h,n=struct.unpack_from('<IIHHH',p,9)
 assert size^inv==0xffffffff and w==h==128 and 1<=n<=63
 assert size<=(0x100000 if slot<2 else 0x200000)
 return normalize(bytes(blob[off:off+size]))

def plan(current,expected_original,new,selection=(1,2,3)):
 assert len(current)==len(expected_original)==FLASH_SIZE
 assert current[:0x1f0000]==expected_original[:0x1f0000],'Original1800 firmware mismatch'
 assert any(current[i:i+2]==b'\x12\x01' and current[i+8:i+12]==bytes.fromhex('5b9d0041') for i in range(0,len(new)-18)),'Original1800 descriptor missing'
 assert 0<len(new)<0x1f0000 and len(new)%4096==0
 assert any(new[i:i+2]==b'\x12\x01' and new[i+8:i+12]==bytes.fromhex('5b9d0041') for i in range(len(new)-18)),'New firmware is not Athena1800'
 assert len(selection)==3 and len(set(selection))==3 and all(isinstance(i,int) and 0<=i<6 for i in selection)
 pictures=[image(current,i) for i in selection]
 target=bytearray(current);target[:len(new)]=new
 for off,data in zip((0x400000,0x600000,0x800000),pictures):
  target[off:off+0x200000]=b'\xff'*0x200000;target[off:off+len(data)]=data
 # New pet storage and growth journal: built-in pet is used until first upload.
 target[0xa00000:0xe00000]=b'\xff'*0x400000
 assert target[len(new):0x400000]==current[len(new):0x400000]
 assert target[0xe00000:]==current[0xe00000:]
 sectors=[i for i in range(0,FLASH_SIZE,4096) if current[i:i+4096]!=target[i:i+4096]]
 assert all(i<len(new) or 0x400000<=i<0xe00000 for i in sectors)
 return bytes(target),sectors,dict(model='athena1800',image_sources=list(selection),image_sha256=[hashlib.sha256(b).hexdigest() for b in pictures],changed_sectors=len(sectors),configuration_preserved=True,unrelated_ranges_preserved=True,pet_uses_builtin=True)
