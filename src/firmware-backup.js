import {digest} from './backup-v2.js';
import {FLASH_BYTES} from './firmware-plan.js';
const DB='athena-firmware-recovery-v1';
async function transaction(mode, action){
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('backups',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('请关闭其他配置器标签页后重试'));});
  try{return await new Promise((resolve,reject)=>{const t=db.transaction('backups',mode),r=action(t.objectStore('backups'));t.oncomplete=()=>resolve(r.result);t.onerror=t.onabort=()=>reject(t.error||Error('固件恢复备份保存失败'));});}finally{db.close();}
}
export async function saveFirmwareBackup(data,plan,deviceSerial=''){
  if(data.length!==FLASH_BYTES || await digest(data)!==plan.originalSha256)throw Error('升级备份与读取结果不一致');
  const record={id:crypto.randomUUID(),created:new Date().toISOString(),model:plan.model,release:plan.release,sha256:plan.originalSha256,targetSha256:plan.targetSha256,deviceSerial,data,phase:'prepared',resetSettings:plan.resetSettings===true,resetEvidence:plan.resetEvidence||null,releasePolicy:plan.releasePolicy||null};
  await transaction('readwrite',s=>s.put(record));
  const saved=await getFirmwareBackup(record.id);
  if(!saved || await digest(saved.data)!==record.sha256)throw Error('恢复备份校验失败，未开始写入');
  return saved;
}
export const getFirmwareBackup=id=>transaction('readonly',s=>s.get(id));
export async function listFirmwareBackups(){return (await transaction('readonly',s=>s.getAll())).sort((a,b)=>b.created.localeCompare(a.created));}
export async function markFirmwareBackup(id,phase){const record=await getFirmwareBackup(id);if(!record)throw Error('升级恢复记录不存在');record.phase=phase;await transaction('readwrite',s=>s.put(record));}
