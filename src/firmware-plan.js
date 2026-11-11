// Firmware plans are pure. No USB writes are possible in this module.
import {digest} from './backup-v2.js';
import {petPackSize,validatePetPack} from './pet-pack.js';
import {crc32} from './crc32.js';
import {validateResetEvidence} from './firmware-compatibility.js';
import {DEVICE_PROFILES} from './device-profiles.js';
export const FLASH_BYTES = 0x1000000, MAIN_LIMIT = 0x1f0000, SECTOR = 4096, BASE = 0x10000000;
const assert = (ok, message) => { if (!ok) throw Error(message); };
export function decodeFirmwareUf2(bytes) {
  assert(bytes instanceof Uint8Array && bytes.length > 0 && bytes.length % 512 === 0, '固件文件长度不正确');
  const count = bytes.length / 512, length = Math.ceil(count * 256 / SECTOR) * SECTOR;
  assert(length < MAIN_LIMIT, '固件超出主程序区域');
  const out = new Uint8Array(length).fill(255), v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < count; i++) {
    const p = i * 512, expected = [0x0a324655,0x9e5d5157,0x2000,BASE+i*256,256,i,count,0xe48bff56];
    assert(expected.every((n,j)=>v.getUint32(p+j*4,true)===n) && v.getUint32(p+508,true)===0x0ab16f30, '固件分块、地址或芯片型号不正确');
    out.set(bytes.subarray(p+32,p+288),i*256);
  }
  return out;
}
export function hasModelDescriptor(bytes, pid) {
  // USB device descriptor must carry this vendor/product pair.
  for(let i=0;i<=bytes.length-18;i++) if(bytes[i]===18 && bytes[i+1]===1 && bytes[i+8]===0x5b && bytes[i+9]===0x9d && bytes[i+10]===(pid&255) && bytes[i+11]===(pid>>8)) return true;
  return false;
}
export function normalizeLegacyQgf(data) {
  const v = new DataView(data.buffer,data.byteOffset,data.byteLength);
  const block = (offset,kind) => {
    assert(offset>=0 && offset+5<=data.length && data[offset]===kind && data[offset+1]===(kind^255), '原动画数据块无效');
    const n=data[offset+2]+data[offset+3]*256+data[offset+4]*65536,end=offset+5+n;
    assert(end<=data.length,'原动画数据不完整');return [offset+5,n,end];
  };
  const [h,n,end]=block(0,0);
  assert(n===18 && data[h]===81 && data[h+1]===71 && data[h+2]===70 && data[h+3]===1,'原动画格式不支持');
  const size=v.getUint32(9,true), frames=v.getUint16(21,true);
  assert(size===data.length && (size^v.getUint32(13,true))===-1 && v.getUint16(17,true)===128 && v.getUint16(19,true)===128 && frames>0 && frames<=63,'原动画尺寸或帧数不支持');
  const [table,tableLength,tableEnd]=block(end,1);
  assert(tableLength===frames*4,'原动画帧表无效');
  const starts=Array.from({length:frames},(_,i)=>v.getUint32(table+i*4,true));
  assert(starts[0]===tableEnd && starts.every((p,i)=>i===0||p>starts[i-1]),'原动画帧地址无效');
  const out=new Uint8Array(28+frames*32788),ov=new DataView(out.buffer),frame=new Uint8Array(32768);
  out.set([0,255,18,0,0,81,71,70,1]);ov.setUint32(9,out.length,true);ov.setUint32(13,~out.length,true);ov.setUint16(17,128,true);ov.setUint16(19,128,true);ov.setUint16(21,frames,true);out.set([1,254,(frames*4)&255,frames>>6,0],23);
  for(let i=0;i<frames;i++) {
    const [d,dn,de]=block(starts[i],2),flags=data[d+1],compression=data[d+2],delay=v.getUint16(d+4,true);
    assert(dn===6 && data[d]===8 && (flags===0||flags===2) && compression<=1 && delay>0 && (i>0||flags===0),'原动画编码暂不支持，已停止升级');
    let pos=de,left=0,top=0,right=127,bottom=127;
    if(flags===2){const [p,len,next]=block(pos,4);assert(len===8,'原动画差分区域无效');[left,top,right,bottom]=[0,2,4,6].map(j=>v.getUint16(p+j,true));assert(left<=right && right<128 && top<=bottom && bottom<128,'原动画差分范围越界');pos=next;}
    const [p,len,next]=block(pos,5),width=right-left+1,expected=width*(bottom-top+1)*2;
    assert(next===(starts[i+1]??data.length),'原动画帧长度不正确');
    let raw=data.subarray(p,p+len);
    if(compression){raw=new Uint8Array(expected);let cursor=p,written=0;while(cursor<p+len){const marker=data[cursor++],amount=marker<128?marker:marker-127;assert(marker>0 && written+amount<=expected,'原动画压缩长度无效');if(marker<128){assert(cursor<p+len,'原动画压缩数据不完整');raw.fill(data[cursor++],written,written+amount);}else{assert(cursor+amount<=p+len,'原动画压缩数据不完整');raw.set(data.subarray(cursor,cursor+amount),written);cursor+=amount;}written+=amount;}assert(written===expected,'原动画压缩数据不完整');}
    assert(raw.length===expected,'原动画像素长度不正确');
    for(let y=top;y<=bottom;y++)frame.set(raw.subarray((y-top)*width*2,(y-top+1)*width*2),(y*128+left)*2);
    const offset=28+frames*4+i*32784;ov.setUint32(28+i*4,offset,true);out.set([2,253,6,0,0,8,0,0,255,delay&255,delay>>8,5,250,0,128,0],offset);out.set(frame,offset+16);
  }
  return out;
}
export async function planFirmwareUpgrade(current, uf2, release, profile, {clearImages=false,compatibilityReset=null}={}) {
  assert(!DEVICE_PROFILES[profile.id]?.keymapOnly,'此型号暂未提供在线升级');
  assert(current instanceof Uint8Array && current.length===FLASH_BYTES,'需要完整的 16 MB 读取结果');
  assert(release.model===profile.id && release.pid===profile.pid && profile.vid===0x9d5b,'键盘型号与固件不匹配');
  assert(await digest(uf2)===release.sha256,'固件下载校验失败');
  const main=decodeFirmwareUf2(uf2);
  assert(hasModelDescriptor(main,profile.pid) && hasModelDescriptor(current.subarray(0,MAIN_LIMIT),profile.pid),'固件硬件身份不匹配');
  for (const other of Object.values(DEVICE_PROFILES)) {
    if (other.pid===profile.pid) continue;
    assert(!hasModelDescriptor(current.subarray(0,MAIN_LIMIT),other.pid) && !hasModelDescriptor(main,other.pid),'发现冲突的硬件身份，已停止升级');
  }
  if(main.every((b,i)=>current[i]===b)){const error=Error('当前固件已是最新版本，无需升级');error.code='ALREADY_CURRENT';throw error;}
  let source;
  for(const item of release.sources){
    assert(Number.isInteger(item.length)&&item.length>0&&item.length<=MAIN_LIMIT,'固件来源记录无效');
    if(await digest(current.subarray(0,item.length))===item.sha256){source=item;break;}
  }
  let reset=false;
  if(!source){
    if(compatibilityReset){
      validateResetEvidence(release,profile,compatibilityReset);assert(clearImages,'兼容重置必须清空图片');
      for(const offset of [0x100000,0x200000,0x400000,0x800000])assert(!current.subarray(0,65536).every((b,i)=>b===current[offset+i]),'Flash 容量无法确认，已停止兼容升级');
      source={layout:'reset'};reset=true;
    }
    else {const error=Error('当前固件版本尚未验证，已停止升级，未擦除或写入');error.code='COMPATIBILITY_RESET_REQUIRED';throw error;}
  }
  assert(['legacy','v2','reset'].includes(source.layout),'未知存储布局');
  // Audited rollback firmware can coexist with the newer resource layout.
  // Accept only its exact program fingerprint AND valid existing v2 resources.
  if(source.requiresV2Resources){
    assert(source.layout==='v2','升级来源的资源规则无效');
    let validAsset=false,validSave=false;
    try{const size=petPackSize(current.subarray(0xa00000,0xa00100));validatePetPack(current.subarray(0xa00000,0xa00000+size));validAsset=true;}catch{}
    for(let off=0xdfe000;off<0xe00000;off+=256){
      const p=current.subarray(off,off+256),v=new DataView(p.buffer,p.byteOffset,p.byteLength);
      if(p[0]===80&&p[1]===69&&p[2]===84&&p[3]===50&&v.getUint32(20,true)===crc32(p.subarray(0,20))&&p[16]<3&&p[17]<3&&p[18]<=100&&v.getUint32(8,true)<=2000000)validSave=true;
    }
    assert(validAsset&&validSave,'当前固件的资源分区与已验证记录不一致，已停止升级，未擦除或写入');
  }
  const target=current.slice();
  if(reset){target.fill(255,0,0x200000);target.fill(255,0x400000,0xe00000);}
  target.set(main);
  if(clearImages){
    // The user explicitly chose a clean three-slot image area. Never parse old images.
    target.fill(255,0x400000,0xa00000);
    if(source.layout==='legacy')target.fill(255,0xa00000,0xe00000);
  }else if(source.layout==='legacy'){
    const offsets=[0x500000,0x600000,0x800000];
    for(let i=0;i<3;i++){
      const off=offsets[i],max=i===0?0x100000:0x200000;
      const size=new DataView(current.buffer,current.byteOffset+off,28).getUint32(9,true);
      assert(size>=28 && size<=max,'原日常动画缺失或损坏，已停止升级');
      const image=normalizeLegacyQgf(current.subarray(off,off+size)),dest=0x400000+i*0x200000;
      target.fill(255,dest,dest+0x200000);target.set(image,dest);
    }
    target.fill(255,0xa00000,0xe00000);
  }
  const sectors=[];
  for(let off=0;off<FLASH_BYTES;off+=SECTOR){
    if(current.subarray(off,off+SECTOR).some((b,j)=>b!==target[off+j])){
      assert((reset&&(off<0x200000||(off>=0x400000&&off<0xe00000)))||off<main.length || (source.layout==='legacy'&&off>=0x400000&&off<0xe00000) || (clearImages&&off>=0x400000&&off<0xa00000),'升级计划越过允许区域');sectors.push(off);
    }
  }
  // Write resources first. Configuration is writable only in the explicit reset plan.
  sectors.sort((a,b)=>(a<MAIN_LIMIT)-(b<MAIN_LIMIT)||a-b);
  return {target,sectors,mainBytes:main.length,clearImages,model:profile.id,layout:source.layout,resetSettings:reset,resetEvidence:reset?compatibilityReset:null,releasePolicy:reset?release.compatibility:null,release:release.version,originalSha256:await digest(current),targetSha256:await digest(target)};
}
export function recoveryUf2(flash) {
  assert(flash.length===FLASH_BYTES,'恢复数据长度不正确');
  const count=flash.length/256,out=new Uint8Array(count*512),v=new DataView(out.buffer);
  for(let i=0;i<count;i++){const p=i*512;[0x0a324655,0x9e5d5157,0x2000,BASE+i*256,256,i,count,0xe48bff56].forEach((n,j)=>v.setUint32(p+j*4,n,true));out.set(flash.subarray(i*256,i*256+256),p+32);v.setUint32(p+508,0x0ab16f30,true);}return out;
}
