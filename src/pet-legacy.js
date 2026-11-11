// Four palette entries, two bits per pixel, 24 frames, no runtime image decoder.
export const PET_ACTIONS = ["待机", "走路", "奔跑", "睡觉", "吃东西", "开心"];
export const PET_BYTES = 6400;
export const PET_TIMINGS = [[900,700,800,120],[150,150,150,150],[90,90,90,90],[650,650,650,650],[230,160,240,170],[180,140,180,220]];
export const PET_STAGES = ["孵化中", "幼猫", "成年猫"];
export function petStage(xp){return xp<10?0:xp<200?1:2;}
export function petFrame(pack,action,elapsed){
  const v=new DataView(pack.buffer,pack.byteOffset,pack.byteLength);
  const times=Array.from({length:4},(_,f)=>pack[24]===1?v.getUint16(32+action*8+f*2,true):v.getUint16(10,true));
  let t=Math.max(0,elapsed)%times.reduce((a,b)=>a+b,0);
  for(let f=0;f<4;f++){if(t<times[f])return f;t-=times[f];}return 0;
}
export const PET_PALETTES = {
  orange: [0x18e4, 0x0841, 0xfb60, 0xff7b],
  mint: [0x18e4, 0x0841, 0x6e55, 0xff7b],
  cream: [0x18e4, 0x0841, 0xeed4, 0xffff],
};
export function createPetPack(theme = "orange") {
  if (!PET_PALETTES[theme]) throw Error("未知宠物配色");
  const out = new Uint8Array(PET_BYTES), v = new DataView(out.buffer);
  out.set([80,84,51,50,1,32,32,2,6,4]);
  v.setUint16(10,160,true); v.setUint32(12,PET_BYTES,true);
  PET_PALETTES[theme].forEach((n,i)=>v.setUint16(16+i*2,n,true));
  // Optional timing extension. Older v2 firmware still reads the same 24 frames.
  out[24]=1;
  PET_TIMINGS.forEach((times,a)=>times.forEach((ms,f)=>v.setUint16(32+a*8+f*2,ms,true)));
  for(let action=0;action<6;action++) for(let frame=0;frame<4;frame++) {
    const a=new Uint8Array(1024);
    const dot=(x,y,c)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&x<32&&y>=0&&y<32)a[y*32+x]=c;};
    const rect=(x,y,w,h,c)=>{for(let j=0;j<h;j++)for(let i=0;i<w;i++)dot(x+i,y+j,c);};
    const oval=(x,y,rx,ry,c)=>{for(let j=-ry;j<=ry;j++)for(let i=-rx;i<=rx;i++)if(i*i/(rx*rx)+j*j/(ry*ry)<=1)dot(x+i,y+j,c);};
    const body=(x,y,rx,ry)=>{oval(x,y,rx,ry,1);oval(x,y,rx-1,ry-1,2);};
    const paw=(x,y)=>{rect(x,y,4,3,1);rect(x+1,y,2,2,3);};
    const line=(x,y,points,c)=>points.forEach(([dx,dy])=>rect(x+dx,y+dy,2,2,c));
    function head(x,y,closed=false,side=false){
      // Stepped ears, small muzzle and asymmetry keep the silhouette feline.
      rect(x-7,y-8,3,6,1);rect(x+4,y-8,3,6,1);
      rect(x-6,y-6,2,3,3);rect(x+4,y-6,2,3,3);
      body(x,y,8,6);
      rect(x-1,y-5,2,2,3);
      const shift=side?2:0;
      if(closed){rect(x-5+shift,y,3,1,1);rect(x+2+shift,y,3,1,1);}
      else {rect(x-4+shift,y-1,2,2,1);rect(x+3+shift,y-1,2,2,1);}
      rect(x-2+shift,y+2,5,2,3);dot(x+shift,y+2,1);dot(x-1+shift,y+4,1);dot(x+1+shift,y+4,1);
      rect(x-8,y+2,2,1,3);rect(x+7,y+2,2,1,3);
    }
    if(action===1||action===2){
      // A true side profile: hips/shoulders remain attached to the legs.
      const run=action===2,lift=(run?[0,-1,-3,-1]:[0,-1,0,-1])[frame];
      const back=(run?[-3,2,4,0]:[-2,0,2,0])[frame];
      const front=(run?[4,0,-3,2]:[2,0,-2,0])[frame];
      function limb(x,y,dx,raised,far=false){
        const endX=x+dx,endY=28+lift-raised,steps=Math.max(Math.abs(dx),endY-y);
        for(let n=0;n<=steps;n++){const t=n/steps;rect(Math.round(x+(endX-x)*t),Math.round(y+(endY-y)*t),3,2,far?1:2);}
        rect(endX-1,endY,5,2,1);rect(endX,endY,3,1,far?2:3);
      }
      limb(11,22+lift,-back,frame===1?2:0,true);limb(21,21+lift,-front,frame===3?2:0,true);
      line(2,13+lift,[[0,0],[0,2],[1,4],[3,6],[5,6]],1);line(3,14+lift,[[0,0],[0,2],[2,4],[4,5]],2);
      body(14,21+lift,run&&(frame%2)?8:10,5);oval(16,22+lift,6,2,3);
      limb(9,23+lift,back,frame===3?2:0);limb(21,21+lift,front,frame===1?2:0);
      // Neck and right-facing head. Only the near eye is visible.
      body(23,17+lift,6,6);rect(19,9+lift,3,6,1);rect(25,8+lift,3,6,1);
      rect(20,11+lift,2,3,2);rect(26,10+lift,1,3,3);
      rect(27,18+lift,4,3,1);rect(27,18+lift,3,2,3);dot(30,18+lift,1);
      rect(25,15+lift,2,2,1);dot(28,20+lift,1);rect(21,13+lift,2,2,3);
    } else if(action===3){
      const breathe=frame===1||frame===2?-1:0;
      body(17,24+breathe,11,5);head(11,23+breathe,true);
      oval(21,25,6,3,1);oval(21,25,5,2,2);rect(23,24,3,1,3);
      const zy=5-frame;rect(23,zy,4,1,3);dot(25,zy+1,3);dot(24,zy+2,3);rect(23,zy+3,4,1,3);
    } else {
      const happy=action===5,eat=action===4;
      const bounce=happy?[0,-2,-3,-1][frame]:0;
      const nod=eat?[0,2,3,1][frame]:0;
      line(23,21+bounce,[[0,0],[2,0],[3,-2],[3,-4+(frame===2?-1:0)]],1);
      line(23,21+bounce,[[0,0],[2,-1],[3,-3]],2);
      body(16,23+bounce,7,5);oval(16,23+bounce,4,3,3);
      paw(10,27+bounce);paw(19,27+bounce);
      head(16,14+bounce+nod,happy||(action===0&&frame===3));
      if(action===0){if(frame===1)rect(7,7,2,2,2);if(frame===2)rect(24,8,2,2,2);}
      if(eat){rect(10,28,14,2,3);rect(12,30,10,1,1);rect(13,27,8,1,2);if(frame===2)dot(19,23,3);}
      if(happy){paw(5,21+bounce);paw(24,21+bounce);dot(4,8-frame,3);dot(27,5+frame,3);rect(4,10-frame,1,2,3);}
    }
    const base=256+(action*4+frame)*256;
    for(let i=0;i<1024;i++)out[base+(i>>2)]|=a[i]<<((i&3)*2);
  }
  return out;
}
export function validatePetPack(bytes) {
  if(bytes.length!==PET_BYTES) throw Error("宠物素材大小不正确");
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if([80,84,51,50,1,32,32,2,6,4].some((x,i)=>bytes[i]!==x)||v.getUint32(12,true)!==PET_BYTES||v.getUint16(10,true)<80||v.getUint16(10,true)>1000)throw Error("宠物素材格式不兼容");
  if(bytes[24]===1)for(let i=0;i<24;i++){const ms=v.getUint16(32+i*2,true);if(ms<50||ms>2000)throw Error("宠物动画时长无效");}
  return bytes;
}
export function petRgba(pack, action, frame) {
  validatePetPack(pack);
  if(!Number.isInteger(action)||action<0||action>5||!Number.isInteger(frame)||frame<0||frame>3)throw Error("宠物动作无效");
  const v=new DataView(pack.buffer,pack.byteOffset), out=new Uint8ClampedArray(4096), base=256+(action*4+frame)*256;
  for(let i=0;i<1024;i++){
    const c=v.getUint16(16+((pack[base+(i>>2)]>>((i&3)*2))&3)*2,true);
    out.set([Math.round((c>>11)*255/31),Math.round(((c>>5)&63)*255/63),Math.round((c&31)*255/31),255],i*4);
  }
  return out;
}
