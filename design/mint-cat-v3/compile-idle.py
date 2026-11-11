from PIL import Image
from pathlib import Path
import math,base64,json
root=Path(__file__).resolve().parent;im=Image.open(root/'idle-source.png').convert('RGBA');cw=im.width//4
cells=[im.crop((i*cw,0,(i+1)*cw,im.height)) for i in range(4)]
boxes=[c.getchannel('A').point(lambda a:255 if a>=96 else 0).getbbox() for c in cells]
box=(min(b[0] for b in boxes),min(b[1] for b in boxes),max(b[2] for b in boxes),max(b[3] for b in boxes))
scale=(box[3]-box[1])/25;w=math.ceil((box[2]-box[0])/scale);h=25;assert w<=40
palette=[(0,0,0,0),(14,57,52,255),(147,221,170,255),(255,244,206,255)]
raw=bytearray((root.parent/'mint-cat-v2/all-frames-40x32.2bpp').read_bytes());all_data=json.loads((root.parent/'mint-cat-v2/all-preview-data.json').read_text())
for f,cell in enumerate(cells):
 tile=cell.crop(box).resize((w,h),Image.Resampling.NEAREST);out=Image.new('RGBA',(40,32));indices=[0]*1280;left=(40-w)//2;top=31-h
 for y in range(h):
  for x in range(w):
   p=tile.getpixel((x,y))
   if p[3]<96:continue
   idx=min(range(1,4),key=lambda j:sum((p[k]-palette[j][k])**2 for k in range(3)));indices[(top+y)*40+left+x]=idx;out.putpixel((left+x,top+y),palette[idx])
 out.save(root/f'idle-{f}.png');all_data['frames'][36+f]=indices
 raw[(36+f)*320:(37+f)*320]=bytes(sum(indices[i+k]<<(k*2) for k in range(4)) for i in range(0,1280,4))
(root/'all-frames-40x32.2bpp').write_bytes(raw);(root/'all-preview-data.json').write_text(json.dumps(all_data,separators=(',',':')))
(root.parents[1]/'src/pet-art.js').write_text('// Original mint cat; idle v3. See design/mint-cat-v3.\nexport const PET_ART="'+base64.b64encode(raw).decode()+'";\n')
print('Idle frames compiled',w,h,'box',box)
