// Repaint only opaque fur pixels. Pose silhouettes and facial linework stay intact.
export const PET_PATTERNS = {
  original: '经典双色', solid: '纯色', tabby: '虎斑', cow: '奶牛斑', points: '重点色',
};
export function applyPetPattern(pack, pattern='original') {
  if (!Object.hasOwn(PET_PATTERNS,pattern)) throw Error('未知猫咪花纹');
  if (pattern==='original') return pack;
  for(let frame=0;frame<44;frame++){
    const base=256+frame*320,pixels=new Uint8Array(1280);
    let minX=40,minY=32,maxX=0,maxY=0;
    for(let i=0;i<1280;i++){
      const c=pixels[i]=(pack[base+(i>>2)]>>((i&3)*2))&3;
      if(c){const x=i%40,y=Math.floor(i/40);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
    }
    for(let i=0;i<1280;i++){
      const c=pixels[i];if(c<2)continue;
      const x=i%40,y=Math.floor(i/40),u=x-minX,v=maxY-y;
      const coat=x<maxX-10||v<7;
      let next=c;
      if(pattern==='solid')next=2;
      else if(c===2&&pattern==='tabby'&&coat&&((u+Math.floor(v/3))%7<2))next=1;
      else if(c===2&&pattern==='cow'&&coat){
        // Broad irregular patches; deterministic across playback and regeneration.
        if(((x-(maxX-17))/4)**2+((v-9)/3.2)**2<1||((x-(maxX-11))/3)**2+((v-3)/2.5)**2<1)next=1;
        else if(((x-(maxX-20))/4)**2+((v-3)/2.5)**2<1)next=3;
      }
      else if(c===2&&pattern==='points'&&((v<4)||(x>maxX-15&&y<minY+5)||(x<minX+5&&y<minY+7)))next=1;
      const shift=(i&3)*2;pack[base+(i>>2)]=(pack[base+(i>>2)]&~(3<<shift))|(next<<shift);
    }
  }
  return pack;
}
