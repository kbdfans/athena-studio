export const MOD_LABELS = ["Ctrl", "Shift", "Alt / Option", "GUI / Cmd"];
const integer = (n, min, max, name) => {
  if (!Number.isInteger(n) || n < min || n > max)
    throw Error(`${name}须为 ${min}–${max}`);
  return n;
};
export function buildKeycode(type, { key = 4, layer = 1, mods = 1 } = {}) {
  if (["MODS", "MT", "LT"].includes(type)) integer(key, 0, 255, "轻按键码");
  if (["LT", "LM", "MO", "TO", "DF", "TG", "OSL", "TT", "PDF"].includes(type))
    integer(layer, 0, 7, "层");
  if (["MODS", "MT", "LM", "OSM"].includes(type)) {
    integer(mods, 1, 31, "修饰键");
    if (!(mods & 15)) throw Error("至少选择一个修饰键");
  }
  if (type === "MODS") return (mods << 8) | key;
  if (type === "MT") return 0x2000 | (mods << 8) | key;
  if (type === "LT") return 0x4000 | (layer << 8) | key;
  if (type === "LM") return 0x5000 | (layer << 5) | mods;
  if (type === "OSM") return 0x52a0 | mods;
  const bases = {
    TO: 0x5200,
    MO: 0x5220,
    DF: 0x5240,
    TG: 0x5260,
    OSL: 0x5280,
    TT: 0x52c0,
    PDF: 0x52e0,
  };
  if (type in bases) return bases[type] | layer;
  throw Error("未知组合键类型");
}
export function decodeKeycode(code) {
  if (code >= 0x100 && code <= 0x1fff)
    return { type: "MODS", key: code & 255, mods: code >> 8 };
  if (code >= 0x2000 && code <= 0x3fff)
    return { type: "MT", key: code & 255, mods: (code >> 8) & 31 };
  if (code >= 0x4000 && code <= 0x4fff)
    return { type: "LT", key: code & 255, layer: (code >> 8) & 15 };
  if (code >= 0x5000 && code <= 0x51ff)
    return { type: "LM", layer: (code >> 5) & 15, mods: code & 31 };
  if (code >= 0x52a0 && code <= 0x52bf) return { type: "OSM", mods: code & 31 };
  return null;
}
export function modsLabel(mods) {
  return MOD_LABELS.filter((_, i) => mods & (1 << i))
    .map((s) => (mods & 16 ? "R" : "") + s.split(" / ")[0])
    .join("+");
}
