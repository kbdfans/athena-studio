import {validateKeymap} from './keymap-protocol.js';
import {DEVICE_PROFILES} from './device-profiles.js';
// Deliberate reset is restricted to the two audited RP2040 board families.
// A new VID/PID, capacity, or PCB family needs its own manifest and validation.
export function validateResetEvidence(release,profile,evidence){
 const known=DEVICE_PROFILES[profile.id],policy=release.compatibility;
 if(!known||known.vid!==profile.vid||known.pid!==profile.pid||known.uid!==profile.uid||policy?.mode!=='athena-rp2040-reset-v1'||policy.flashBytes!==0x1000000||policy.hardwareRevision!=='original-rp2040-16mb')throw Error('此硬件尚未开放兼容重置升级');
 if(evidence?.confirmed!==true||evidence.identity?.model!==known.id||evidence.identity?.vid!==known.vid||evidence.identity?.pid!==known.pid||evidence.identity?.uid!==known.uid)throw Error('兼容升级需要正常模式型号识别和明确重置确认');
 const map=validateKeymap(evidence.keymap);
 if((map.model||'athena75')!==known.id)throw Error('升级前键位记录与型号不匹配');
 return true;
}
export function firmwareVersionStatus(info,release){
 if(!info)return {kind:'unknown',label:'旧版固件未提供版本信息'};
 if(info.model!==release.model||info.hardwareRevision!==release.hardwareRevision)return {kind:'unsupported',label:'硬件版本与升级包不匹配'};
 if(info.buildId===release.buildId)return {kind:'current',label:'已是当前发布版本'};
 if(info.releaseSequence>release.releaseSequence)return {kind:'newer',label:'键盘版本比此站点更新'};
 return {kind:'update',label:'有可用更新'};
}
export function decodeBuildInfo(packet){
 if(String.fromCharCode(...packet.slice(6,10))!=='ASF1')return null;
 const v=new DataView(packet.buffer,packet.byteOffset,packet.byteLength),pid=v.getUint16(10,true),p=Object.values(DEVICE_PROFILES).find(p=>p.pid===pid);
 if(!p||packet[12]!==1||packet[13]!==16)return null;
 return {model:p.id,hardwareRevision:'original-rp2040-16mb',configSchema:packet[14],resourceSchema:packet[15],releaseSequence:v.getUint32(16,true),buildId:new TextDecoder().decode(packet.slice(20,32)).replace(/\0.*$/,'')};
}
