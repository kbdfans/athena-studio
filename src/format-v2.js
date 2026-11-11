export const SLOTS = [0x10400000,0x10600000,0x10800000].map((address,id)=>({name:`图片 / GIF ${id+1}`,label:`图片 ${id+1}`,address,capacity:0x200000,maxFrames:63}));
export const FRAME_BYTES = 128 * 128 * 2;
export function slotAt(index) {
  if (!Number.isInteger(index) || !SLOTS[index]) throw Error("动画位置无效");
  return SLOTS[index];
}
export function assertRange(slot, address, length) {
  const s = slotAt(slot);
  if (
    !Number.isSafeInteger(address) ||
    !Number.isSafeInteger(length) ||
    length <= 0 ||
    address < s.address ||
    address + length > s.address + s.capacity
  )
    throw Error("访问超出动画区域，已停止");
}
export function qgfSize(n) {
  return 28 + n * (FRAME_BYTES + 20);
}
export function encodeQgf(frames, slot) {
  const s = slotAt(slot);
  if (!frames.length || frames.length > s.maxFrames)
    throw Error(`此位置最多 ${s.maxFrames} 帧，请先优化`);
  const out = new Uint8Array(qgfSize(frames.length)),
    v = new DataView(out.buffer),
    head = 28 + frames.length * 4;
  out.set([0, 255, 18, 0, 0, 81, 71, 70, 1]);
  v.setUint32(9, out.length, true);
  v.setUint32(13, ~out.length, true);
  v.setUint16(17, 128, true);
  v.setUint16(19, 128, true);
  v.setUint16(21, frames.length, true);
  out.set([1, 254], 23);
  out[25] = (frames.length * 4) & 255;
  out[26] = (frames.length * 4) >> 8;
  frames.forEach((f, i) => {
    if (
      !(f.data instanceof Uint16Array) ||
      f.data.length !== 16384 ||
      !Number.isInteger(f.delay) ||
      f.delay < 1 ||
      f.delay > 65535
    )
      throw Error("动画帧数据或时长无效");
    const offset = head + i * (FRAME_BYTES + 16);
    v.setUint32(28 + i * 4, offset, true);
    out.set([2, 253, 6, 0, 0, 8, 0, 0, 255, 0, 0, 5, 250, 0, 128, 0], offset);
    v.setUint16(offset + 9, f.delay, true);
    f.data.forEach((pixel, j) =>
      v.setUint16(offset + 16 + j * 2, pixel, false),
    );
  });
  assertRange(slot, s.address, out.length);
  return out;
}
export function inspectQgf(data, slot) {
  if (data.length < 28) return null;
  if (data.slice(0, 28).every((b) => b === 255)) return { empty: true };
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if ([0, 255, 18, 0, 0, 81, 71, 70, 1].some((b, i) => data[i] !== b))
    return null;
  const size = v.getUint32(9, true),
    width = v.getUint16(17, true),
    height = v.getUint16(19, true),
    frames = v.getUint16(21, true),
    s = slotAt(slot);
  if (
    (size ^ v.getUint32(13, true)) !== -1 ||
    width !== 128 ||
    height !== 128 ||
    frames < 1 ||
    frames > s.maxFrames ||
    size < 28 ||
    size > s.capacity
  )
    return null;
  return { empty: false, size, width, height, frames };
}
export function encodeUf2(data, slot) {
  const s = slotAt(slot);
  assertRange(slot, s.address, data.length);
  const blocks = Math.ceil(data.length / 256),
    out = new Uint8Array(blocks * 512),
    v = new DataView(out.buffer);
  for (let i = 0; i < blocks; i++) {
    const o = i * 512;
    [
      0x0a324655,
      0x9e5d5157,
      0x2000,
      s.address + i * 256,
      256,
      i,
      blocks,
      0xe48bff56,
    ].forEach((x, j) => v.setUint32(o + j * 4, x, true));
    out.set(data.subarray(i * 256, (i + 1) * 256), o + 32);
    v.setUint32(o + 508, 0x0ab16f30, true);
  }
  return out;
}
export function pixels565(rgba) {
  const out = new Uint16Array(rgba.length / 4);
  for (let i = 0; i < out.length; i++)
    out[i] =
      ((rgba[i * 4] >> 3) << 11) |
      ((rgba[i * 4 + 1] >> 2) << 5) |
      (rgba[i * 4 + 2] >> 3);
  return out;
}
export function rgba565(data) {
  const out = new Uint8ClampedArray(data.length * 4);
  for (let i = 0; i < data.length; i++) {
    const p = data[i];
    out[i * 4] = Math.round(((p >> 11) * 255) / 31);
    out[i * 4 + 1] = Math.round((((p >> 5) & 63) * 255) / 63);
    out[i * 4 + 2] = Math.round(((p & 31) * 255) / 31);
    out[i * 4 + 3] = 255;
  }
  return out;
}
// Keep the selected duration while grouping frames. Never silently wrap QGF's uint16 delay.
export function optimizeFrames(frames, maxFrames, fps) {
  if (!frames.length) return [];
  const out = [];
  let bucket = [],
    duration = 0;
  const interval = 1000 / fps;
  const flush = () => {
    if (!bucket.length) return;
    out.push({ ...bucket[0], delay: duration });
    bucket = [];
    duration = 0;
  };
  for (const f of frames) {
    bucket.push(f);
    duration += f.delay;
    if (duration >= interval) flush();
  }
  flush();
  const grouped = [];
  for (let i = 0; i < Math.min(maxFrames, out.length); i++) {
    const a = Math.floor((i * out.length) / Math.min(maxFrames, out.length)),
      b = Math.floor(((i + 1) * out.length) / Math.min(maxFrames, out.length));
    grouped.push({
      ...out[a],
      delay: out.slice(a, b).reduce((n, f) => n + f.delay, 0),
    });
  }
  const merged = [];
  for (const f of grouped) {
    const last = merged.at(-1);
    if (
      last &&
      last.delay + f.delay <= 65535 &&
      last.data.every((p, i) => p === f.data[i])
    )
      last.delay += f.delay;
    else merged.push({ ...f });
  }
  if (merged.some((f) => f.delay > 65535))
    throw Error("单帧停留超过 65 秒，请缩短动画");
  return merged;
}
