from PIL import Image,ImageDraw
from pathlib import Path
import json,math
root=Path(__file__).resolve().parent
im=Image.open(root/'interaction-source.png').convert('RGBA')
palette=[(0,0,0,0),(14,57,52,255),(147,221,170,255),(255,244,206,255)]
ys=[0,320,580,830,1060,1300,1536];frames=[];boxes=[];packed=bytearray()
board=Image.new('RGB',(640,720),(30,35,39));d=ImageDraw.Draw(board)
for row in range(6):
 xs=[0,256,512,768,1024]
 for col in range(4):
  cell=im.crop((xs[col],ys[row],xs[col+1],ys[row+1]));mask=cell.getchannel('A').point(lambda a:255 if a>=96 else 0);bbox=mask.getbbox();assert bbox
  boxes.append([xs[col]+bbox[0],ys[row]+bbox[1],xs[col]+bbox[2],ys[row]+bbox[3]])
  tile=cell.crop(bbox);w,h=math.ceil(tile.width/6.5),math.ceil(tile.height/6.5);assert w<=40 and h<=32,(row,col,w,h)
  tile=tile.resize((w,h),Image.Resampling.NEAREST);out=Image.new('RGBA',(40,32));indices=[0]*1280;left=(40-w)//2;top=31-h
  for y in range(h):
   for x in range(w):
    p=tile.getpixel((x,y))
    if p[3]<96:continue
    idx=min(range(1,4),key=lambda j:sum((p[k]-palette[j][k])**2 for k in range(3)))
    out.putpixel((left+x,top+y),palette[idx]);indices[(top+y)*40+left+x]=idx
  for j in range(0,1280,4):packed.append(sum(indices[j+k]<<(k*2) for k in range(4)))
  frames.append(indices);out.save(root/f'frame-{row*4+col:02}.png')
  scaled=out.resize((160,128),Image.Resampling.NEAREST)
  # Contact sheet only: 3x enlargement leaves room for frame numbers.
  scaled=out.resize((120,96),Image.Resampling.NEAREST);board.paste(scaled,(col*160+20,row*120),scaled);d.text((col*160+70,row*120+100),str(row*4+col+1),fill='white')
(root/'frames-40x32.2bpp').write_bytes(packed)
(root/'preview-data.json').write_text(json.dumps({'width':40,'height':32,'palette':palette,'frames':frames,'sourceBoxes':boxes},separators=(',',':')))
board.save(root/'contact-sheet.png')
print('Frames:',len(frames),'pixel bytes:',len(packed),'palette colors incl transparency:',len(palette))
