import { viaExchange } from "./keymap-protocol.js";
import { settingById } from "./qmk-settings.js";
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const check = (ok, message) => {
  if (!ok) throw Error(message);
};
export const words = (values) =>
  Uint8Array.from(values.flatMap((v) => [v & 255, v >> 8]));
export const unwords = (bytes) =>
  Array.from(
    { length: bytes.length / 2 },
    (_, i) => bytes[i * 2] + bytes[i * 2 + 1] * 256,
  );
export class AdvancedDevice {
  constructor(runtime) {
    this.runtime = runtime;
    this.caps = null;
  }
  async vial(command, rest = [], match = (r) => r[0] === 0 || r[0] === 255) {
    const r = await viaExchange(
      this.runtime,
      [0xfe, command, ...rest],
      (r) => !(r[0] === 0xfd && r[1] === 0xa8) && match(r),
      null,
    );
    return r;
  }
  async status(command, rest) {
    const r = await this.vial(command, rest);
    check(r[0] === 0, "固件拒绝此配置，请检查设备支持与解锁状态");
    return r;
  }
  async capabilities() {
    const r = await this.vial(13, [0], (r) => r.slice(3).every((v) => v === 0));
    const count = (await viaExchange(this.runtime, [12], () => true))[1];
    const size = await viaExchange(this.runtime, [13], () => true);
    check(
      r.slice(0, 3).every((n) => n <= 128) && count <= 128,
      "高级配置容量异常",
    );
    const settings = [];
    let last = 0;
    for (let page = 0; page < 16; page++) {
      const reply = await this.vial(
        9,
        [last & 255, last >> 8],
        (r) => r[0] !== 0xfe,
      );
      const ids = unwords(reply);
      let end = false;
      for (const id of ids) {
        if (id === 65535) {
          end = true;
          break;
        }
        check(id > last, "参数列表无效");
        settings.push(id);
        last = id;
      }
      if (end) break;
      if (page === 15) throw Error("参数列表过长");
    }
    return (this.caps = {
      td: r[0],
      combo: r[1],
      override: r[2],
      macros: count,
      macroSize: size[1] * 256 + size[2],
      settings,
    });
  }
  validEntry(type, index) {
    check(
      this.caps &&
        ["td", "combo", "override"].includes(type) &&
        Number.isInteger(index) &&
        index >= 0 &&
        index < this.caps[type],
      "配置编号超出设备容量",
    );
  }
  async readEntry(type, index) {
    this.validEntry(type, index);
    const op = { td: 1, combo: 3, override: 5 }[type];
    return (await this.status(13, [op, index])).slice(1, 11);
  }
  async applyEntry(type, index, before, after, backup) {
    this.validEntry(type, index);
    check(after.length === 10 && before.length === 10, "配置长度无效");
    const current = await this.readEntry(type, index);
    check(same(current, before), "键盘配置已变化，请重新读取后编辑");
    if (same(before, after)) return current;
    await backup({ kind: type, index, bytes: [...before] });
    await this.status(13, [
      { td: 2, combo: 4, override: 6 }[type],
      index,
      ...after,
    ]);
    const result = await this.readEntry(type, index);
    check(same(result, after), "配置回读不一致，请重新读取；自动备份可恢复");
    return result;
  }
  async readMacros() {
    check(this.caps?.macroSize > 0, "设备没有可用宏空间");
    const b = new Uint8Array(this.caps.macroSize);
    for (let o = 0; o < b.length; o += 28) {
      const n = Math.min(28, b.length - o);
      const r = await viaExchange(
        this.runtime,
        [14, o >> 8, o & 255, n],
        (r) => r[1] === o >> 8 && r[2] === (o & 255) && r[3] === n,
      );
      b.set(r.slice(4, 4 + n), o);
    }
    return b;
  }
  async macroChunk(o, bytes) {
    await viaExchange(
      this.runtime,
      [15, o >> 8, o & 255, bytes.length, ...bytes],
      (r) => r[1] === o >> 8 && r[2] === (o & 255) && r[3] === bytes.length,
    );
  }
  async applyMacros(before, after, backup) {
    check(
      after.length === this.caps?.macroSize &&
        before.length === after.length &&
        after.at(-1) === 0,
      "宏区长度或提交标志无效",
    );
    check(
      same(await this.readMacros(), before),
      "宏已在其他窗口变化，请重新读取",
    );
    if (same(before, after)) return before;
    await backup({
      kind: "macros",
      bytes: [...before],
      count: this.caps.macros,
    });
    const end = after.length - 1;
    await this.macroChunk(end, [255]);
    // Verify the playback gate BEFORE mutating any macro data.
    const gated = await this.readMacros();
    check(
      gated[end] === 255 && same(gated.slice(0, end), before.slice(0, end)),
      "宏写入保护未生效，已停止",
    );
    for (let o = 0; o < end; o += 28) {
      const n = Math.min(28, end - o);
      if (!same(before.slice(o, o + n), after.slice(o, o + n)))
        await this.macroChunk(o, after.slice(o, o + n));
    }
    const staged = await this.readMacros();
    check(
      staged[end] === 255 && same(staged.slice(0, end), after.slice(0, end)),
      "宏回读失败，播放已暂停；请恢复自动备份",
    );
    await this.macroChunk(end, [0]);
    const result = await this.readMacros();
    check(same(result, after), "宏提交未确认，请重新连接后检查");
    return result;
  }
  async readSetting(id) {
    const s = settingById(id);
    check(s && this.caps?.settings.includes(id), "设备不支持此参数");
    return (await this.status(10, [id & 255, id >> 8])).slice(1, 1 + s.size);
  }
  async applySetting(id, before, after, backup) {
    const size = settingById(id)?.size;
    check(
      size && before.length === size && after.length === size,
      "参数长度无效",
    );
    check(same(await this.readSetting(id), before), "参数已变化，请重新读取");
    if (same(before, after)) return before;
    await backup({ kind: "setting", index: id, bytes: [...before] });
    await this.status(11, [id & 255, id >> 8, ...after]);
    const r = await this.readSetting(id);
    check(same(r, after), "参数回读不一致，请重新读取");
    return r;
  }
}
