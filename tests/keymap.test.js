import {DEVICE_PROFILES,identifyProfile,profileForMap} from "../src/device-profiles.js";
import {profileLayout} from "../src/profile-layouts.js";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  KeymapDevice,
  viaExchange,
  changesBetween,
  validateKeymap,
  keyIndex,
} from "../src/keymap-protocol.js";
import { RuntimeV2 } from "../src/runtime-v2.js";
import { keyboardLayout, layoutChoices, withLayoutChoice } from "../src/keyboard-layout.js";
import { keyInfo, parseKeycode } from "../src/keycodes.js";
const definition = JSON.parse(
  fs.readFileSync(new URL("../src/athena-definition.json", import.meta.url)),
);
class Hid {
  profile=DEVICE_PROFILES.athena75;
  opened = true;
  listeners = new Set();
  calls = [];
  keys = Array.from({ length: 704 }, (_, i) => (i * 31) % 65536);
  options = 10;
  ignoreWrite = false;
  unlocked = true;
  matrix = [0,1,2,4,8,16,32,64,128,0,1];
  fail = false;
  hold = false;
  addEventListener(_, fn) {
    this.listeners.add(fn);
  }
  removeEventListener(_, fn) {
    this.listeners.delete(fn);
  }
  async close() {
    this.opened = false;
  }
  emit(r) {
    for (const fn of this.listeners) fn({ data: new DataView(r.buffer) });
  }
  async sendReport(id, p) {
    assert.equal(id, 0);
    assert.equal(p.length, 32);
    this.calls.push([...p]);
    if (this.fail) throw Error("USB disconnected");
    if (this.hold) return;
    const r = p.slice();
    switch (p[0]) {
      case 1:
        r[1] = 0;
        r[2] = 12;
        break;
      case 17:
        r[1] = 8;
        break;
      case 2:
        if (p[1] === 3) r.set(this.matrix, 2);
        else { assert.equal(p[1], 2); new DataView(r.buffer).setUint32(2, this.options); }
        break;
      case 3:
        assert.equal(p[1], 2);
        if (!this.ignoreWrite) this.options = new DataView(p.buffer, p.byteOffset, p.byteLength).getUint32(2);
        break;
      case 254:
        assert.equal(p[1], 5);
        r.fill(255); r[0] = Number(this.unlocked); r[1] = 0;
        break;
      case 18: {
        const offset = p[1] * 256 + p[2],
          count = p[3];
        assert.ok(count <= 28);
        for (let i = 0; i < count; i++) {
          const byte = offset + i,
            code = this.keys[byte >> 1];
          r[4 + i] = byte % 2 ? code & 255 : code >> 8;
        }
        break;
      }
      case 5:
        if (!this.ignoreWrite)
          this.keys[keyIndex(p[1], p[2], p[3],this.profile)] = p[4] * 256 + p[5];
        break;
      case 4: {
        const code = this.keys[keyIndex(p[1], p[2], p[3],this.profile)];
        r[4] = code >> 8;
        r[5] = code & 255;
        break;
      }
      default:
        throw Error("Unexpected command " + p[0]);
    }
    queueMicrotask(() => {
      const noise = new Uint8Array(32);
      noise.set([0xfd, 0xa8, 16]);
      this.emit(noise);
      this.emit(r);
    });
  }
}
const setup = () => {
  const hid = new Hid(),
    runtime = new RuntimeV2(hid),
    api = new KeymapDevice(runtime);
  return { hid, runtime, api };
};
test("reads all 8 layers with big endian keycodes and layout options", async () => {
  const { hid, api } = setup();
  const m = await api.read();
  validateKeymap(m);
  assert.deepEqual(m.keycodes, hid.keys);
  assert.equal(m.layoutOptions, 10);
  assert.equal(hid.calls.filter((p) => p[0] === 18).length, 51);
  assert.ok(hid.calls.every((p) => [1, 17, 2, 18].includes(p[0])));
});
test("backup precedes writes; only changed matrix keys are written and full map is verified", async () => {
  const { hid, api } = setup();
  const before = await api.read(),
    after = structuredClone(before);
  after.keycodes[0] = 0xae;
  after.keycodes[703] = 0x5221;
  let backup = false;
  const result = await api.apply(before, after, async (b) => {
    assert.deepEqual(b, before);
    assert.equal(
      hid.calls.some((p) => p[0] === 5),
      false,
    );
    backup = true;
  });
  assert.ok(backup);
  assert.deepEqual(result, after);
  assert.equal(hid.calls.filter((p) => p[0] === 5).length, 2);
  assert.ok(
    hid.calls.every((p) => ![3, 6, 10, 11, 19, 253, 254].includes(p[0])),
  );
});
test("stale map, failed backup and layout mismatch all block writes", async () => {
  for (const failure of ["conflict", "backup", "layout"]) {
    const { hid, api } = setup(),
      before = await api.read(),
      after = structuredClone(before);
    after.keycodes[17] = 4;
    if (failure === "conflict") hid.keys[100] ^= 1;
    if (failure === "layout") after.layoutOptions = 42;
    await assert.rejects(() =>
      api.apply(before, after, async () => {
        if (failure === "backup") throw Error("quota");
      }),
    );
    assert.equal(
      hid.calls.some((p) => p[0] === 5),
      false,
    );
  }
});
test("write echoes are insufficient: independent readback detects rejected writes", async () => {
  const { hid, api } = setup(),
    before = await api.read(),
    after = structuredClone(before);
  after.keycodes[0] = 4;
  hid.ignoreWrite = true;
  await assert.rejects(
    () => api.apply(before, after, async () => {}),
    /回读失败.*0\/1/,
  );
});
test("VIA shares the runtime lock, filters unrelated reports and releases listeners", async () => {
  const { hid, runtime } = setup();
  hid.hold = true;
  const p = viaExchange(
    runtime,
    [4, 2, 3, 4],
    (r) => r[1] === 2 && r[2] === 3 && r[3] === 4,
  );
  assert.equal(runtime.pending, true);
  await assert.rejects(() => runtime.command(16, 0));
  await assert.rejects(() => viaExchange(runtime, [1], () => true));
  const wrong = new Uint8Array(32);
  wrong.set([4, 2, 3, 5]);
  hid.emit(wrong);
  assert.equal(runtime.pending, true);
  const reply = new Uint8Array(32);
  reply.set([4, 2, 3, 4, 0x52, 0x21]);
  hid.emit(reply);
  assert.equal((await p)[4], 0x52);
  assert.equal(runtime.pending, false);
  assert.equal(hid.listeners.size, 0);
  hid.hold = false;
  hid.fail = true;
  await assert.rejects(
    () => viaExchange(runtime, [1], () => true),
    /disconnected/,
  );
  assert.equal(runtime.broken, true);
  assert.equal(hid.listeners.size, 0);
});
test("imports reject wrong UID, dimensions, unsafe keycodes and malformed hex", async () => {
  const { api } = setup(),
    map = await api.read();
  for (const update of [
    { uid: "other" },
    { layers: 7 },
    { protocol: 9 },
    { rows: 12 },
    { layoutOptions: -1 },
    { keycodes: [...map.keycodes, 4] },
  ])
    assert.throws(() => validateKeymap({ ...map, ...update }));
  for (const k of [NaN, -1, 65536, 1.5, "4"]) {
    const bad = structuredClone(map);
    bad.keycodes[3] = k;
    assert.throws(() => validateKeymap(bad));
  }
  assert.equal(parseKeycode("0x5221"), 0x5221);
  assert.throws(() => parseKeycode("5221"));
  assert.equal(keyInfo(0xae).label, "播放 / 暂停");
  assert.equal(keyInfo(0x7e04).label, "切换图片");
  assert.equal(keyInfo(0x7210).label, "0x7210");
});
test("all 16 physical layout variants retain unique matrix positions inside the keyboard", () => {
  assert.deepEqual(
    layoutChoices(definition.layouts.labels, 10),
    [0, 0, 0, 0, 1, 2],
  );
  assert.equal(keyboardLayout(definition, 10).length, 81);
  for (let v = 0; v < 16; v++) {
    const keys = keyboardLayout(definition, 10 | (v << 5));
    assert.equal(
      new Set(keys.map((k) => `${k.row},${k.col}`)).size,
      keys.length,
    );
    for (const k of keys) {
      assert.ok(k.x + Math.min(k.x2, 0) >= 0);
      assert.ok(k.y >= 0);
      assert.ok(k.x + Math.max(k.w, k.w2) <= 16.5);
      assert.ok(k.y + k.h <= 6.25);
      assert.ok(k.row < 11 && k.col < 8);
    }
  }
});

