export class KeyboardTestState {
  held = new Set();
  seen = new Set();
  total = 0;
  history = [];
  update(keys) {
    const next = new Set(keys), added = [...next].filter((k) => !this.held.has(k));
    for (const key of added) {
      this.seen.add(key);
      this.total++;
      this.history.unshift(key);
    }
    this.history.length = Math.min(this.history.length, 10);
    this.held = next;
    return added;
  }
  release() { this.held.clear(); }
  clear() { this.held.clear(); this.seen.clear(); this.total = 0; this.history = []; }
}
export function matrixKeys(rows,expectedRows=11) {
  if (!Array.isArray(rows) || rows.length !== expectedRows || rows.some((r) => !Number.isInteger(r) || r < 0 || r > 255)) throw Error("按键矩阵数据无效");
  return rows.flatMap((bits, row) => Array.from({length: 8}, (_, col) => bits & (1 << col) ? `${row},${col}` : null).filter(Boolean));
}
export function browserCode(code) {
  if (code >= 4 && code <= 29) return `Key${String.fromCharCode(65 + code - 4)}`;
  if (code >= 30 && code <= 39) return `Digit${(code - 29) % 10}`;
  if (code >= 58 && code <= 69) return `F${code - 57}`;
  if (code >= 104 && code <= 115) return `F${code - 91}`;
  if (code >= 89 && code <= 97) return `Numpad${code - 88}`;
  return ({70:'PrintScreen',71:'ScrollLock',72:'Pause',83:'NumLock',84:'NumpadDivide',85:'NumpadMultiply',86:'NumpadSubtract',87:'NumpadAdd',88:'NumpadEnter',98:'Numpad0',99:'NumpadDecimal',101:'ContextMenu',103:'NumpadEqual',135:'IntlRo',137:'IntlYen',40:'Enter',41:'Escape',42:'Backspace',43:'Tab',44:'Space',45:'Minus',46:'Equal',47:'BracketLeft',48:'BracketRight',49:'Backslash',51:'Semicolon',52:'Quote',53:'Backquote',54:'Comma',55:'Period',56:'Slash',57:'CapsLock',73:'Insert',74:'Home',75:'PageUp',76:'Delete',77:'End',78:'PageDown',79:'ArrowRight',80:'ArrowLeft',81:'ArrowDown',82:'ArrowUp',100:'IntlBackslash',224:'ControlLeft',225:'ShiftLeft',226:'AltLeft',227:'MetaLeft',228:'ControlRight',229:'ShiftRight',230:'AltRight',231:'MetaRight'})[code];
}
