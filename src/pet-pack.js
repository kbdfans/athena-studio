import {applyPetPattern} from './pet-patterns.js';
import {customPetPalette, colorHex} from './pet-colors.js';
import {PET_ART} from './pet-art.js';
import {SHIBA_ART} from './pet-shiba-art.js';
// Appearance-only packs share the PT40 format. Only declare a higher
// per-model minimum when an entry needs new firmware capabilities.
export const PET_SPECIES={
 cat:{label:'像素小猫',theme:'mint',art:PET_ART},
 shiba:{label:'柴犬',theme:'orange',art:SHIBA_ART},
};
export function petRequiresUpgrade(entry,model,motionVersion){
 const minimum=entry.firmware?.[model]??5;
 return Number.isInteger(motionVersion)&&motionVersion<minimum;
}
import {validatePetPack as validateLegacy,petFrame as legacyFrame} from './pet-legacy.js';
export const PET_ACTIONS=['待机','慢走','奔跑','睡眠','吃饭','开心','跳跃','醒来'];
export const PET_STAGES=['孵化中','幼猫','成年猫'];
export const PET_BYTES=14336;
export const PET_SEQUENCES=[[36,37,38,39],[20,21,22,23,24,25,26,27],[4,5,6,7,8,9,10,11],[40,41],[28,29,30,29,30,31],[32,33,34,35,33,32],[12,13,14,15,16,17,18,19],[40,42,43,36]];
export const PET_TIMINGS=[[650,450,650,450],[150,150,150,150,150,150,150,150],[95,70,80,65,85,65,80,90],[1200,1300],[300,280,180,280,180,500],[250,300,350,300,350,200],[150,160,80,100,130,100,130,200],[250,300,600,300]];
const rgb=(r,g,b)=>((r>>3)<<11)|((g>>2)<<5)|(b>>3);
export const PET_PALETTES={
 mint:[0,rgb(14,57,52),rgb(147,221,170),rgb(255,244,206)],
 orange:[0,rgb(71,42,25),rgb(236,161,79),rgb(255,241,207)],
 cream:[0,rgb(75,62,49),rgb(230,211,171),rgb(255,248,225)],
 gray:[0,rgb(43,48,62),rgb(164,180,198),rgb(238,240,230)],
};
export const petStage=xp=>xp<10?0:xp<200?1:2;
export const isPet40=p=>p[2]===52&&p[3]===48;
export function petThemeColors(theme='mint'){
 const p=PET_PALETTES[theme];if(!p)throw Error('未知宠物配色');
 return {outline:colorHex(p[1]),body:colorHex(p[2]),accent:colorHex(p[3])};
}
export function createPetPack(theme='mint',colors,pattern='original',species='cat'){
 if(!Object.hasOwn(PET_SPECIES,species))throw Error('未知宠物种类');
 if(!PET_PALETTES[theme])throw Error('未知宠物配色');
 const p=new Uint8Array(PET_BYTES),v=new DataView(p.buffer);
 p.set([80,84,52,48,1,40,32,2,8,44]);v.setUint16(10,100,true);v.setUint32(12,PET_BYTES,true);
 (colors === undefined ? PET_PALETTES[theme] : customPetPalette(colors)).forEach((c,i)=>v.setUint16(16+2*i,c,true));
 PET_SEQUENCES.forEach((seq,a)=>{p[24+a]=seq.length;p.set(seq,32+a*8);PET_TIMINGS[a].forEach((ms,f)=>v.setUint16(96+a*16+f*2,ms,true));});
 p.set(Uint8Array.from(atob(PET_SPECIES[species].art),c=>c.charCodeAt(0)),256);return applyPetPattern(p,pattern);
}
export function petPackSize(header){
 const n=new DataView(header.buffer,header.byteOffset,header.byteLength).getUint32(12,true);
 if((isPet40(header)&&n===PET_BYTES)||(!isPet40(header)&&n===6400))return n;
 throw Error('宠物素材格式不兼容');
}
export function validatePetPack(p){
 if(!isPet40(p))return validateLegacy(p);
 if(p.length!==PET_BYTES||[80,84,52,48,1,40,32,2,8,44].some((v,i)=>p[i]!==v)||petPackSize(p)!==PET_BYTES)throw Error('宠物素材格式不兼容');
 const v=new DataView(p.buffer,p.byteOffset,p.byteLength);
 for(let a=0;a<8;a++){
  if(p[24+a]<1||p[24+a]>8)throw Error('宠物动作帧数无效');
  for(let f=0;f<p[24+a];f++){const ms=v.getUint16(96+a*16+f*2,true);if(p[32+a*8+f]>=44||ms<50||ms>2000)throw Error('宠物动作数据无效');}
 }return p;
}
export function petDuration(p,a){if(!isPet40(p))return 2400;const v=new DataView(p.buffer,p.byteOffset);let n=0;for(let f=0;f<p[24+a];f++)n+=v.getUint16(96+a*16+f*2,true);return n;}
export function petFrame(p,a,elapsed){
 if(!isPet40(p))return legacyFrame(p,a<6?a:0,elapsed);
 if(!Number.isInteger(a)||a<0||a>=8)throw Error('宠物动作无效');
 let t=Math.max(0,elapsed);const total=petDuration(p,a),count=p[24+a],v=new DataView(p.buffer,p.byteOffset);
 t=a<4?t%total:Math.min(t,total-1);
 for(let f=0;f<count;f++){const ms=v.getUint16(96+a*16+f*2,true);if(t<ms)return f;t-=ms;}return 0;
}
export function petPixelOffset(p,a,f){return isPet40(p)?256+p[32+a*8+f]*320:256+((a<6?a:0)*4+f)*256;}
export function petRgba(p,a,f){
 validatePetPack(p);if(a<0||a>=(isPet40(p)?8:6)||!Number.isInteger(a)||!Number.isInteger(f)||f<0||f>=(isPet40(p)?p[24+a]:4))throw Error('宠物动作无效');
 const pixels=(isPet40(p)?40:32)*32,out=new Uint8ClampedArray(pixels*4),base=petPixelOffset(p,a,f),v=new DataView(p.buffer,p.byteOffset);
 for(let i=0;i<pixels;i++){const n=(p[base+(i>>2)]>>((i&3)*2))&3;if(!n)continue;const c=v.getUint16(16+n*2,true);out.set([Math.round((c>>11)*255/31),Math.round(((c>>5)&63)*255/63),Math.round((c&31)*255/31),255],i*4);}return out;
}
export function petLift(p,a,elapsed){
 if(!isPet40(p))return 0;
 const heights=a===6?[0,0,3,15,24,14,0,0]:a===2?[0,1,4,0,0,2,5,0]:null;if(!heights)return 0;
 const f=petFrame(p,a,elapsed);if(a===2)return heights[f];
 const v=new DataView(p.buffer,p.byteOffset);let t=Math.max(0,elapsed);for(let i=0;i<f;i++)t-=v.getUint16(96+a*16+i*2,true);
 const ms=v.getUint16(96+a*16+f*2,true),h=heights[f],next=heights[Math.min(f+1,7)];return Math.floor(h+(next-h)*Math.min(1,t/ms));
}