test("consecutive immediate assignments and undo keep verified baselines; no-op does not write", async () => {
  const { hid, api } = setup();
  const original = await api.read();
  let current = original;
  const backups = [];
  const save = async (map) => backups.push(structuredClone(map));
  for (const code of [104, 105, original.keycodes[696]]) {
    const next = structuredClone(current);
    next.keycodes[696] = code;
    current = await api.apply(current, next, save);
    assert.equal(hid.keys[696], code);
    assert.deepEqual(current.keycodes, hid.keys);
  }
  await api.apply(current, structuredClone(current), save);
  assert.equal(backups.length, 3);
  assert.equal(backups[1].keycodes[696], 104);
  assert.equal(backups[2].keycodes[696], 105);
  assert.equal(hid.calls.filter((p) => p[0] === 5).length, 3);
  assert.deepEqual(current, original);
});

test("partial import failure stops further writes and can be recovered from a fresh read", async () => {
  const { hid, api } = setup();
  const before = await api.read(), after = structuredClone(before);
  after.keycodes[0] = 104;
  after.keycodes[1] = 105;
  after.keycodes[2] = 106;
  let saved;
  await assert.rejects(() => api.apply(before, after,
    async (map) => { saved = structuredClone(map); },
    (n) => { if (n === 1) hid.ignoreWrite = true; }), /已确认写入 1\/3/);
  assert.deepEqual(saved, before);
  assert.equal(hid.calls.filter((p) => p[0] === 5).length, 2);
  const actual = await api.read();
  assert.equal(actual.keycodes[0], 104);
  assert.equal(actual.keycodes[1], before.keycodes[1]);
  hid.ignoreWrite = false;
  assert.deepEqual(await api.apply(actual, before, async () => {}), before);
});


