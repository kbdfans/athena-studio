import {DEVICE_PROFILES,identifyProfile} from "./device-profiles.js";
import {encodeTypingSettings,decodeTypingSettings} from './typing-settings.js';
import { ATHENA_UID } from "./device.js";
import { SLOTS, inspectQgf } from "./format-v2.js";
import { hidWindow } from "./hid-window.js";
import { crc32 } from "./crc32.js";
import {decodeBuildInfo} from './firmware-compatibility.js';
export { crc32 } from "./crc32.js";
import { hasFeatureTransport, featureBlock, FEATURE_SIZE, BLOCK_DATA } from "./feature-block.js";

const REGIONS=[...SLOTS,{address:0x10a00000,capacity:0x3fe000}];
const slotAt=(slot)=>{if(!Number.isInteger(slot)||!REGIONS[slot])throw Error("区域无效");return REGIONS[slot];};
function assertRange(slot,address,length){const s=slotAt(slot);if(!Number.isSafeInteger(address)||!Number.isSafeInteger(length)||length<1||address<s.address||address+length>s.address+s.capacity)throw Error("访问超出目标区域");}
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

export class RuntimeV2 {
  constructor(device, profile=DEVICE_PROFILES.athena75) {
    this.device = device;
    this.profile=profile;this.capabilities={screen:true};
    this.broken = false;
    this.sequence = 0;
    this.isRuntime = true;
    this.pending = false;
    this.transferWindow = 4;
  }
  static async tryConnect(device, uid) {
    const profile=device.vendorId===undefined ? (uid===ATHENA_UID?DEVICE_PROFILES.athena75:null) : identifyProfile(device,uid);
    if (!profile) throw Error("键盘身份不匹配");
    const p = new RuntimeV2(device,profile);
    try {
      await device.open();
      const reply = await p.command(0, 0);
      if (
        String.fromCharCode(...reply.slice(6, 10)) !== "ASU2" ||
        reply[10] !== 2
      ) {
        await p.close();
        return null;
      }
      for (let slot = 0; slot < REGIONS.length; slot++) {
        const info = await p.info(slot);
        if (
          info.capacity !== REGIONS[slot].capacity ||
          info.address !== REGIONS[slot].address
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
    packet.set([0xfd, 0xa8, op, sequence, slot, count]);
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
          a[1] !== 0xa8 ||
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
    if (String.fromCharCode(...r.slice(6, 10)) !== "ASU2")
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
  async buildInfo(){
    try{return decodeBuildInfo(await this.command(14,0));}
    catch(e){if(this.broken)throw e;if(e.message===errors[1])return null;throw e;}
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
    for (let i = 0; i < 3; i++)
      result.push(inspectQgf(await this.read(i, SLOTS[i].address, 256), i));
    return result;
  }
  async programData(slot, bytes, onProgress) {
    if (this.broken || this.pending) throw Error("HID 连接不可用或仍有未完成请求");
    const runtime = this;
    let acknowledged = 0, nextProgress = 2200;
    function* packets() {
      for (let offset = 0; offset < bytes.length; offset += 22) {
        const n = Math.min(22, bytes.length - offset), packet = new Uint8Array(32);
        packet.set([0xfd, 0xa8, 3, runtime.sequence++ & 255, slot, n]);
        new DataView(packet.buffer).setUint32(6, offset, true);
        packet.set(bytes.subarray(offset, offset + n), 10);
        yield packet;
      }
    }
    this.pending = true;
    try {
      await hidWindow(this.device, packets(), {
        windowSize: this.transferWindow,
        onFatal: () => {
          this.broken = true;
          this.device.close().catch(() => {});
        },
        onReply: (reply, packet) => {
          if (reply[5]) throw Error(errors[reply[5]] || `设备错误 ${reply[5]}`);
          const expected = new DataView(packet.buffer).getUint32(6, true) + packet[5];
          if (new DataView(reply.buffer).getUint32(6, true) !== expected)
            throw Error("设备接收位置不一致");
          acknowledged += packet[5];
          if (acknowledged >= nextProgress || acknowledged === bytes.length) {
            nextProgress = acknowledged + 2200;
            onProgress(acknowledged / bytes.length);
          }
        },
      });
    } finally { this.pending = false; }
  }
  async program(slot, bytes, onProgress = () => {}) {
    assertRange(slot, slotAt(slot).address, bytes.length);
    const fast = await this.fastCapabilities();
    const checksum = crc32(bytes);
    let begun = false;
    const started = performance.now();
    this.lastTransfer = null;
    try {
      await this.command(2, slot, { offset: bytes.length, crc: checksum });
      begun = true;
      const dataStarted = performance.now();
      if (fast) await this.programFast(slot, bytes, onProgress);
      else await this.programData(slot, bytes, onProgress);
      const verifyStarted = performance.now();
      const result = await this.command(4, slot);
      if (new DataView(result.buffer).getUint32(6, true) !== checksum)
        throw Error("设备内回读校验不一致");
      this.lastTransfer = {
        bytes: bytes.length, packets: Math.ceil(bytes.length / (fast ? BLOCK_DATA : 22)), window: fast ? 1 : this.transferWindow,
        mode: fast ? 'feature4k' : 'window4',
        dataMs: verifyStarted - dataStarted, verifyMs: performance.now() - verifyStarted,
        totalMs: performance.now() - started,
      };
      if (result[30] === 1) {
        const v = new DataView(result.buffer);
        this.lastTransfer.flash = {
          eraseMs: v.getUint32(10, true), programMs: v.getUint32(14, true),
          verifyMs: v.getUint32(18, true), erases: v.getUint32(22, true), programs: v.getUint32(26, true),
        };
      }
      return true;
    } catch (e) {
      if (begun && !this.broken) await this.command(5, slot).catch(() => {});
      throw e;
    }
  }
  async fastCapabilities() {
    if (!hasFeatureTransport(this.device)) return false;
    if (this.fastSupported !== undefined) return this.fastSupported;
    try {
      const r = await this.command(7, 0), v = new DataView(r.buffer);
      this.fastSupported = String.fromCharCode(...r.slice(6, 10)) === 'FST1' &&
        v.getUint16(10, true) === FEATURE_SIZE && v.getUint16(12, true) === BLOCK_DATA && r[14] === 1;
      return this.fastSupported;
    } catch (e) {
      if (e.message === errors[1]) return this.fastSupported = false;
      throw e;
    }
  }
  async sendFeature(packet) {
    if (this.broken || this.pending) throw Error('HID 连接不可用或仍有未完成请求');
    this.pending = true;
    let timer;
    try {
      await Promise.race([
        this.device.sendFeatureReport(0, packet),
        new Promise((_, reject) => { timer = setTimeout(() => reject(Error('高速传输超时，请重新连接键盘')), 5000); }),
      ]);
    } catch (e) {
      this.broken = true;
      await this.device.close().catch(() => {});
      throw e;
    } finally { clearTimeout(timer); this.pending = false; }
  }
  async programFast(slot, bytes, onProgress) {
    for (let offset = 0; offset < bytes.length; offset += BLOCK_DATA) {
      const data = bytes.subarray(offset, offset + BLOCK_DATA);
      await this.sendFeature(featureBlock(slot, offset, data));
      const reply = await this.command(8, slot, { offset });
      if (new DataView(reply.buffer).getUint32(6, true) !== offset + data.length)
        throw Error('高速传输接收位置不一致');
      onProgress((offset + data.length) / bytes.length);
    }
  }
  async typingSettings(settings){
    let options={};if(settings){const bytes=encodeTypingSettings(settings);options={offset:new DataView(bytes.buffer).getUint32(0,true),data:bytes.subarray(4)};}
    const r=await this.command(settings?23:22,0,options);return {settings:decodeTypingSettings(r.subarray(6,22)),dirty:!!r[22],saveError:!!r[23]};
  }
  async petCommand(op=16,value=0){
    const r=await this.command(op,0,{offset:value}),v=new DataView(r.buffer);
    return {mode:r[6],image:r[7],action:r[8],level:r[9],fullness:r[10],dirty:!!r[11],xp:v.getUint32(12,true),keys:v.getUint32(16,true),bytes:v.getUint32(20,true),sequence:v.getUint32(24,true),saveError:!!r[28],ready:!!r[29],motionVersion:r[30],stage:r[31]};
  }
  async recoverScreen() {
    await this.command(6, 0);
  }
  async close() {
    if (this.device.opened) await this.device.close().catch(() => {});
  }
}
