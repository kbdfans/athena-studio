import test from 'node:test';
import assert from 'node:assert/strict';
import {RuntimeHid,crc32} from '../src/runtime-hid.js';
import {ATHENA_UID} from '../src/device.js';
import {SLOTS,encodeQgf} from '../src/format.js';

class HidFake {
  opened=false;listeners=new Set();calls=[];data=[];received=0;badCommit=false;legacy=false;
  async open(){this.opened=true;}
  async close(){this.opened=false;}
  addEventListener(_,f){this.listeners.add(f);}
  removeEventListener(_,f){this.listeners.delete(f);}
  async sendReport(id,packet){
    assert.equal(id,0);const p=packet.slice(),v=new DataView(p.buffer);this.calls.push(p.slice());
    if(!this.legacy){const op=p[2],slot=p[4],count=p[5],offset=v.getUint32(6,true),payload=p.slice(10,10+count);p.fill(0,5);
      if(op===0){p.set(new TextEncoder().encode('ASU1'),6);p[10]=1;v.setUint32(14,SLOTS[slot].capacity,true);v.setUint32(18,SLOTS[slot].address-0x10000000,true);}
      if(op===1)for(let i=0;i<count;i++)p[6+i]=(offset+i)&255;
      if(op===2){this.received=0;this.data=[];}
      if(op===3){assert.equal(offset,this.received);this.received+=count;this.data.push(...payload);v.setUint32(6,this.received,true);}
      if(op===4)v.setUint32(6,crc32(this.data)^(this.badCommit?1:0),true);
    }
    queueMicrotask(()=>{for(const f of this.listeners)f({data:new DataView(p.buffer)});});
  }
}
test('CRC32 matches standard check vector',()=>assert.equal(crc32(new TextEncoder().encode('123456789')),0xcbf43926));
test('legacy echo cannot be mistaken for upload capability',async()=>{const d=new HidFake();d.legacy=true;assert.equal(await RuntimeHid.tryConnect(d,ATHENA_UID),null);assert.equal(d.opened,false);assert.equal(d.calls.length,1);});
test('runtime reader enforces bounds and reconstructs chunk offsets',async()=>{const d=new HidFake(),p=await RuntimeHid.tryConnect(d,ATHENA_UID);const bytes=await p.read(5,SLOTS[5].address+17,65);assert.deepEqual(Array.from(bytes),Array.from({length:65},(_,i)=>i+17));const n=d.calls.length;await assert.rejects(()=>p.read(5,SLOTS[5].address-1,10));assert.equal(d.calls.length,n);await p.close();});
test('runtime writer transmits exact content and verifies device commit CRC without reboot',async()=>{const d=new HidFake(),p=await RuntimeHid.tryConnect(d,ATHENA_UID);const bytes=encodeQgf([{data:new Uint16Array(16384).fill(0x1f),delay:100}],5);await p.program(5,bytes);assert.deepEqual(Uint8Array.from(d.data),bytes);assert.equal(d.calls.at(-1)[2],4);assert.ok(d.opened);assert.equal(d.listeners.size,0);await p.close();});
test('bad device readback checksum triggers explicit abort',async()=>{const d=new HidFake(),p=await RuntimeHid.tryConnect(d,ATHENA_UID);d.badCommit=true;await assert.rejects(()=>p.program(5,new Uint8Array(256)),/回读校验/);assert.equal(d.calls.at(-1)[2],5);await p.close();});
