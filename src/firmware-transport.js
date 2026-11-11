import {BASE,FLASH_BYTES,SECTOR,MAIN_LIMIT} from './firmware-plan.js';
import {digest} from './backup-v2.js';
import {getFirmwareBackup,markFirmwareBackup} from './firmware-backup.js';
function range(offset,length){
  if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<1||offset+length>FLASH_BYTES)throw Error('固件访问地址越界');
  const a=new Uint8Array(8),v=new DataView(a.buffer);v.setUint32(0,BASE+offset,true);v.setUint32(4,length,true);return a;
}
export async function readFirmwareFlash(boot,onProgress=()=>{}){
  await boot.command(6);
  const data=new Uint8Array(FLASH_BYTES);
  for(let off=0;off<FLASH_BYTES;off+=65536){const chunk=await boot.command(0x84,range(off,65536),65536);if(chunk?.length!==65536)throw Error('固件读取不完整');data.set(chunk,off);onProgress((off+65536)/FLASH_BYTES);}
  return data;
}
export async function writeFirmwarePlan(boot,plan,backupId,onProgress=()=>{}){
  // Recheck the durable backup and immutable plan before any erase.
  const backup=await getFirmwareBackup(backupId);
  if(!backup||backup.model!==plan.model||backup.targetSha256!==plan.targetSha256||backup.sha256!==plan.originalSha256||await digest(backup.data)!==backup.sha256||await digest(plan.target)!==plan.targetSha256)throw Error('升级计划或恢复备份校验失败，未开始写入');
  if(plan.target.length!==FLASH_BYTES)throw Error('升级计划长度不正确');
  const expected=[];
  for(let off=0;off<FLASH_BYTES;off+=SECTOR){if(backup.data.subarray(off,off+SECTOR).some((b,j)=>b!==plan.target[off+j])){
    if(!(off<MAIN_LIMIT||(plan.layout==='legacy'&&off>=0x400000&&off<0xe00000)))throw Error('升级计划越界');expected.push(off);
  }}
  if(plan.sectors.length!==expected.length||new Set(plan.sectors).size!==expected.length||plan.sectors.some(n=>!expected.includes(n)))throw Error('升级扇区列表不一致');
  // Device may have been replaced since plan creation. Read again before erase.
  const before=await readFirmwareFlash(boot,p=>onProgress('确认设备',p));
  if(await digest(before)!==plan.originalSha256)throw Error('设备内容已改变，已停止升级，未擦除或写入');
  await markFirmwareBackup(backupId,'writing');
  for(let index=0;index<plan.sectors.length;index++){
    const off=plan.sectors[index];
    await boot.command(3,range(off,SECTOR));
    for(let j=0;j<SECTOR;j+=256){const page=plan.target.slice(off+j,off+j+256);if(page.some(b=>b!==255))await boot.command(5,range(off+j,256),256,page);}
    const readback=await boot.command(0x84,range(off,SECTOR),SECTOR);
    if(readback?.length!==SECTOR||readback.some((b,j)=>b!==plan.target[off+j]))throw Error('写入回读不一致；请保持升级模式，使用恢复备份');
    onProgress('写入固件',(index+1)/plan.sectors.length);
  }
  const actual=await readFirmwareFlash(boot,p=>onProgress('校验完整内容',p));
  if(await digest(actual)!==plan.targetSha256)throw Error('整片校验失败；请保持升级模式，使用恢复备份');
  await markFirmwareBackup(backupId,'verified');
}
