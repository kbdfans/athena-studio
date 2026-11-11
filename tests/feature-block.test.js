import test from 'node:test';
import assert from 'node:assert/strict';
import { featureBlock, hasFeatureTransport, FEATURE_SIZE, BLOCK_DATA } from '../src/feature-block.js';
import { RuntimeV2, crc32 } from '../src/runtime-v2.js';

class FeatureHid {
  opened = true; listeners = new Set(); calls = []; data = []; block = null;
  collections = [{ featureReports: [{ reportId: 0, items: [{ reportSize: 8, reportCount: 4096 }] }] }];
  capability = true; badOffset = false; badCrc = false; badBlock = false; rejectFeature = false;
  addEventListener(_, f) { this.listeners.add(f); }
  removeEventListener(_, f) { this.listeners.delete(f); }
  async close() { this.opened = false; }
  async sendFeatureReport(id, data) {
    assert.equal(id, 0); assert.equal(data.length, FEATURE_SIZE);
    if (this.rejectFeature) throw Error('Feature rejected');
    this.block = data.slice();
  }
  async sendReport(_, request) {
    this.calls.push(request.slice());
    const r = request.slice(), v = new DataView(r.buffer), op = r[2]; r.fill(0, 5);
    if (op === 7) {
      if (!this.capability) r[5] = 1;
      else { r.set(new TextEncoder().encode('FST1'),6); v.setUint16(10,FEATURE_SIZE,true); v.setUint16(12,BLOCK_DATA,true); r[14]=1; }
    }
    if (op === 2) this.data=[];
    if (op === 8) {
      const b = this.block, bv = new DataView(b.buffer), n = bv.getUint16(8,true), at = bv.getUint32(4,true);
      assert.equal(b[3], request[4]); assert.equal(at, this.data.length);
      assert.equal(at, new DataView(request.buffer).getUint32(6,true));
      assert.equal(bv.getUint32(12,true), crc32(b.slice(16,16+n)));
      this.data.push(...b.slice(16,16+n));
      if (this.badBlock) r[5]=5;
      v.setUint32(6,this.data.length+(this.badOffset?1:0),true);
    }
    if (op === 4) {
      v.setUint32(6,crc32(this.data)^(this.badCrc?1:0),true);
      [1200,500,30,2,129].forEach((n,i)=>v.setUint32(10+i*4,n,true));r[30]=1;
    }
    queueMicrotask(()=>{ for(const f of this.listeners) f({data:new DataView(r.buffer)}); });
  }
}
test('Feature descriptor required; packet has independent length, offset and payload CRC', () => {
  assert.equal(hasFeatureTransport(new FeatureHid()),true);
  assert.equal(hasFeatureTransport({sendFeatureReport(){},collections:[]}),false);
  const bytes = new Uint8Array(4080).fill(153), b=featureBlock(2,4080,bytes), v=new DataView(b.buffer);
  assert.equal(b.length,4096);assert.equal(v.getUint32(12,true),crc32(bytes));
  assert.deepEqual(b.slice(16),bytes);assert.equal(v.getUint16(8,true),4080);
  assert.throws(()=>featureBlock(0,0,new Uint8Array(4081)));
  assert.throws(()=>featureBlock(4,0,bytes));
});
test('4096-byte transport reconstructs full input including partial tail and final CRC', async () => {
  const d=new FeatureHid(),p=new RuntimeV2(d),bytes=Uint8Array.from({length:32796},(_,i)=>i%233),progress=[];
  await p.program(2,bytes,n=>progress.push(n));
  assert.deepEqual(Uint8Array.from(d.data),bytes);
  assert.equal(d.calls.filter(c=>c[2]===8).length,9);
  assert.ok(!d.calls.some(c=>c[2]===3));assert.equal(d.calls.at(-1)[2],4);
  assert.equal(progress.at(-1),1);assert.equal(p.lastTransfer.mode,'feature4k');
  assert.deepEqual(p.lastTransfer.flash,{eraseMs:1200,programMs:500,verifyMs:30,erases:2,programs:129});
});
test('old or unsupported firmware stays on existing transfer path before BEGIN',async()=>{
  for(const advertised of [true,false]){
    const d=new FeatureHid();d.capability=false;if(!advertised)d.collections=[];
    const p=new RuntimeV2(d);assert.equal(await p.fastCapabilities(),false);
    assert.ok(!d.calls.some(c=>c[2]===2));assert.equal(d.calls.length,advertised?1:0);
  }
});
test('block rejection, wrong acknowledgement, and bad final CRC abort without false success',async()=>{
  for(const field of ['badBlock','badOffset','badCrc']){
    const d=new FeatureHid();d[field]=true;const p=new RuntimeV2(d);
    await assert.rejects(p.program(0,new Uint8Array(5000)));
    assert.equal(d.calls.at(-1)[2],5);assert.equal(p.lastTransfer,null);
    if(field!=='badCrc')assert.ok(!d.calls.some(c=>c[2]===4));
  }
});
test('Feature transport failure never falls back after BEGIN or commits uncertain data',async()=>{
  const d=new FeatureHid();d.rejectFeature=true;const p=new RuntimeV2(d);
  await assert.rejects(p.program(0,new Uint8Array(5000)),/Feature rejected/);
  assert.equal(p.broken,true);assert.equal(d.opened,false);
  assert.ok(!d.calls.some(c=>[3,4,8].includes(c[2])));
});
