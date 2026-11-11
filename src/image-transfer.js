import { slotAt } from './format-v2.js';

// Both paths use the same programmer, including its device-side CRC check.
export async function transferImage(device, operation, {
  saveBackup, onBackupProgress, onBackupSaved, onWriteStart, onWriteProgress,
}) {
  const { slot, bytes } = operation;
  const target = slotAt(slot);
  if (operation.backupBeforeWrite === true) {
    const original = await device.read(slot, target.address, target.capacity, onBackupProgress);
    const record = await saveBackup(slot, original);
    onBackupSaved?.(record);
  }
  onWriteStart?.();
  await device.program(slot, bytes, onWriteProgress);
}
