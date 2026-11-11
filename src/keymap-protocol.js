import {DEVICE_PROFILES,profileForMap} from "./device-profiles.js";
import { ATHENA_UID } from "./device.js";
import { PHYSICAL_LAYOUT_MASK } from "./keyboard-layout.js";
// The installed Athena firmware stores only one VIA layout byte.
// Split Backspace is bit 8 and needs a firmware storage migration first.
export const DEVICE_LAYOUT_MASK = PHYSICAL_LAYOUT_MASK & 0xff;
export const ROWS = 11,
  COLS = 8,
  LAYERS = 8;
export const keyIndex = (layer, row, col, profile=DEVICE_PROFILES.athena75) => (layer * profile.rows + row) * profile.cols + col;
export function validateKeymap(map) {
  const profile=profileForMap(map);
  if (
    map?.format !== "athena-keymap-v1" ||
    map.uid !== profile.uid ||
    map.protocol !== 12 ||
    map.layers !== profile.layers ||
    map.rows !== profile.rows ||
    map.cols !== profile.cols ||
    !Number.isInteger(map.layoutOptions) ||
    map.layoutOptions < 0 ||
    map.layoutOptions > 0xffffffff ||
    !Array.isArray(map.keycodes) ||
    map.keycodes.length !== profile.layers * profile.rows * profile.cols ||
    map.keycodes.some((k) => !Number.isInteger(k) || k < 0 || k > 65535)
  )
    throw Error("不是兼容的键位备份");
  return map;
}
export function changesBetween(before, after) {
  validateKeymap(before);
  validateKeymap(after);
  if(profileForMap(before).id!==profileForMap(after).id)throw Error("键位文件与键盘型号不匹配");
  if (before.layoutOptions !== after.layoutOptions)
    throw Error("布局选项不一致，请使用相同物理布局的键位文件");
  return before.keycodes.flatMap((code, i) =>
    code === after.keycodes[i]
      ? []
      : [
          {
            index: i,
            layer: Math.floor(i / (before.rows*before.cols)),
            row: Math.floor((i % (before.rows*before.cols)) / before.cols),
            col: i % before.cols,
            before: code,
            after: after.keycodes[i],
          },
        ],
  );
}
// Share RuntimeV2's in-flight lock: pet polling and screen transfers cannot
// consume VIA replies. A timeout closes the session to discard late responses.
export function viaExchange(runtime, bytes, match, responseCommand = bytes[0]) {
  if (runtime.pending || runtime.broken || !runtime.device.opened)
    return Promise.reject(Error("键盘正在通信，请稍后再试"));
  const packet = new Uint8Array(32);
  packet.set(bytes);
  runtime.pending = true;
  return new Promise((resolve, reject) => {
    let timer,
      done = false;
    const finish = (error, data) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      runtime.device.removeEventListener("inputreport", listener);
      runtime.pending = false;
      error ? reject(error) : resolve(data);
    };
    const listener = (e) => {
      const reply = new Uint8Array(
        e.data.buffer,
        e.data.byteOffset,
        e.data.byteLength,
      ).slice();
      if (reply.length !== 32 || (responseCommand !== null && reply[0] !== responseCommand) || !match(reply))
        return;
      finish(null, reply);
    };
    runtime.device.addEventListener("inputreport", listener);
    timer = setTimeout(() => {
      runtime.broken = true;
      runtime.device.close().catch(() => {});
      finish(
        Error("键位通信超时，请重新连接后读取键盘；已写入的项目可能已生效"),
      );
    }, 5000);
    runtime.device.sendReport(0, packet).catch((e) => {
      runtime.broken = true;
      finish(e);
    });
  });
}
export class KeymapDevice {
  constructor(runtime) {
    this.runtime = runtime;
    this.profile=runtime.profile||DEVICE_PROFILES.athena75;
  }
  async matrixAvailable() {
    // Read status only. Never unlock or change security settings for a test.
    const r = await viaExchange(this.runtime, [0xfe, 5],
      (r) => r[0] <= 1 && r[1] <= 1 && r[30] === 255 && r[31] === 255, null);
    return r[0] === 1;
  }
  async readMatrix() {
    const r = await viaExchange(this.runtime, [2, 3], (r) => r[1] === 3);
    return Array.from({ length: this.profile.rows }, (_, row) => r[2 + row]);
  }
  async read() {
    const {rows:ROWS,cols:COLS,layers:LAYERS}=this.profile;
    const protocol = await viaExchange(this.runtime, [1], () => true);
    if (protocol[1] * 256 + protocol[2] !== 12)
      throw Error("当前键位协议不兼容");
    const layers = (await viaExchange(this.runtime, [0x11], () => true))[1];
    if (layers !== LAYERS) throw Error("当前键盘的层数与型号配置不一致");
    const options = await viaExchange(this.runtime, [2, 2], (r) => r[1] === 2),
      bytes = new Uint8Array(LAYERS * ROWS * COLS * 2);
    for (let offset = 0; offset < bytes.length; offset += 28) {
      const size = Math.min(28, bytes.length - offset),
        prefix = [0x12, offset >> 8, offset & 255, size];
      const reply = await viaExchange(this.runtime, prefix, (r) =>
        prefix.every((v, i) => r[i] === v),
      );
      bytes.set(reply.slice(4, 4 + size), offset);
    }
    return {
      format: "athena-keymap-v1",
      uid: this.profile.uid,
      ...(this.profile.id!=="athena75"?{model:this.profile.id}:{}),
      protocol: 12,
      layers,
      rows: ROWS,
      cols: COLS,
      layoutOptions: new DataView(options.buffer).getUint32(2),
      keycodes: Array.from(
        { length: bytes.length / 2 },
        (_, i) => bytes[i * 2] * 256 + bytes[i * 2 + 1],
      ),
    };
  }
  async set(change) {
    const {rows:ROWS,cols:COLS,layers:LAYERS}=this.profile;
    const { layer, row, col, after } = change;
    if (
      ![layer, row, col, after].every(Number.isInteger) ||
      layer < 0 ||
      layer >= LAYERS ||
      row < 0 ||
      row >= ROWS ||
      col < 0 ||
      col >= COLS ||
      after < 0 ||
      after > 65535
    )
      throw Error("键位地址或功能无效");
    const packet = [5, layer, row, col, after >> 8, after & 255];
    await viaExchange(this.runtime, packet, (r) =>
      packet.every((v, i) => r[i] === v),
    );
    const reply = await viaExchange(
      this.runtime,
      [4, layer, row, col],
      (r) => r[1] === layer && r[2] === row && r[3] === col,
    );
    if (reply[4] * 256 + reply[5] !== after)
      throw Error(`第 ${layer} 层键位回读失败`);
  }
  async applyLayout(before, options, saveBackup) {
    validateKeymap(before);
    if(profileForMap(before).id!==this.profile.id)throw Error("键位文件与键盘型号不匹配");
    if (!Number.isInteger(options) || options < 0 || options > 0xffffffff ||
        ((before.layoutOptions ^ options) & ~this.profile.physicalMask))
      throw Error("只能修改物理布局，其他键盘参数必须保留");
    if ((before.layoutOptions ^ options) & ~this.profile.deviceLayoutMask)
      throw Error("当前固件无法保存分裂 Backspace；需要升级布局存储支持");
    if (options === before.layoutOptions) return before;
    const current = await this.read();
    if (changesBetween(before, current).length)
      throw Error("键盘配置已变化，请重新读取后再切换布局");
    await saveBackup(current);
    const packet = [3, 2, options >>> 24, (options >>> 16) & 255, (options >>> 8) & 255, options & 255];
    try {
      await viaExchange(this.runtime, packet, r => packet.every((v,i) => r[i] === v));
      const result = await this.read();
      if (result.layoutOptions !== options ||
          result.keycodes.some((code,i) => code !== current.keycodes[i]))
        throw Error("布局回读与预期不一致");
      return result;
    } catch (e) {
      throw Error(`${e.message}。请重新读取核对布局；修改前配置已备份。`);
    }
  }
  async apply(before, after, saveBackup, onProgress = () => {}) {
    if(profileForMap(before).id!==this.profile.id)throw Error("键位文件与键盘型号不匹配");
    const changes = changesBetween(before, after);
    if (!changes.length) return before;
    const current = await this.read();
    if (changesBetween(before, current).length)
      throw Error("键盘键位已被其他工具修改，请先重新读取，再调整");
    await saveBackup(current); // Must durably finish before any EEPROM write.
    let written = 0;
    try {
      for (const change of changes) {
        await this.set(change);
        written++;
        onProgress(written, changes.length);
      }
      const result = await this.read();
      if (changesBetween(after, result).length)
        throw Error("完整键位回读与预期不一致");
      return result;
    } catch (e) {
      throw Error(
        `${e.message}。已确认写入 ${written}/${changes.length} 项，请重新读取核对；写入前备份可下载恢复。`,
      );
    }
  }
}
