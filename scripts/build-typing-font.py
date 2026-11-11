"""Rasterize Inter v4.1, 3 sizes x 3 weights, 2-bit glyphs.
Usage: QMK-venv/python scripts/build-typing-font.py /path/to/InterVariable.ttf
Source: https://github.com/rsms/inter/tree/v4.1 ; license: licenses/inter-OFL.txt
"""
from PIL import Image,ImageFont,ImageDraw
from pathlib import Path
import sys,json,hashlib
header='// Rasterized Inter v4.1, SIL OFL 1.1; see licenses/inter-OFL.txt.\n#pragma once\n#include <stdint.h>\n'
variants=[];names=[]
for size in [14,18,22]:
 for weight in [400,700,850]:
  font=ImageFont.truetype(sys.argv[1],size);font.set_variation_by_axes([14,weight]);atlas=[];width=size+2;height=size+4;stride=width*height//4
  for ch in range(33,127):
   im=Image.new('L',(width,height));d=ImageDraw.Draw(im);box=d.textbbox((0,0),chr(ch),font=font)
   d.text(((width-(box[2]-box[0]))//2-box[0],(height-(box[3]-box[1]))//2-box[1]),chr(ch),font=font,fill=255)
   px=list(im.getdata());atlas.extend(sum(((px[i+j]*3+127)//255)<<(2*j) for j in range(4)) for i in range(0,width*height,4))
  name=f'typing_glyphs_{size}_{weight}';names.append(name);header+=f'static const uint8_t {name}[{len(atlas)}]={{'+','.join(map(str,atlas))+'};\n'
  variants.append(dict(size=size,weight=weight,width=width,height=height,stride=stride,data=atlas))
header+='static const uint8_t *const typing_fonts[9]={'+','.join(names)+'};\n'
Path('firmware/v2/src/typing_font.h').write_text(header)
Path('public/typing-glyphs.json').write_text(json.dumps({'first':33,'variants':variants},separators=(',',':')))
print('Glyph bytes:',sum(len(v['data']) for v in variants),'font SHA256:',hashlib.sha256(Path(sys.argv[1]).read_bytes()).hexdigest())