test("matrix tester checks existing unlock status and reads 11 row masks without mutations", async () => {
  const { hid, api } = setup();
  assert.equal(await api.matrixAvailable(), true);
  assert.deepEqual(await api.readMatrix(), hid.matrix);
  hid.unlocked = false;
  assert.equal(await api.matrixAvailable(), false);
  assert.ok(hid.calls.every(p => (p[0] === 254 && p[1] === 5) || (p[0] === 2 && p[1] === 3)));
});


test("layout writes preserve keys and unrelated settings, back up first and verify readback", async () => {
  const { hid, api } = setup();
  const before = await api.read();
  const options = [1,2,3].reduce((v,g)=>withLayoutChoice(v,g,1),before.layoutOptions);
  let backed = false;
  const after = await api.applyLayout(before, options, async snapshot => {
    assert.deepEqual(snapshot,before);
    assert.equal(hid.calls.filter(p=>p[0]===3).length,0); backed = true;
  });
  assert.ok(backed);
  assert.equal(after.layoutOptions,234);
  assert.equal(after.layoutOptions & 31,before.layoutOptions & 31);
  assert.deepEqual(after.keycodes,before.keycodes);
  assert.deepEqual(hid.calls.find(p=>p[0]===3).slice(0,6),[3,2,0,0,0,234]);
  assert.equal(hid.calls.filter(p=>p[0]===5).length,0);
  const restored = await api.applyLayout(after,before.layoutOptions,async()=>{});
  assert.deepEqual(restored,before);
});
test("layout stale baseline, backup failure, ignored write and unrelated bits cannot report success", async () => {
  for (const scenario of ['stale','backup','ignored','reserved','unsupported']) {
    const {hid,api}=setup(), before=await api.read();
    let options=withLayoutChoice(before.layoutOptions,1,1);
    if(scenario==='unsupported') options=withLayoutChoice(before.layoutOptions,0,1);
    if(scenario==='stale') hid.options=42;
    if(scenario==='ignored') hid.ignoreWrite=true;
    if(scenario==='reserved') options^=1;
    await assert.rejects(api.applyLayout(before,options,async()=>{
      if(scenario==='backup') throw Error('backup failed');
    }));
    if(scenario!=='ignored') assert.equal(hid.calls.filter(p=>p[0]===3).length,0);
  }
});
test("all physical layout choices preserve other bits and 7U bottom-row geometry", () => {
  let options=10;
  for(let group=0;group<4;group++)options=withLayoutChoice(options,group,1);
  assert.deepEqual(layoutChoices(definition.layouts.labels,options),[1,1,1,1,1,2]);
  const bottom=keyboardLayout(definition,options).filter(k=>k.group===3).sort((a,b)=>a.x-b.x);
  assert.deepEqual(bottom.map(k=>k.w),[1.5,1,1.5,7,1.5]);
  assert.deepEqual(bottom.map(k=>k.x),[0,1.5,2.5,4,11]);
  assert.throws(()=>withLayoutChoice(10,4,1));
  assert.throws(()=>withLayoutChoice(10,0,2));
});

