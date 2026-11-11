"""Lossless QGF nativeRGB565/RLE/delta normalization using pinned QMK format.
Unsupported palette, transparency or malformed streams are rejected.
"""
import struct

def block(data,offset,kind):
 assert 0<=offset<=len(data)-5 and data[offset]==kind and data[offset+1]==(kind^255),'Invalid QGF block'
 n=int.from_bytes(data[offset+2:offset+5],'little');end=offset+5+n
 assert end<=len(data),'Truncated QGF block'
 return data[offset+5:end],end

def rle(data,expected):
 out=bytearray();i=0
 while i<len(data):
  marker=data[i];i+=1;assert marker!=0,'Zero RLE run'
  if marker<128:
   assert i<len(data);out+=data[i:i+1]*marker;i+=1
  else:
   n=marker-127;assert i+n<=len(data);out+=data[i:i+n];i+=n
  assert len(out)<=expected,'RLE output exceeds viewport'
 assert len(out)==expected,'RLE output shorter than viewport'
 return bytes(out)

def decode(data):
 header,end=block(data,0,0);assert len(header)==18 and header[:4]==b'QGF\1'
 size,inverse,w,h,n=struct.unpack_from('<IIHHH',header,4)
 assert size==len(data) and inverse==size^0xffffffff and w==h==128 and 1<=n<=63
 offsets,end=block(data,end,1);assert len(offsets)==n*4
 starts=struct.unpack('<'+'I'*n,offsets);assert starts[0]==end and list(starts)==sorted(set(starts))
 frame=bytearray(w*h*2);frames=[];streams=[]
 for index,start in enumerate(starts):
  desc,pos=block(data,start,2);assert len(desc)==6
  fmt,flags,compression,transparent,delay=struct.unpack('<4BH',desc)
  assert fmt==8 and flags in (0,2) and compression in (0,1) and delay>0,'Unsupported frame encoding'
  assert index>0 or flags==0,'First frame must be complete'
  left,top,right,bottom=0,0,w-1,h-1
  if flags==2:
   delta,pos=block(data,pos,4);assert len(delta)==8
   left,top,right,bottom=struct.unpack('<4H',delta)
   assert 0<=left<=right<w and 0<=top<=bottom<h
  packed,pos=block(data,pos,5);assert pos==(starts[index+1] if index+1<n else len(data))
  width=right-left+1;expected=width*(bottom-top+1)*2
  raw=rle(packed,expected) if compression else packed;assert len(raw)==expected
  streams.append((compression,packed,raw))
  for y in range(top,bottom+1):
   dest=(y*w+left)*2;src=(y-top)*width*2;frame[dest:dest+width*2]=raw[src:src+width*2]
  frames.append((bytes(frame),delay))
 return frames,streams

def encode(frames):
 n=len(frames);size=28+n*32788;out=bytearray(size)
 out[:9]=bytes.fromhex('00ff12000051474601');struct.pack_into('<IIHHH',out,9,size,size^0xffffffff,128,128,n)
 out[23:28]=bytes([1,254])+int(n*4).to_bytes(3,'little')
 for i,(pixels,delay) in enumerate(frames):
  assert len(pixels)==32768 and 0<delay<=65535
  off=28+n*4+i*32784;struct.pack_into('<I',out,28+4*i,off)
  out[off:off+11]=bytes([2,253,6,0,0,8,0,0,255])+struct.pack('<H',delay)
  out[off+11:off+16]=bytes([5,250,0,128,0]);out[off+16:off+32784]=pixels
 return bytes(out)

def normalize(data):
 frames,_=decode(data);result=encode(frames);assert decode(result)[0]==frames
 return result
