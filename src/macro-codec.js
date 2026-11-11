// Vial protocol 6 macros: NUL-separated, SS_QMK_PREFIX=1, base-255 delays.
export function splitMacros(buffer, count) {
  if (!buffer.length || buffer.at(-1) !== 0)
    throw Error("宏区尚未完成写入；请恢复写入前备份");
  const result = [];
  let start = 0;
  for (let i = 0; i < buffer.length - 1 && result.length < count; i++)
    if (!buffer[i]) {
      result.push(buffer.slice(start, i));
      start = i + 1;
    }
  if (result.length !== count) throw Error("宏区格式不完整，请先导出原始备份");
  return result;
}
export function packMacros(macros, size) {
  if (
    macros.some((m) =>
      Array.from(m).some((b) => !Number.isInteger(b) || b < 1 || b > 255),
    )
  )
    throw Error("宏内容不能包含结束符");
  const used = macros.reduce((n, m) => n + m.length + 1, 0);
  if (used > size - 1)
    throw Error(`宏空间不足：需要 ${used + 1} 字节，可用 ${size} 字节`);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const m of macros) {
    out.set(m, offset);
    offset += m.length + 1;
  }
  return out;
}
export function encodeMacro(actions) {
  const out = [],
    held = new Set();
  for (const a of actions) {
    if (a.type === "text") {
      if (!/^[\x20-\x7e\n\r\t]*$/.test(a.value))
        throw Error(
          "文字宏支持英文、数字及英文符号；中文需系统输入法配合，不能直接写入",
        );
      out.push(...new TextEncoder().encode(a.value));
      continue;
    }
    const n = Number(a.value);
    if (!Number.isInteger(n)) throw Error("键码或延迟必须为整数");
    if (a.type === "delay") {
      if (n < 0 || n > 65024) throw Error("单步延迟须为 0–65024 毫秒");
      out.push(1, 4, (n % 255) + 1, Math.floor(n / 255) + 1);
      continue;
    }
    const op = { tap: 1, down: 2, up: 3 }[a.type];
    if (!op || n < 2 || n >= 0xff00) throw Error("宏按键须为有效的非透明键码");
    if (a.type === "down") {
      if (held.has(n)) throw Error("同一按键重复按下，请先释放");
      held.add(n);
    }
    if (a.type === "up") {
      if (!held.delete(n)) throw Error("释放前必须有对应的按下步骤");
    }
    if (n <= 255) out.push(1, op, n);
    else {
      const encoded = n & 255 ? n : 0xff00 | (n >> 8);
      out.push(1, op + 4, encoded & 255, encoded >> 8);
    }
  }
  if (held.size) throw Error("宏结束前请释放所有按住的键，避免卡键");
  return Uint8Array.from(out);
}
export function decodeMacro(bytes) {
  const actions = [];
  let text = "";
  const flush = () => {
    if (text) {
      actions.push({ type: "text", value: text });
      text = "";
    }
  };
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i++];
    if (b !== 1) {
      if (b < 9 || b > 126 || (b < 32 && ![9, 10, 13].includes(b)))
        throw Error("包含不能编辑的原始宏数据，请使用原始备份");
      text += String.fromCharCode(b);
      continue;
    }
    flush();
    const op = bytes[i++],
      len = op <= 3 ? 1 : 2;
    if (![1, 2, 3, 4, 5, 6, 7].includes(op) || i + len > bytes.length)
      throw Error("未知或不完整的宏指令；原数据已保留");
    let n = bytes[i++];
    if (!n) throw Error("宏指令无效");
    if (len === 2) {
      const hi = bytes[i++];
      if (!hi) throw Error("宏指令无效");
      n = op === 4 ? n - 1 + (hi - 1) * 255 : n + hi * 256;
    }
    if (op >= 5 && n > 0xff00) n = (n & 255) << 8;
    actions.push({
      type: op === 4 ? "delay" : ["tap", "down", "up"][(op - 1) % 4],
      value: n,
    });
  }
  flush();
  return actions;
}
