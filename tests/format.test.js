import test from "node:test";
import assert from "node:assert/strict";
import {
  SLOTS,
  encodeQgf,
  encodeUf2,
  inspectQgf,
  optimizeFrames,
  assertRange,
  pixels565,
  rgba565,
  qgfSize,
} from "../src/format.js";
const frame = (color = 0xf800, delay = 100) => ({
  data: new Uint16Array(16384).fill(color),
  delay,
});
test("QGF bytes match known device headers, endian and frame offsets", () => {
  const data = encodeQgf(
    Array.from({ length: 8 }, () => frame()),
    1,
  );
  assert.equal(
    Buffer.from(data.slice(0, 28)).toString("hex"),
    "00ff12000051474601bc00040043fffbff80008000080001fe200000",
  );
  assert.equal(data.length, 262332);
  const v = new DataView(data.buffer);
  assert.equal(v.getUint32(28, true), 60);
  assert.equal(v.getUint16(60 + 9, true), 100);
  assert.equal(v.getUint16(60 + 16, false), 0xf800);
  assert.equal(v.getUint32(56, true), 60 + 7 * 32784);
  assert.equal(inspectQgf(data, 1).frames, 8);
  for (const [frames, bytes] of [
    [19, 623000],
    [24, 786940],
    [31, 1016456],
  ])
    assert.equal(qgfSize(frames), bytes);
});
test("all slot budgets enforced; no overflow into firmware or neighbors", () => {
  for (let i = 0; i < 6; i++) {
    const s = SLOTS[i];
    const data = encodeQgf(
      Array.from({ length: s.maxFrames }, () => frame()),
      i,
    );
    assert.ok(data.length < s.capacity);
    assert.throws(() =>
      encodeQgf(
        Array.from({ length: s.maxFrames + 1 }, () => frame()),
        i,
      ),
    );
    assert.throws(() => assertRange(i, s.address - 1, 256));
    assert.throws(() => assertRange(i, s.address + s.capacity - 128, 256));
    assert.throws(() => assertRange(i, 0x10000000, 256));
  }
  assert.throws(() => encodeQgf([], 2));
  assert.throws(() => encodeQgf([frame(0, 65536)], 2));
  assert.throws(() => encodeQgf([frame(0, 0)], 2));
});
test("UF2 stays in selected slot and reconstructs exact resource", () => {
  const source = encodeQgf([frame(0x07e0, 200), frame(0x001f, 300)], 5),
    uf2 = encodeUf2(source, 5),
    v = new DataView(uf2.buffer),
    restored = new Uint8Array(Math.ceil(source.length / 256) * 256);
  for (let o = 0, i = 0; o < uf2.length; o += 512, i++) {
    assert.equal(v.getUint32(o, true), 0x0a324655);
    assert.equal(v.getUint32(o + 4, true), 0x9e5d5157);
    assert.equal(v.getUint32(o + 12, true), SLOTS[5].address + i * 256);
    assert.equal(v.getUint32(o + 28, true), 0xe48bff56);
    assert.equal(v.getUint32(o + 508, true), 0x0ab16f30);
    restored.set(uf2.slice(o + 32, o + 288), i * 256);
  }
  assert.deepEqual(restored.slice(0, source.length), source);
});
test("optimization reduces frames without shortening playback and merges duplicates", () => {
  const input = Array.from({ length: 240 }, (_, i) => ({
    ...frame(i % 4, 20 + (i % 7)),
    sourceIndex: i,
  }));
  for (const n of [31, 63]) {
    const output = optimizeFrames(input, n, 15);
    assert.ok(output.length <= n);
    assert.equal(
      output.reduce((n, f) => n + f.delay, 0),
      input.reduce((n, f) => n + f.delay, 0),
    );
    assert.equal(output[0].sourceIndex, 0);
  }
  const duplicates = optimizeFrames([frame(), frame(), frame()], 63, 30);
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].delay, 300);
});
test("invalid resource headers rejected; empty slot recognized", () => {
  assert.deepEqual(inspectQgf(new Uint8Array(256).fill(255), 2), {
    empty: true,
  });
  assert.equal(inspectQgf(new Uint8Array(0), 2), null);
  const d = encodeQgf([frame()], 2);
  d[13] ^= 1;
  assert.equal(inspectQgf(d, 2), null);
});
test("RGB565 color quantization retains primary colors", () => {
  const pixels = pixels565(
    Uint8ClampedArray.of(255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255),
  );
  assert.deepEqual(Array.from(pixels), [0xf800, 0x07e0, 0x001f]);
  assert.deepEqual(
    Array.from(rgba565(pixels)),
    [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255],
  );
});
