import test from "node:test";
import assert from "node:assert/strict";
import { Picoboot } from "../src/device.js";
import { SLOTS } from "../src/format.js";
class Fake extends Picoboot {
  constructor() {
    super({});
    this.memory = new Uint8Array(0x200000).fill(0x55);
    this.calls = [];
  }
  async command(code, args = new Uint8Array(), length = 0, data) {
    const v = new DataView(args.buffer, args.byteOffset, args.length),
      address = args.length >= 8 ? v.getUint32(0, true) : 0,
      size = args.length >= 8 ? v.getUint32(4, true) : 0;
    this.calls.push({ code, address, size });
    const offset = address - SLOTS[2].address;
    if (code === 3) this.memory.fill(255, offset, offset + size);
    if (code === 5) this.memory.set(data, offset);
    if (code === 0x84) return this.memory.slice(offset, offset + length);
  }
}
test("writer erases only rounded target span, preserves rest, and verifies bytes", async () => {
  const p = new Fake(),
    bytes = new Uint8Array(5000).fill(0x23);
  await p.program(2, bytes);
  assert.deepEqual(p.memory.slice(0, 5000), bytes);
  assert.ok(p.memory.slice(5000, 8192).every((b) => b === 255));
  assert.ok(p.memory.slice(8192).every((b) => b === 0x55));
  assert.deepEqual(
    p.calls.filter((c) => c.code === 3).map((c) => c.address),
    [SLOTS[2].address, SLOTS[2].address + 4096],
  );
  assert.equal(p.calls.filter((c) => c.code === 5).length, 32);
  assert.equal(p.calls.at(-1).code, 0x84);
});
test("oversize payload is rejected before any device commands", async () => {
  const p = new Fake();
  await assert.rejects(() => p.program(2, new Uint8Array(0x200001)));
  assert.equal(p.calls.length, 0);
});
test("write failure stops subsequent erases and never reboots", async () => {
  const p = new Fake(),
    command = p.command.bind(p);
  p.command = async (...args) => {
    if (args[0] === 5) throw Error("disconnected");
    return command(...args);
  };
  await assert.rejects(
    () => p.program(2, new Uint8Array(8192)),
    /disconnected/,
  );
  assert.equal(p.calls.filter((c) => c.code === 3).length, 1);
  assert.ok(!p.calls.some((c) => c.code === 2));
});
test("readback mismatch is surfaced", async () => {
  const p = new Fake(),
    command = p.command.bind(p);
  p.command = async (...args) => {
    const result = await command(...args);
    if (args[0] === 0x84) result[0] ^= 1;
    return result;
  };
  await assert.rejects(() => p.program(2, new Uint8Array(256)), /校验失败/);
});
