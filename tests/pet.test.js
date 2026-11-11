import test from 'node:test';
import assert from 'node:assert/strict';
import {createPetPack,validatePetPack,petRgba,PET_PALETTES} from '../src/pet-pack.js';
import {SLOTS,encodeQgf,encodeUf2} from '../src/format-v2.js';
import {RuntimeV2,crc32} from '../src/runtime-v2.js';
import {ATHENA_UID} from '../src/device.js';
test('44 original cat frames fit 14 KiB; palette variants preserve pixels and decode to 40x32',()=>{
 const orange=createPetPack();assert.equal(orange.length,14336);assert.equal(orange.length-256,44*40*32/4);
 for(const theme of Object.keys(PET_PALETTES)){const p=createPetPack(theme);validatePetPack(p);assert.deepEqual(p.slice(256),orange.slice(256));for(let a=0;a<8;a++)for(let f=0;f<p[24+a];f++)assert.equal(petRgba(p,a,f).length,5120);}
 const bad=orange.slice();bad[12]^=1;assert.throws(()=>validatePetPack(bad));assert.throws(()=>petRgba(orange,8,0));
});
test('exactly three 2 MiB images; UF2 cannot enter pet partition',()=>{
 assert.equal(SLOTS.length,3);
 for(let i=0;i<3;i++){assert.equal(SLOTS[i].capacity,2097152);const frames=Array.from({length:63},()=>({data:new Uint16Array(16384),delay:100}));const q=encodeQgf(frames,i);assert.ok(q.length<=SLOTS[i].capacity);const uf=encodeUf2(q,i),v=new DataView(uf.buffer);assert.ok(v.getUint32(uf.length-512+12,true)+256<=0x10a00000);}
 assert.throws(()=>encodeQgf([],3));
});
class FakeHid{
 opened=false; listeners=new Set();calls=[];legacy=false;data=[];received=0;
 async open(){this.opened=true} async close(){this.opened=false}
 addEventListener(_,fn){this.listeners.add(fn)} removeEventListener(_,fn){this.listeners.delete(fn)}
 async sendReport(id,input){assert.equal(id,0);assert.equal(input[1],0xa8);this.calls.push(input.slice());const r=input.slice(),v=new DataView(r.buffer),op=r[2],slot=r[4],n=r[5],offset=v.getUint32(6,true),payload=r.slice(10,10+n);if(!this.legacy){r.fill(0,5);if(op===0){r.set(new TextEncoder().encode('ASU2'),6);r[10]=2;v.setUint32(14,slot===3?0x3fe000:0x200000,true);v.setUint32(18,[0x400000,0x600000,0x800000,0xa00000][slot],true);}if(op===2){this.data=[];this.received=0;}if(op===3){assert.equal(offset,this.received);this.received+=n;this.data.push(...payload);v.setUint32(6,this.received,true);}if(op===4)v.setUint32(6,crc32(this.data),true);if(op===16){r[6]=1;r[9]=2;r[10]=80;v.setUint32(12,222,true);r[29]=1;}}
 queueMicrotask(()=>{for(const f of this.listeners)f({data:new DataView(r.buffer)});});}
}
test('v2 refuses legacy echo and isolates pet uploads from save journal',async()=>{
 const old=new FakeHid();old.legacy=true;assert.equal(await RuntimeV2.tryConnect(old,ATHENA_UID),null);assert.equal(old.opened,false);
 const d=new FakeHid(),p=await RuntimeV2.tryConnect(d,ATHENA_UID);const before=d.calls.length;await assert.rejects(()=>p.read(3,0x10dfe000,24));assert.equal(before,d.calls.length);
 const pack=createPetPack();await p.program(3,pack);assert.deepEqual(Uint8Array.from(d.data),pack);const s=await p.petCommand();assert.equal(s.xp,222);assert.equal(s.mode,1);assert.equal(s.level,2);await p.close();
});

test('variable timings, clamped one-shots, invalid frame rejection and legacy backup validation',async()=>{
 const {petFrame,petStage}=await import('../src/pet-pack.js');const p=createPetPack();
 assert.equal(petFrame(p,0,649),0);assert.equal(petFrame(p,0,650),1);assert.equal(petFrame(p,0,2200),0);
 assert.equal(petFrame(p,2,95),1);assert.equal(petFrame(p,6,10000),7);
 assert.equal(petStage(9),0);assert.equal(petStage(10),1);assert.equal(petStage(200),2);
 for(const [offset,value] of [[24,9],[32,44],[96,0]]){const bad=p.slice();bad[offset]=value;if(offset===96)bad[97]=0;assert.throws(()=>validatePetPack(bad));}
 const {createPetPack:legacy}=await import('../src/pet-legacy.js');validatePetPack(legacy());
});
test('typing transitions, uninterruptible jump, wake-before-walk and bounded screen rendering',async()=>{
 const {PetMotion,petPreview}=await import('../src/pet-preview.js');const m=new PetMotion(0);
 for(let n=100;n<=2200;n+=100){m.key(n);m.tick(n);}
 assert.equal(m.tick(2250).action,2);m.key(2300,true);assert.equal(m.tick(2790).jump,24);
 m.key(2790,true);assert.equal(m.tick(3350).jump,0);assert.notEqual(m.tick(3350).action,6);
 assert.equal(m.tick(4000).action,0);assert.equal(m.tick(33000).action,3);
 m.key(33001);assert.equal(m.tick(33001).action,7);m.key(33100);assert.equal(m.tick(33100).action,7);assert.equal(m.tick(35000).action,0);
 for(let stage=0;stage<3;stage++)for(let a=0;a<8;a++){const pixels=petPreview(createPetPack(),a,490,stage);assert.equal(pixels.length,65536);assert.ok(pixels.some(x=>x));for(let i=3;i<pixels.length;i+=4)assert.equal(pixels[i],255);}
});

test('1800 screen runtime retains its profile; old firmware stays keymap-only; foreign identities rejected',async()=>{
 const {connectIdentifiedKeyboard}=await import('../src/connect-keyboard.js');
 const {DEVICE_PROFILES}=await import('../src/device-profiles.js');
 const old=new FakeHid();old.vendorId=0x9d5b;old.productId=0x4100;old.productName='Athena 1800 Keybaord (VIAL_DP8M)';
 const identity={device:old,profile:DEVICE_PROFILES.athena1800,uid:ATHENA_UID};
 const legacy=await connectIdentifiedKeyboard(identity);assert.equal(legacy.capabilities.screen,false);assert.equal(old.calls.length,0);await legacy.close();
 old.productName='Athena1800 Screen Studio v2';const screen=await connectIdentifiedKeyboard(identity);
 assert.equal(screen.profile.id,'athena1800');assert.equal(screen.profile.rows,14);assert.equal(screen.capabilities.screen,true);assert.equal(old.calls.length,5);await screen.close();
 old.vendorId=1;await assert.rejects(()=>RuntimeV2.tryConnect(old,ATHENA_UID));assert.equal(old.calls.length,5);
 old.vendorId=0x9d5b;await assert.rejects(()=>RuntimeV2.tryConnect(old,'0000000000000000'));assert.equal(old.calls.length,5);
 old.legacy=true;assert.equal(await connectIdentifiedKeyboard(identity),null);assert.equal(old.opened,false);
});
