import test from 'node:test';
import assert from 'node:assert/strict';
import { transferImage } from '../src/image-transfer.js';
import { slotAt } from '../src/format-v2.js';

function fixture() {
  const calls = [], original = new Uint8Array([1]), bytes = new Uint8Array([2]);
  const device = {
    async read(...args) { calls.push(['read', ...args.slice(0, 3)]); return original; },
    async program(slot, data) { calls.push(['program', slot, data]); },
  };
  const hooks = {
    async saveBackup(slot, data) { calls.push(['backup', slot, data]); return { id: 'saved' }; },
    onBackupSaved(record) { calls.push(['saved', record.id]); },
    onWriteStart() { calls.push(['start']); },
  };
  return { device, hooks, calls, original, operation: { slot: 1, bytes } };
}
test('explicit backup preserves the optional recovery path before programming', async () => {
  const f = fixture(), s = slotAt(1);
  await transferImage(f.device, { ...f.operation, backupBeforeWrite: true }, f.hooks);
  assert.deepEqual(f.calls, [['read', 1, s.address, s.capacity], ['backup', 1, f.original], ['saved', 'saved'], ['start'], ['program', 1, f.operation.bytes]]);
});
test('default direct write performs no backup reads or storage and uses the same programmer', async () => {
  const f = fixture();
  await transferImage(f.device, f.operation, f.hooks);
  assert.deepEqual(f.calls, [['start'], ['program', 1, f.operation.bytes]]);
});
test('backup read or persistence failure prevents programming', async () => {
  for (const stage of ['read', 'saveBackup']) {
    const f = fixture();
    (stage === 'read' ? f.device : f.hooks)[stage] = async () => { throw Error('backup failed'); };
    await assert.rejects(transferImage(f.device, { ...f.operation, backupBeforeWrite: true }, f.hooks), /backup failed/);
    assert.ok(!f.calls.some(([name]) => name === 'program' || name === 'start'));
  }
});
test('programmer verification failures propagate with and without backup', async () => {
  for (const backupBeforeWrite of [true, false]) {
    const f = fixture();
    f.device.program = async () => { throw Error('CRC mismatch'); };
    await assert.rejects(transferImage(f.device, { ...f.operation, backupBeforeWrite }, f.hooks), /CRC mismatch/);
  }
});
