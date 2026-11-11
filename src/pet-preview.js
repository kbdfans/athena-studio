import {scenePixel,overlayPixel} from './pet-scene.js';
import {petFrame,petPixelOffset,isPet40,petLift,createPetPack,petDuration} from './pet-pack.js';
// Same full-screen scan region and nearest-neighbour scaling as the firmware renderer.
export function petPreview(pack,action,elapsed,stage=2,jump=0,stats={level:1,xp:0,fullness:80},groundOffset=0){
  const frame=petFrame(pack,action,elapsed),v=new DataView(pack.buffer,pack.byteOffset),out=new Uint8ClampedArray(128*128*4);
  const sourceWidth=isPet40(pack)?40:32,width=stage===0?64:isPet40(pack)?80:96,height=stage===0?64:isPet40(pack)?64:96;
  jump=petLift(pack,action,elapsed);
  const left=(128-width)/2,top=104-height-jump;
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    let color=scenePixel(x,y,groundOffset);
    if(x>=left&&x<left+width&&y>=top&&y<top+height){
    const sx=Math.floor((x-left)*(stage?sourceWidth:32)/width),sy=Math.floor((y-top)*32/height),i=sy*sourceWidth+sx;
    let c=(pack[petPixelOffset(pack,action,frame)+(i>>2)]>>((i&3)*2))&3;
    if(stage===0){const dx=sx-16,dy=sy-18;c=dx*dx*144+dy*dy*81>81*144?0:dx*dx*121+dy*dy*64>64*121?1:((sx===13&&sy===14)||(sx===19&&sy===21)||(sx===14&&sy===25))?2:frame===3&&sy===17&&sx>=13&&sx<=19?((sx+sy)&1?1:3):3;}
    if(c)color=v.getUint16(16+c*2,true);
    }
    const overlay=overlayPixel(x,y,stats.level,stats.xp,stats.fullness,action,elapsed);if(overlay!==null)color=overlay;
    const pos=(y*128+x)*4;
    out.set([Math.round((color>>11)*255/31),Math.round(((color>>5)&63)*255/63),Math.round((color&31)*255/31),255],pos);
  }
  return out;
}
export class PetMotion {
  constructor(now=0){this.pack=createPetPack();this.activity=0;this.clock=now;this.lastKey=now;this.action=0;this.started=now;}
  decay(now){const steps=Math.floor((now-this.clock)/100);if(steps>0){this.activity=Math.max(0,this.activity-steps);this.clock+=steps*100;}}
  key(now,space=false){
    this.decay(now);this.activity=Math.min(40,this.activity+4);this.lastKey=now;
    if(this.action>=4&&now-this.started<petDuration(this.pack,this.action))return;
    if(this.action===3||space){this.action=this.action===3?7:6;this.started=now;}
  }
  tick(now){
    this.decay(now);const idle=now-this.lastKey;
    let next=this.action;
    if(this.action<4||now-this.started>=petDuration(this.pack,this.action))next=idle>=30000?3:idle<900&&this.activity?(this.activity>=(this.action===2?10:16)?2:1):0;
    if(next!==this.action){this.action=next;this.started=now;}
    return{action:this.action,elapsed:now-this.started,jump:petLift(this.pack,this.action,now-this.started)};
  }
}
