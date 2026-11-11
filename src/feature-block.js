import { crc32 } from './crc32.js';
export const FEATURE_SIZE = 4096, BLOCK_DATA = FEATURE_SIZE - 16;
export function hasFeatureTransport(device) {
  if (typeof device.sendFeatureReport !== 'function') return false;
  function find(collections) {
    return collections.some(c => (c.featureReports || []).some(r => r.reportId === 0 &&
      (r.items || []).reduce((n, item) => n + item.reportSize * item.reportCount, 0) === FEATURE_SIZE * 8) || find(c.children || []));
  }
  return find(device.collections || []);
}
export function featureBlock(slot, offset, data) {
  if (!Number.isInteger(slot) || slot < 0 || slot > 3 || !Number.isInteger(offset) || offset < 0 || offset > 0x3fe000 || !data.length || data.length > BLOCK_DATA)
    throw Error('高速数据块无效');
  const packet = new Uint8Array(FEATURE_SIZE), v = new DataView(packet.buffer);
  packet.set([0xfd, 0xa8, 1, slot]);
  v.setUint32(4, offset, true); v.setUint16(8, data.length, true);
  v.setUint32(12, crc32(data), true); packet.set(data, 16);
  return packet;
}
