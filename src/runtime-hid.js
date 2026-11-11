import { ATHENA_UID } from "./device.js";
import { SLOTS, slotAt, assertRange, inspectQgf } from "./format.js";

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const errors = [
  "成功",
  "命令不支持",
  "设备正在处理另一段动画",
  "超出动画区域",
  "传输顺序不一致",
  "动画校验失败",
  "Flash 操作失败或显示核心无响应",
  "动画格式无效",
];

export class RuntimeHid {
  constructor(device) {
    this.device = device;
    this.broken = false;
    this.sequence = 0;
    this.isRuntime = true;
    this.pending = false;
  }
  static async tryConnect(device, uid) {
    if (uid !== ATHENA_UID) throw Error("键盘身份不匹配");
    const p = new RuntimeHid(device);
    try {
      await device.open();
      const reply = await p.command(0, 0);
      if (
        String.fromCharCode(...reply.slice(6, 10)) !== "ASU1" ||
        reply[10] !== 1
      ) {
        await p.close();
        return null;
      }
      for (let slot = 0; slot < SLOTS.length; slot++) {
        const info = await p.info(slot);
        if (
          info.capacity !== SLOTS[slot].capacity ||
          info.address !== SLOTS[slot].address
        )
          throw Error("固件动画布局不兼容");
      }
      return p;
    } catch (e) {
      await p.close();
      throw e;
    }
  }
  command(op, slot, { offset = 0, count = 0, data, crc } = {}) {
    if (this.broken || this.pending)
      return Promise.reject(Error("HID 连接不可用或仍有未完成请求"));
    slotAt(slot);
    const packet = new Uint8Array(32),
      view = new DataView(packet.buffer);
    const sequence = this.sequence++ & 255;
    packet.set([0xfd, 0xa7, op, sequence, slot, count]);
    view.setUint32(6, offset, true);
    if (crc !== undefined) view.setUint32(10, crc, true);
    if (data) {
      if (data.length > 22) throw Error("HID 分块过大");
      packet.set(data, 10);
    }
    this.pending = true;
    return new Promise((resolve, reject) => {
      let timer;
      const finish = (error, reply) => {
        clearTimeout(timer);
        this.device.removeEventListener("inputreport", listener);
        this.pending = false;
        if (error) reject(error);
        else resolve(reply);
      };
      const listener = (e) => {
        const a = new Uint8Array(
          e.data.buffer,
          e.data.byteOffset,
          e.data.byteLength,
        ).slice();
        if (
          a.length !== 32 ||
          a[0] !== 0xfd ||
          a[1] !== 0xa7 ||
          a[2] !== op ||
          a[3] !== sequence ||
          a[4] !== slot
        )
          return;
        if (a[5]) finish(Error(errors[a[5]] || `设备错误 ${a[5]}`));
        else finish(null, a);
      };
      this.device.addEventListener("inputreport", listener);
      timer = setTimeout(() => {
        this.broken = true;
        this.device.close().catch(() => {});
        finish(
          Error("正常模式通信超时，请重新连接；如果键盘也无响应，请拔插 USB 后重试"),
        );
      }, 5000);
      this.device.sendReport(0, packet).catch((e) => {
        this.broken = true;
        finish(e);
      });
    });
  }
  async info(slot = 0) {
    const r = await this.command(0, slot),
      v = new DataView(r.buffer);
    if (String.fromCharCode(...r.slice(6, 10)) !== "ASU1")
      throw Error("此固件尚未支持正常模式上传");
    return {
      capacity: v.getUint32(14, true),
      address: 0x10000000 + v.getUint32(18, true),
      phase: r[26],
      lcdOff: !!(r[27] & 1),
      gif: (r[27] >> 1) & 15,
      heartbeat: v.getUint16(28, true),
      uploading: !!r[11],
    };
  }
  async read(slot, address, length, onProgress = () => {}) {
    assertRange(slot, address, length);
    const out = new Uint8Array(length),
      base = slotAt(slot).address;
    for (let i = 0; i < length; i += 24) {
      const n = Math.min(24, length - i);
      const r = await this.command(1, slot, {
        offset: address - base + i,
        count: n,
      });
      out.set(r.subarray(6, 6 + n), i);
      if (i % 2400 === 0 || i + n === length) onProgress((i + n) / length);
    }
    return out;
  }
  async headers() {
    const result = [];
    for (let i = 0; i < 6; i++)
      result.push(inspectQgf(await this.read(i, SLOTS[i].address, 256), i));
    return result;
  }
  async program(slot, bytes, onProgress = () => {}) {
    assertRange(slot, slotAt(slot).address, bytes.length);
    const checksum = crc32(bytes);
    let begun = false;
    try {
      await this.command(2, slot, { offset: bytes.length, crc: checksum });
      begun = true;
      for (let i = 0; i < bytes.length; i += 22) {
        const n = Math.min(22, bytes.length - i);
        const r = await this.command(3, slot, {
          offset: i,
          count: n,
          data: bytes.subarray(i, i + n),
        });
        if (new DataView(r.buffer).getUint32(6, true) !== i + n)
          throw Error("设备接收位置不一致");
        if (i % 2200 === 0 || i + n === bytes.length)
          onProgress((i + n) / bytes.length);
      }
      const result = await this.command(4, slot);
      if (new DataView(result.buffer).getUint32(6, true) !== checksum)
        throw Error("设备内回读校验不一致");
      return true;
    } catch (e) {
      if (begun && !this.broken) await this.command(5, slot).catch(() => {});
      throw e;
    }
  }
  async recoverScreen() {
    await this.command(6, 0);
  }
  async close() {
    if (this.device.opened) await this.device.close().catch(() => {});
  }
}
