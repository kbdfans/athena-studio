"""Compile the generated 8x6 atlas into the existing 40x32/2bpp PT40 ABI.
Only grid extraction, alpha threshold, nearest-neighbour scaling and palette
quantization are performed; art is from the retained imagegen source.
"""
from PIL import Image
from pathlib import Path
import base64, math, json
root=Path(__file__).resolve().parent
source=Image.open(root/'source.png').convert('RGBA')
palette=[(0,0,0,0),(71,42,25,255),(236,161,79,255),(255,241,207,255)]
cells=[];boxes=[]
for i in range(44):
 x=i%8;y=i//8
 c=source.crop((x*source.width//8,y*source.height//6,(x+1)*source.width//8,(y+1)*source.height//6))
 b=c.getchannel('A').point(lambda a:255 if a>=128 else 0).getbbox()
 assert b, i
 cells.append(c);boxes.append(b)
scale=min(30/max(b[3]-b[1] for b in boxes),38/max(b[2]-b[0] for b in boxes))
frames=[]
for c,b in zip(cells,boxes):
 w=max(1,round((b[2]-b[0])*scale));h=max(1,round((b[3]-b[1])*scale))
 c=c.crop(b).resize((w,h),Image.Resampling.NEAREST)
 pixels=[0]*1280;left=(40-w)//2;top=31-h
 for y in range(h):
  for x in range(w):
   p=c.getpixel((x,y))
   if p[3]<128:continue
   n=min(range(1,4),key=lambda j:sum((p[k]-palette[j][k])**2 for k in range(3)))
   pixels[(top+y)*40+left+x]=n
 frames.append(pixels)
order=list(range(4))+list(range(16,24))+list(range(24,32))+list(range(8,16))+list(range(32,36))+list(range(36,40))+list(range(4))+[4,5,41,42]
assert len(order)==44
raw=bytes(sum(frames[f][i+k]<<(k*2) for k in range(4)) for f in order for i in range(0,1280,4))
assert len(raw)==14080
(root/'frames.2bpp').write_bytes(raw)
(root/'frames.json').write_text(json.dumps([frames[f] for f in order],separators=(',',':')))
(root.parents[1]/'src/pet-shiba-art.js').write_text('// Original Shiba Inu; generated atlas and compiler: design/shiba-v1.\nexport const SHIBA_ART="'+base64.b64encode(raw).decode()+'";\n')
sheet=Image.new('RGBA',(8*160,6*128),(246,244,236,255))
for i,f in enumerate(order):
 im=Image.new('RGBA',(40,32));im.putdata([palette[p] for p in frames[f]]);im.save(root/f'frame-{i:02}.png');sheet.alpha_composite(im.resize((160,128),Image.Resampling.NEAREST),(i%8*160,i//8*128))
sheet.save(root/'compiled-contact.png')
print('Compiled',len(order),'frames,',len(raw),'bytes; scale',round(scale,3))
