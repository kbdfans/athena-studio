import test from 'node:test';
import assert from 'node:assert/strict';
import {ZmkRuntime} from '../src/zmk-runtime.js';
import {validateZmkData,validBinding,zmkGeometry,keypressBehavior} from '../src/zmk-model.js';
import {fakeZmk} from './helpers/zmk-fixture.js';
const clone=structuredClone;
const binding=n=>({behaviorId:7,param1:0x70000+n,param2:0});
const runtime=async(fake=fakeZmk())=>{const r=new ZmkRuntime(fake,{saveDelay:60000});await r.initialize();return r;};
test('connect only reads, retains real layer ids, and supports metadata-driven bindings',async()=>{
 const f=fakeZmk(),r=await runtime(f);assert.equal(r.profile.name,'Tofu60 BLE');assert.equal(r.map.layers[0].id,3);assert.equal(f.saved,0);
 assert.equal(keypressBehavior(r.behaviors).id,7);assert(validBinding({behaviorId:12,param1:9,param2:0},r.behaviors,r.map.layers));assert(!validBinding({behaviorId:12,param1:1,param2:0},r.behaviors,r.map.layers));
 await r.close();assert.equal(f.saved,0);
});
test('rapid edits serialize, commit once, survive simulated power loss and undo persists',async()=>{
 const f=fakeZmk(),r=await runtime(f);
 await Promise.all([r.assign(3,0,binding(10)),r.assign(3,0,binding(11)),r.assign(9,1,binding(12))]);
 assert.equal(f.saved,0);assert.equal(f.map.layers[0].bindings[0].param1,0x7000b);assert(r.dirty);
 await r.flush();assert.equal(f.saved,1);f.powerCycle();assert.equal(f.map.layers[1].bindings[1].param1,0x7000c);assert(!r.dirty);
 await r.undo();await r.flush();f.powerCycle();assert.equal(f.map.layers[1].bindings[1].param1,0x70008);await r.close();
});
test('save errors never claim persisted state and can be explicitly retried',async()=>{
 const f=fakeZmk(),r=await runtime(f);await r.assign(3,0,binding(10));f.saveError=3;await assert.rejects(r.flush(),/空间不足/);assert(r.dirty);assert(r.error);
 await assert.rejects(r.assign(3,1,binding(11)),/同步未确认/);f.saveError=null;await r.flush();assert(!r.dirty);assert.equal(r.error,null);await r.close();
});
test('layout changes flush pending keys, preserve both layers, verify and persist selection',async()=>{
 const f=fakeZmk(),r=await runtime(f);await r.assign(9,1,binding(17));await r.selectLayout(1);assert.equal(f.saved,2);assert.equal(r.physical.activeLayoutIndex,1);
 await r.assign(3,2,binding(18));await r.flush();f.powerCycle();assert.equal(f.physical.activeLayoutIndex,1);assert.equal(f.map.layers[1].bindings[1].param1,0x70011);await r.close();
});
test('preexisting device changes require explicit choice and are never saved on read',async()=>{
 const f=fakeZmk();f.setDirty();const r=await runtime(f);assert(r.preexistingDirty);assert.equal(f.saved,0);await assert.rejects(r.assign(3,0,binding(12)),/之前未保存/);await r.resolveExisting(false);assert(!r.dirty);assert.equal(f.saved,0);await r.close();
});
test('locked and disconnected keyboards never receive mutations; no timer replay',async()=>{
 const f=fakeZmk();f.locked=true;const r=await runtime(f);assert(r.locked);assert(!r.map);f.locked=false;await r.reload();await r.assign(3,0,binding(10));r.disconnected();await assert.rejects(r.flush(),/断开/);assert.equal(f.saved,0);
});
test('malformed geometry, missing positions and unsupported parameters stop before writes',async()=>{
 const f=fakeZmk(),r=await runtime(f),before=f.ops.length;await assert.rejects(r.assign(3,2,binding(10)));await assert.rejects(r.assign(3,0,{behaviorId:9,param1:0,param2:0}));assert.equal(f.ops.length,before);
 const p=clone(f.physical);p.layouts[0].keys[0].width=0;assert.throws(()=>validateZmkData(f.map,p));
 const g=zmkGeometry(f.physical.layouts[0]);assert.equal(g.board.width,37);assert.equal(g.board.height,18);await r.close();
});
test('automatic timer saves without a manual save button',async()=>{
 const f=fakeZmk(),r=new ZmkRuntime(f,{saveDelay:5});await r.initialize();await r.assign(3,0,binding(10));await new Promise(resolve=>setTimeout(resolve,30));await r.tail;assert.equal(f.saved,1);assert(!r.dirty);await r.close();
});

test('closing with existing dirty changes does not commit them',async()=>{
 const f=fakeZmk();f.setDirty();const r=await runtime(f);await r.close();assert.equal(f.saved,0);assert(f.closed);
});
test('unverified readback cancels pending autosave and requires a fresh read',async()=>{
 const f=fakeZmk(),r=await runtime(f);await r.assign(3,0,binding(10));f.readbackError=true;await assert.rejects(r.assign(3,0,binding(11)),/回读/);assert(r.uncertain);await assert.rejects(r.flush(),/重新读取/);assert.equal(f.saved,0);f.readbackError=false;await r.reload();assert(r.preexistingDirty);await r.resolveExisting(true);assert.equal(f.saved,1);await r.close();
});

test('zero-parameter metadata permits transparent and none but rejects invented parameters',()=>{
 const behaviors=[{id:1,displayName:'Transparent',metadata:[]},{id:2,displayName:'None',metadata:[]}];
 for(const behaviorId of [1,2]){assert(validBinding({behaviorId,param1:0,param2:0},behaviors,[]));assert(!validBinding({behaviorId,param1:1,param2:0},behaviors,[]));}
});
