"""Compare every real RLE frame with the pinned QMK decoder; synthetic delta tests."""
from pathlib import Path
import sys,json,subprocess,tempfile,struct
from qgf_rgb565 import decode,encode,normalize,rle
root=Path(__file__).resolve().parents[2];boardroot=Path(sys.argv[1])
backup=Path(json.loads((root/'.artifacts/athena1800/original-backup.json').read_text())['backup_directory'])
s=(boardroot/'quantum/painter/qp_draw_codec.c').read_text();a=s.index('static inline int16_t qp_drawimage_byte_rle_decoder');b=s.index('bool qp_internal_pixel_appender',a)
harness='''#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
enum {MARKER_BYTE,NON_REPEATING_RUN,REPEATING_RUN};
typedef struct {FILE *src_stream;int16_t curr;struct {int mode;unsigned remain;} rle;} qp_internal_byte_input_state_t;
int qp_stream_get(FILE *f){int n=fgetc(f);if(n<0)abort();return n;}
'''+s[a:b]+'''
int main(int argc,char **argv){if(argc!=3)return 1;FILE *f=fopen(argv[1],"rb");if(!f)return 2;qp_internal_byte_input_state_t state={.src_stream=f};for(unsigned i=0;i<strtoul(argv[2],0,10);i++)putchar(qp_drawimage_byte_rle_decoder(&state));fclose(f);return 0;}
'''
checked=0
with tempfile.TemporaryDirectory() as td:
 td=Path(td);(td/'test.c').write_text(harness)
 subprocess.run(['cc','-std=c11','-Wall','-Wextra','-Werror','-fsanitize=undefined',str(td/'test.c'),'-o',str(td/'test')],check=True)
 for slot in range(4):
  data=(backup/f'legacy-slot-{slot}.qgf').read_bytes();frames,streams=decode(data)
  for compression,packed,raw in streams:
   if compression:
    (td/'stream').write_bytes(packed)
    actual=subprocess.check_output([str(td/'test'),str(td/'stream'),str(len(raw))]);assert actual==raw;checked+=1
  assert decode(normalize(data))[0]==frames
# Mixed literal/repeated stream, malformed bounds, and a one-pixel delta.
assert rle(bytes([3,5,129,8,9]),5)==bytes([5,5,5,8,9])
for data,size in [(b'\x00\x01',1),(b'\xff\x01',128),(b'\x03\x01',2)]:
 try:rle(data,size);raise RuntimeError('Malformed stream accepted')
 except AssertionError:pass
base=encode([(b'\0'*32768,80),(b'\0'*32768,170)])
off=struct.unpack_from('<I',base,32)[0];delta=bytes([2,253,6,0,0,8,2,0,255])+struct.pack('<H',170)+bytes([4,251,8,0,0])+struct.pack('<4H',17,29,17,29)+bytes([5,250,2,0,0,0xab,0xcd])
data=bytearray(base[:off]+delta);struct.pack_into('<II',data,9,len(data),len(data)^0xffffffff)
frames,_=decode(data);expected=bytearray(32768);expected[(29*128+17)*2:(29*128+17)*2+2]=b'\xab\xcd'
assert frames==[(b'\0'*32768,80),(bytes(expected),170)];assert decode(normalize(data))[0]==frames
print(f'PASS: {checked} actual compressed frames match pinned QMK decoder; original pixels/delays, delta composition and malformed bounds verified')