test('1800 uses 14x8 matrix, separate identity and all eight layers without screen transport',async()=>{
 const profile=DEVICE_PROFILES.athena1800,h=new Hid();h.profile=profile;h.options=0;h.keys=Array.from({length:896},(_,i)=>i);h.matrix=Array(14).fill(0);h.matrix[13]=8;
 const runtime={device:h,profile,pending:false,broken:false},api=new KeymapDevice(runtime);
 const before=await api.read();assert.equal(before.model,'athena1800');assert.equal(before.keycodes.length,896);assert.equal((await api.readMatrix())[13],8);
 const after={...before,keycodes:[...before.keycodes]};after.keycodes[keyIndex(7,13,7,profile)]=42;let backups=0;
 const saved=await api.apply(before,after,async()=>backups++);assert.equal(saved.keycodes[895],42);assert.equal(backups,1);
 assert.equal(identifyProfile({vendorId:profile.vid,productId:profile.pid},profile.uid),profile);
 assert.equal(identifyProfile({vendorId:profile.vid,productId:0xffff},profile.uid),null);
 const {model,...legacy}=before;assert.throws(()=>profileForMap(legacy));
 await assert.rejects(new KeymapDevice({profile:DEVICE_PROFILES.athena75}).apply(before,after,async()=>{}));
 await assert.rejects(api.applyLayout(before,0x100,async()=>{}));
 assert(!h.calls.some(p=>p[0]===0xfd));
});
test('model layouts have unique valid switch coordinates and square 1U geometry',()=>{
 for(const p of Object.values(DEVICE_PROFILES))for(const options of p.id==="athena1800"?Array.from({length:8},(_,i)=>i<<8):[p.layoutOptions,p.physicalMask]){
  const {keys,board,defaults}=profileLayout(p,options);assert(keys.length>75);assert.equal(new Set(keys.map(k=>`${k.row},${k.col}`)).size,keys.length);
  for(const k of keys){assert(k.row<p.rows&&k.col<p.cols);assert(k.x>=0&&k.y>=0);assert((k.x+k.w)*19-1<=board.width+.001);assert((k.y+k.h)*19-1<=board.height+.001);}
  assert.equal(defaults.length,p.rows*p.cols*p.layers);
 }
});
