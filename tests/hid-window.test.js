import test from 'node:test';
import assert from 'node:assert/strict';
import { RuntimeV2, crc32 } from '../src/runtime-v2.js';
import { hidWindow } from '../src/hid-window.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
class BufferedHid {
  opened = true; listeners = new Set(); replies = []; calls = []; data = []; maxPending = 0;
  failOffset = -1; badOffset = -1; sendFailure = -1; badCrc = false;
  addEventListener(_, fn) { this.listeners.add(fn); }
  removeEventListener(_, fn) { this.listeners.delete(fn); }
  async close() { this.opened = false; }
  emit(packet) { for (const fn of this.listeners) fn({ data: new DataView(packet.buffer) }); }
  async sendReport(_, packet) {
    assert.ok(this.opened);
    this.calls.push(packet.slice());
    const r = packet.slice(), v = new DataView(r.buffer), offset = v.getUint32(6, true);
    const op = r[2], n = r[5]; r.fill(0, 5);
    if (op === 3) {
      if (offset === this.sendFailure) throw Error('USB disconnected');
      assert.equal(offset, this.data.length);
      this.data.push(...packet.slice(10, 10 + n));
      v.setUint32(6, offset + n + (offset === this.badOffset ? 1 : 0), true);
      if (offset === this.failOffset) r[5] = 6;
    }
    if (op === 4) v.setUint32(6, crc32(this.data) ^ (this.badCrc ? 1 : 0), true);
    this.replies.push(r);
    this.maxPending = Math.max(this.maxPending, this.replies.length);
  }
  async drain(promise, reverse = false) {
    let done = false;
    // Attach rejection handler immediately; the test still receives the error.
    const result = promise.then(value => ({ value }), error => ({ error })).finally(() => { done = true; });
    for (let i = 0; i < 2000 && !done; i++) {
      await tick();
      const replies = this.replies.splice(0);
      if (reverse) replies.reverse();
      for (const r of replies) this.emit(r);
    }
    assert.ok(done, 'transfer must settle without an unbounded wait');
    const outcome = await result;
    if (outcome.error) throw outcome.error;
    return outcome.value;
  }
}
test('four ordered OUT packets in flight; reverse ACK delivery, sequence wrap, tail and CRC work', async () => {
  const d = new BufferedHid(), p = new RuntimeV2(d);
  const bytes = Uint8Array.from({ length: 10003 }, (_, i) => i % 251), progress = [];
  const writing = p.program(0, bytes, n => progress.push(n));
  await d.drain(writing, true);
  assert.deepEqual(Uint8Array.from(d.data), bytes);
  assert.equal(d.maxPending, 4);
  assert.equal(d.calls.at(-1)[2], 4);
  assert.equal(progress.at(-1), 1);
  assert.ok(progress.every((n, i) => i === 0 || n >= progress[i - 1]));
  assert.equal(p.pending, false); assert.equal(d.listeners.size, 0);
  assert.equal(p.lastTransfer.packets, Math.ceil(bytes.length / 22));
});
test('shared lock stays held across the complete data window', async () => {
  const d = new BufferedHid(), p = new RuntimeV2(d);
  const writing = p.program(1, new Uint8Array(300));
  d.emit(d.replies.shift()); await tick();
  assert.equal(p.pending, true);
  await assert.rejects(p.petCommand(), /未完成请求/);
  await d.drain(writing);
});
test('device error or wrong offset stops sending, drains outstanding packets and aborts without commit', async () => {
  for (const field of ['failOffset', 'badOffset']) {
    const d = new BufferedHid(), p = new RuntimeV2(d); d[field] = 22;
    await assert.rejects(d.drain(p.program(0, new Uint8Array(1000))));
    assert.ok(!d.calls.some(r => r[2] === 4));
    assert.equal(d.calls.at(-1)[2], 5);
    assert.ok(d.calls.filter(r => r[2] === 3).length <= 5);
    assert.equal(p.pending, false); assert.equal(d.listeners.size, 0);
  }
});
test('send failure closes uncertain connection and never commits or retries writes', async () => {
  const d = new BufferedHid(), p = new RuntimeV2(d); d.sendFailure = 22;
  await assert.rejects(d.drain(p.program(0, new Uint8Array(300))), /USB disconnected/);
  assert.equal(p.broken, true); assert.equal(d.opened, false);
  assert.ok(!d.calls.some(r => r[2] === 4 || r[2] === 5));
  assert.equal(d.listeners.size, 0);
});
test('final device CRC mismatch aborts and never publishes success metrics', async () => {
  const d = new BufferedHid(), p = new RuntimeV2(d); d.badCrc = true;
  await assert.rejects(d.drain(p.program(0, new Uint8Array(300))), /回读校验/);
  assert.equal(d.calls.at(-1)[2], 5); assert.equal(p.lastTransfer, null);
});
test('lost ACK times out; unrelated or duplicate packets cannot release the window', async () => {
  const d = new BufferedHid(); let fatal = false, acknowledged = 0;
  const packets = [0, 1].map(seq => { const p = new Uint8Array(32); p.set([253,168,3,seq,0]); return p; });
  // Custom send does not execute firmware; only ACK matching is under test.
  d.sendReport = async () => {};
  const result = hidWindow(d, packets, { timeout: 30, onReply: () => acknowledged++, onFatal: () => { fatal = true; } });
  await tick();
  const unrelated = packets[1].slice(); unrelated[4] = 2; d.emit(unrelated);
  d.emit(packets[0]); d.emit(packets[0]);
  await assert.rejects(result, /超时/);
  assert.equal(acknowledged, 1); assert.equal(fatal, true); assert.equal(d.listeners.size, 0);
});
test('window one remains available for comparative measurement', async () => {
  const d = new BufferedHid(), p = new RuntimeV2(d); p.transferWindow = 1;
  await d.drain(p.program(0, new Uint8Array(300)));
  assert.equal(d.maxPending, 1); assert.equal(p.lastTransfer.window, 1);
});
