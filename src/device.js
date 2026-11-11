import {DEVICE_PROFILES,identifyProfile} from "./device-profiles.js";
import { SLOTS, slotAt, assertRange, inspectQgf } from "./format.js";
export const ATHENA_UID = "2ee60e2334ef9937";
function fail(message) {
  throw Error(message);
}
export async function identifyAthena({ prompt = false, models = ["athena75"] } = {}) {
  if (!navigator.hid) fail("请使用桌面版 Chrome 或 Edge，通过 USB 连接");
  const supported=Object.values(DEVICE_PROFILES).filter(p=>models.includes(p.id));
  const permitted = prompt ? [] : (await navigator.hid.getDevices()).filter(d =>
    supported.some(p=>p.vid===d.vendorId&&p.pid===d.productId) &&
    d.collections.some(c => c.usagePage === 0xff60 && c.usage === 0x61));
  const devices = permitted.length === 1 ? permitted : await navigator.hid.requestDevice({
    filters: supported.map(p=>({vendorId:p.vid,productId:p.pid,usagePage:0xff60,usage:0x61})),
  });
  const d = devices[0];
  if (!d) throw new DOMException("未选择键盘", "NotFoundError");
  await d.open();
  try {
    const reply = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        d.removeEventListener("inputreport", listener);
        reject(Error("键盘识别超时，请关闭其他改键工具后重试"));
      }, 3000);
      function listener(e) {
        const a = new Uint8Array(
          e.data.buffer,
          e.data.byteOffset,
          e.data.byteLength,
        ).slice();
        if (a.length !== 32) return;
        clearTimeout(timer);
        d.removeEventListener("inputreport", listener);
        resolve(a);
      }
      d.addEventListener("inputreport", listener);
      const packet = new Uint8Array(32);
      packet.set([0xfe, 0]);
      d.sendReport(0, packet).catch((e) => {
        clearTimeout(timer);
        d.removeEventListener("inputreport", listener);
        reject(e);
      });
    });
    const uid = Array.from(reply.slice(4, 12), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    const profile=identifyProfile(d,uid);
    if (!profile || !models.includes(profile.id)) fail("此键盘型号或固件身份不在支持范围内");
    return {
      profile,
      device: d,
      name: d.productName,
      uid,
      version: new DataView(reply.buffer).getUint32(0, true),
    };
  } finally {
    await d.close();
  }
}
export class Picoboot {
  constructor(device) {
    this.device = device;
    this.token = 0;
    this.broken = false;
    this.claimed = false;
  }
  static async connect() {
    if (!navigator.usb)
      fail("此浏览器不支持 USB 直写，请使用桌面 Chrome 或 Edge");
    const device = await navigator.usb.requestDevice({
      filters: [{ vendorId: 0x2e8a, productId: 3 }],
    });
    const p = new Picoboot(device);
    try {
      await device.open();
      if (!device.configuration) await device.selectConfiguration(1);
      const i = device.configuration.interfaces.find((i) =>
        i.alternates.some((a) => a.interfaceClass === 255),
      );
      if (!i) fail("没有找到兼容的升级接口");
      p.iface = i.interfaceNumber;
      await device.claimInterface(p.iface);
      p.claimed = true;
      const alt = i.alternates.find((a) => a.interfaceClass === 255);
      if (i.alternate.alternateSetting !== alt.alternateSetting)
        await device.selectAlternateInterface(p.iface, alt.alternateSetting);
      p.out = alt.endpoints.find(
        (e) => e.type === "bulk" && e.direction === "out",
      )?.endpointNumber;
      p.input = alt.endpoints.find(
        (e) => e.type === "bulk" && e.direction === "in",
      )?.endpointNumber;
      if (!p.out || !p.input) fail("升级端点不兼容");
      await p.reset();
      await p.command(1, Uint8Array.of(1));
      await p.command(6);
      return p;
    } catch (e) {
      await p.close();
      throw e;
    }
  }
  async io(promise) {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            this.broken = true;
            this.device.close().catch(() => {});
            reject(
              Error(
                "USB 通信超时，请拔插键盘并重新进入升级模式。原动画备份仍可恢复。",
              ),
            );
          }, 5000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  async reset() {
    const r = await this.io(
      this.device.controlTransferOut({
        requestType: "vendor",
        recipient: "interface",
        request: 0x41,
        value: 0,
        index: this.iface,
      }),
    );
    if (r.status !== "ok") fail("无法初始化升级接口");
  }
  async command(code, args = new Uint8Array(), length = 0, payload) {
    if (this.broken) fail("连接已中断，请重新连接");
    const packet = new Uint8Array(32),
      v = new DataView(packet.buffer);
    v.setUint32(0, 0x431fd10b, true);
    v.setUint32(4, ++this.token, true);
    packet[8] = code;
    packet[9] = args.length;
    v.setUint32(12, length, true);
    packet.set(args, 16);
    try {
      let r = await this.io(this.device.transferOut(this.out, packet));
      if (r.status !== "ok" || r.bytesWritten !== 32) fail("USB 命令传输失败");
      let data;
      if (length) {
        if (code & 128) {
          r = await this.io(this.device.transferIn(this.input, length));
          if (r.status !== "ok" || r.data?.byteLength !== length)
            fail("USB 数据读取不完整");
          data = new Uint8Array(
            r.data.buffer,
            r.data.byteOffset,
            r.data.byteLength,
          ).slice();
        } else {
          r = await this.io(this.device.transferOut(this.out, payload));
          if (r.status !== "ok" || r.bytesWritten !== length)
            fail("USB 数据写入不完整");
        }
      }
      r =
        code & 128
          ? await this.io(this.device.transferOut(this.out, new Uint8Array(1)))
          : await this.io(this.device.transferIn(this.input, 1));
      if (r.status !== "ok") fail("设备未确认操作");
      if (code !== 2) {
        r = await this.io(
          this.device.controlTransferIn(
            {
              requestType: "vendor",
              recipient: "interface",
              request: 0x42,
              value: 0,
              index: this.iface,
            },
            16,
          ),
        );
        if (
          r.status !== "ok" ||
          r.data?.byteLength !== 16 ||
          r.data.getUint32(0, true) !== this.token ||
          r.data.getUint32(4, true) !== 0 ||
          r.data.getUint8(9) !== 0
        )
          fail("设备返回错误状态，已停止");
      }
      return data;
    } catch (e) {
      this.broken = true;
      throw e;
    }
  }
  range(slot, address, length) {
    assertRange(slot, address, length);
    const a = new Uint8Array(8),
      v = new DataView(a.buffer);
    v.setUint32(0, address, true);
    v.setUint32(4, length, true);
    return a;
  }
  async read(slot, address, length, onProgress = () => {}) {
    assertRange(slot, address, length);
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i += 65536) {
      const n = Math.min(65536, length - i);
      out.set(await this.command(0x84, this.range(slot, address + i, n), n), i);
      onProgress((i + n) / length);
    }
    return out;
  }
  async headers() {
    const result = [];
    for (let i = 0; i < SLOTS.length; i++)
      result.push(inspectQgf(await this.read(i, SLOTS[i].address, 256), i));
    if (!result.some((h) => h && !h.empty) || result.some((h) => h === null))
      fail("动画分区与已验证的 Athena75 不匹配，已禁止写入");
    return result;
  }
  async program(slot, bytes, onProgress = () => {}) {
    const s = slotAt(slot),
      size = Math.ceil(bytes.length / 4096) * 4096;
    assertRange(slot, s.address, size);
    const padded = new Uint8Array(size).fill(255);
    padded.set(bytes);
    await this.command(6);
    for (let i = 0; i < size; i += 4096) {
      await this.command(3, this.range(slot, s.address + i, 4096));
      for (let j = 0; j < 4096; j += 256)
        await this.command(
          5,
          this.range(slot, s.address + i + j, 256),
          256,
          padded.subarray(i + j, i + j + 256),
        );
      onProgress((i + 4096) / size);
    }
    const readback = await this.read(slot, s.address, size);
    if (readback.some((b, i) => b !== padded[i]))
      fail("写入后的逐字节校验失败，请使用备份恢复");
    return true;
  }
  async reboot() {
    const a = new Uint8Array(12);
    new DataView(a.buffer).setUint32(8, 250, true);
    await this.command(2, a);
    if (this.device.opened) await this.device.close();
    this.claimed = false;
  }
  async close() {
    if (this.device.opened) {
      if (!this.broken && this.claimed) {
        try {
          await this.command(1, Uint8Array.of(0));
        } catch {}
      }
      if (this.device.opened) {
        try {
          if (this.claimed) await this.device.releaseInterface(this.iface);
        } catch {}
        await this.device.close().catch(() => {});
      }
    }
  }
}
