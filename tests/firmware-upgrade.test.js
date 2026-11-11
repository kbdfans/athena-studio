import test from 'node:test';
import {DEVICE_PROFILES} from '../src/device-profiles.js';
import assert from 'node:assert/strict';
import {indexedDB} from 'fake-indexeddb';
import {FLASH_BYTES,decodeFirmwareUf2,normalizeLegacyQgf,planFirmwareUpgrade,recoveryUf2} from '../src/firmware-plan.js';
import {saveFirmwareBackup,getFirmwareBackup} from '../src/firmware-backup.js';
import {writeFirmwarePlan} from '../src/firmware-transport.js';
import {digest} from '../src/backup-v2.js';
import {encodeQgf} from '../src/format-v2.js';
import {connectIdentifiedKeyboard} from '../src/connect-keyboard.js';
import {createPetPack} from '../src/pet-pack.js';
import {crc32} from '../src/crc32.js';
globalThis.indexedDB=indexedDB;
const profile={...DEVICE_PROFILES.athena1800};
function firmware(pid=0x4100){const b=new Uint8Array(512),v=new DataView(b.buffer);[0x0a324655,0x9e5d5157,0x2000,0x10000000,256,0,1,0xe48bff56].forEach((n,j)=>v.setUint32(j*4,n,true));b[32]=18;b[33]=1;b[40]=0x5b;b[41]=0x9d;b[42]=pid&255;b[43]=pid>>8;v.setUint32(508,0x0ab16f30,true);return b;}
async function fixture(layout='v2'){
 const uf2=firmware(),current=new Uint8Array(FLASH_BYTES).fill(255);current.set(decodeFirmwareUf2(uf2));current[100]=99;current.fill(0x3c,0x1f0000,0x200000);current.fill(0x77,0xe00000);
 const frame={data:new Uint16Array(16384).fill(0x5678),delay:100};const image=encodeQgf([frame],0);
 for(const off of [0x400000,0x500000,0x600000,0x800000])current.set(image,off);
 const release={model:profile.id,pid:profile.pid,version:'test',sha256:await digest(uf2),sources:[{layout,length:4096,sha256:await digest(current.subarray(0,4096))}]};
 return {uf2,current,release};
}
test('UF2 refuses foreign family, destination, flags and reordered blocks',()=>{
 for(const [pos,value] of [[8,0],[12,0x101f0000],[20,1],[28,0x12345678],[508,0]]){const b=firmware();new DataView(b.buffer).setUint32(pos,value,true);assert.throws(()=>decodeFirmwareUf2(b));}
 assert.equal(decodeFirmwareUf2(firmware()).length,4096);
});
test('v2 update preserves all EEPROM, images, pet and unrelated bytes; unknown sources and wrong models stop',async()=>{
 const {uf2,current,release}=await fixture();const plan=await planFirmwareUpgrade(current,uf2,release,profile);
 assert.deepEqual(plan.sectors,[0]);assert.deepEqual(plan.target.subarray(4096),current.subarray(4096));
 await assert.rejects(planFirmwareUpgrade(current,uf2,release,{...profile,pid:0x2513}));
 current[101]=15;await assert.rejects(planFirmwareUpgrade(current,uf2,release,profile),/尚未验证/);
 const other=firmware(0x2513);await assert.rejects(planFirmwareUpgrade(current,other,{...release,sha256:await digest(other)},profile),/硬件身份/);
});
test('legacy migration keeps the three daily animations, protects EEPROM, resources before main',async()=>{
 const {uf2,current,release}=await fixture('legacy');const plan=await planFirmwareUpgrade(current,uf2,release,profile);
 assert.deepEqual(plan.target.subarray(0x1f0000,0x400000),current.subarray(0x1f0000,0x400000));assert.deepEqual(plan.target.subarray(0xe00000),current.subarray(0xe00000));
 assert.deepEqual(plan.target.subarray(0x400000,0x400000+32816),current.subarray(0x500000,0x500000+32816));
 assert.ok(plan.target.subarray(0xa00000,0xe00000).every(b=>b===255));assert.equal(plan.sectors.at(-1),0);
 current[0x500000]=1;await assert.rejects(planFirmwareUpgrade(current,uf2,release,profile));
});
test('QGF normalization preserves full-frame pixels and rejects truncated and unsupported streams',()=>{
 const image=encodeQgf([{data:new Uint16Array(16384).fill(0x5678),delay:123}],0);assert.deepEqual(normalizeLegacyQgf(image),image);
 assert.throws(()=>normalizeLegacyQgf(image.subarray(0,image.length-1)));const bad=image.slice();bad[37]=7;assert.throws(()=>normalizeLegacyQgf(bad));
});
test('explicit legacy image reset accepts missing animations and clears every old image slot',async()=>{
 const {uf2,current,release}=await fixture('legacy');
 current.fill(255,0x500000,0x600000); // Missing daily image previously blocked migration.
 current.fill(0x52,0xa00000,0xe00000); // Includes the two final legacy animation locations.
 await assert.rejects(planFirmwareUpgrade(current,uf2,release,profile),/缺失或损坏/);
 const plan=await planFirmwareUpgrade(current,uf2,release,profile,{clearImages:true});
 assert.ok(plan.target.subarray(0x400000,0xe00000).every(b=>b===255));
 assert.deepEqual(plan.target.subarray(4096,0x400000),current.subarray(4096,0x400000));
 assert.deepEqual(plan.target.subarray(0xe00000),current.subarray(0xe00000));
 assert.equal(plan.sectors.at(-1),0);
 current[101]=15;
 await assert.rejects(planFirmwareUpgrade(current,uf2,release,profile,{clearImages:true}),/尚未验证/);
});
test('v2 image reset preserves pet, growth journal, keymap and all other non-image data',async()=>{
 const {uf2,current,release}=await fixture();current.fill(0x36,0xa00000,0xe00000);
 const plan=await planFirmwareUpgrade(current,uf2,release,profile,{clearImages:true});
 assert.ok(plan.target.subarray(0x400000,0xa00000).every(b=>b===255));
 assert.deepEqual(plan.target.subarray(4096,0x400000),current.subarray(4096,0x400000));
 assert.deepEqual(plan.target.subarray(0xa00000),current.subarray(0xa00000));
 const record=await saveFirmwareBackup(current,plan),memory=current.slice(),erased=[];
 const boot={async command(code,args,len,payload){if(code===6)return;const view=new DataView(args.buffer,args.byteOffset,args.byteLength),off=view.getUint32(0,true)-0x10000000,size=view.getUint32(4,true);if(code===0x84)return memory.slice(off,off+size);if(code===3){erased.push(off);memory.fill(255,off,off+size);}else if(code===5)memory.set(payload,off);else throw Error('Unexpected command');}};
 await writeFirmwarePlan(boot,plan,record.id);
 assert.deepEqual(memory,plan.target);assert.ok(erased.some(off=>off>=0x400000));
 assert.ok(erased.every(off=>off===0||(off>=0x400000&&off<0xa00000)));
 assert.equal((await getFirmwareBackup(record.id)).phase,'verified');
});
test('image reset transport refuses writes outside actual firmware and image boundaries before USB access',async()=>{
 const {uf2,current,release}=await fixture();
 for(const off of [4096,0x1f0000,0x200000,0xa00000,0xdfe000,0xe00000]){
  const plan=await planFirmwareUpgrade(current,uf2,release,profile,{clearImages:true});
  plan.target[off]^=1;plan.sectors.push(off);plan.targetSha256=await digest(plan.target);
  const record=await saveFirmwareBackup(current,plan);let commands=0;
  await assert.rejects(writeFirmwarePlan({command(){commands++;}},plan,record.id),/越界/);
  assert.equal(commands,0);
 }
});
test('audited rollback firmware requires valid v2 resources and preserves them during image reset',async()=>{
 const {uf2,current,release}=await fixture();release.sources[0].requiresV2Resources=true;
 await assert.rejects(planFirmwareUpgrade(current,uf2,release,profile,{clearImages:true}),/资源分区/);
 current.set(createPetPack('mint'),0xa00000);
 const page=current.subarray(0xdfe000,0xdfe100),v=new DataView(page.buffer,page.byteOffset,page.byteLength);
 page.fill(0);page.set([80,69,84,50]);v.setUint32(8,2316,true);page[16]=1;page[18]=80;v.setUint32(20,crc32(page.subarray(0,20)),true);
 const plan=await planFirmwareUpgrade(current,uf2,release,profile,{clearImages:true});
 assert.deepEqual(plan.target.subarray(0xa00000),current.subarray(0xa00000));
 assert.ok(plan.target.subarray(0x400000,0xa00000).every(b=>b===255));
 page[8]^=1;await assert.rejects(planFirmwareUpgrade(current,uf2,release,profile,{clearImages:true}),/资源分区/);
 page[8]^=1;current[0xa00004]=99;await assert.rejects(planFirmwareUpgrade(current,uf2,release,profile,{clearImages:true}),/资源分区/);
});
test('durable backup must match the whole plan before any USB command',async()=>{
 const {uf2,current,release}=await fixture();const plan=await planFirmwareUpgrade(current,uf2,release,profile),record=await saveFirmwareBackup(current,plan,'test-serial');
 assert.equal((await getFirmwareBackup(record.id)).sha256,await digest(current));
 let commands=0;const boot={command(){commands++;throw Error('Should not reach USB');}};
 await assert.rejects(writeFirmwarePlan(boot,plan,'missing'));assert.equal(commands,0);
 plan.target[4096]=4;await assert.rejects(writeFirmwarePlan(boot,plan,record.id));assert.equal(commands,0);
});
test('readback mismatch prevents reboot and leaves recovery record',async()=>{
 const {uf2,current,release}=await fixture();const plan=await planFirmwareUpgrade(current,uf2,release,profile),record=await saveFirmwareBackup(current,plan);
 const memory=current.slice(),ops=[];
 const boot={async command(code,args,len,payload){ops.push(code);if(code===6)return;const view=new DataView(args.buffer,args.byteOffset,args.byteLength),off=view.getUint32(0,true)-0x10000000,size=view.getUint32(4,true);
 if(code===0x84)return memory.slice(off,off+size);if(code===3)memory.fill(255,off,off+size);if(code===5){memory.set(payload,off);memory[off]^=1;}}};
 await assert.rejects(writeFirmwarePlan(boot,plan,record.id),/回读不一致/);assert.ok(ops.includes(3));assert.ok(!ops.includes(2));assert.equal((await getFirmwareBackup(record.id)).phase,'writing');
});
test('successful programming verifies the entire flash and never sends reboot itself',async()=>{
 const {uf2,current,release}=await fixture();const plan=await planFirmwareUpgrade(current,uf2,release,profile),record=await saveFirmwareBackup(current,plan);const memory=current.slice(),erased=[];
 const boot={async command(code,args,len,payload){if(code===6)return;const view=new DataView(args.buffer,args.byteOffset,args.byteLength),off=view.getUint32(0,true)-0x10000000,size=view.getUint32(4,true);if(code===0x84)return memory.slice(off,off+size);if(code===3){erased.push(off);memory.fill(255,off,off+size);}else if(code===5)memory.set(payload,off);else throw Error('Unexpected command');}};
 await writeFirmwarePlan(boot,plan,record.id);assert.deepEqual(erased,[0]);assert.deepEqual(memory,plan.target);assert.equal((await getFirmwareBackup(record.id)).phase,'verified');
 const recovery=recoveryUf2(current);assert.equal(recovery.length,FLASH_BYTES*2);assert.equal(new DataView(recovery.buffer).getUint32(12,true),0x10000000);
});
test('both original keyboard models use only keymap connection, never a private screen probe',async()=>{
 for(const id of ['athena75','athena1800']){let opens=0;const device={productName:'Original keyboard',async open(){opens++;this.opened=true;},async sendReport(){throw Error('Legacy must not probe screen');}};const runtime=await connectIdentifiedKeyboard({profile:{id},device});assert.equal(opens,1);assert.equal(runtime.capabilities.screen,false);}
});
test('unknown history requires explicit reset consent and a matching normal-mode keymap snapshot',async()=>{
 const {uf2,current,release}=await fixture();release.sources=[];release.compatibility={mode:'athena-rp2040-reset-v1',hardwareRevision:'original-rp2040-16mb',flashBytes:0x1000000};
 const evidence={confirmed:true,identity:{model:profile.id,vid:profile.vid,pid:profile.pid,uid:profile.uid},keymap:{format:'athena-keymap-v1',model:profile.id,uid:profile.uid,protocol:12,layers:profile.layers,rows:profile.rows,cols:profile.cols,layoutOptions:0,keycodes:Array(profile.layers*profile.rows*profile.cols).fill(4)}};
 await assert.rejects(planFirmwareUpgrade(current,uf2,release,profile,{clearImages:true}),{code:'COMPATIBILITY_RESET_REQUIRED'});
 await assert.rejects(planFirmwareUpgrade(current,uf2,release,profile,{clearImages:true,compatibilityReset:{...evidence,confirmed:false}}));
 await assert.rejects(planFirmwareUpgrade(current,uf2,release,profile,{clearImages:true,compatibilityReset:{...evidence,identity:{...evidence.identity,pid:0x2513}}}));
 const plan=await planFirmwareUpgrade(current,uf2,release,profile,{clearImages:true,compatibilityReset:evidence});
 assert(plan.resetSettings);assert.equal(plan.layout,'reset');assert(plan.target.subarray(0x1f0000,0x200000).every(b=>b===255));assert(plan.target.subarray(0x400000,0xe00000).every(b=>b===255));
 assert.deepEqual(plan.target.subarray(0x200000,0x400000),current.subarray(0x200000,0x400000));assert.deepEqual(plan.target.subarray(0xe00000),current.subarray(0xe00000));
 const record=await saveFirmwareBackup(current,plan);assert.deepEqual(record.resetEvidence,evidence);
 let commands=0;plan.target[0x200000]^=1;plan.sectors.push(0x200000);plan.targetSha256=await digest(plan.target);const corrupt=await saveFirmwareBackup(current,plan);
 await assert.rejects(writeFirmwarePlan({command(){commands++;}},plan,corrupt.id),/越界/);assert.equal(commands,0);
});
test('compatibility reset rejects aliased smaller flash even with matching model',async()=>{
 const {uf2,current,release}=await fixture();release.sources=[];release.compatibility={mode:'athena-rp2040-reset-v1',hardwareRevision:'original-rp2040-16mb',flashBytes:0x1000000};current.set(current.subarray(0,65536),0x800000);
 const evidence={confirmed:true,identity:{model:profile.id,vid:profile.vid,pid:profile.pid,uid:profile.uid},keymap:{format:'athena-keymap-v1',model:profile.id,uid:profile.uid,protocol:12,layers:profile.layers,rows:profile.rows,cols:profile.cols,layoutOptions:0,keycodes:Array(profile.layers*profile.rows*profile.cols).fill(4)}};
 await assert.rejects(planFirmwareUpgrade(current,uf2,release,profile,{clearImages:true,compatibilityReset:evidence}),/容量/);
});
test('compatibility reset requires backup, clears old settings and resources, preserves other flash, and verifies everything',async()=>{
 const {uf2,current,release}=await fixture();release.sources=[];release.compatibility={mode:'athena-rp2040-reset-v1',hardwareRevision:'original-rp2040-16mb',flashBytes:FLASH_BYTES};
 const evidence={confirmed:true,identity:{model:profile.id,vid:profile.vid,pid:profile.pid,uid:profile.uid},keymap:{format:'athena-keymap-v1',model:profile.id,uid:profile.uid,protocol:12,layers:8,rows:14,cols:8,layoutOptions:0,keycodes:Array(8*14*8).fill(4)}};
 const plan=await planFirmwareUpgrade(current,uf2,release,profile,{clearImages:true,compatibilityReset:evidence}),record=await saveFirmwareBackup(current,plan),memory=current.slice();let writes=0;
 const boot={async command(code,args,size,payload){if(code===6)return;const v=new DataView(args.buffer,args.byteOffset,args.byteLength),off=v.getUint32(0,true)-0x10000000,n=v.getUint32(4,true);if(code===0x84)return memory.slice(off,off+n);if(code===3){assert(off<0x200000||off>=0x400000&&off<0xe00000);memory.fill(255,off,off+n);writes++;}else if(code===5)memory.set(payload,off);else throw Error('No automatic reboot');}};
 await writeFirmwarePlan(boot,plan,record.id);assert(writes>0);assert.deepEqual(memory,plan.target);assert.equal((await getFirmwareBackup(record.id)).phase,'verified');
});
test('an already current program cannot be reinstalled even with image-clear confirmation',async()=>{
 const {uf2,current,release}=await fixture();current.set(decodeFirmwareUf2(uf2));await assert.rejects(planFirmwareUpgrade(current,uf2,release,profile,{clearImages:true}),{code:'ALREADY_CURRENT'});
});
