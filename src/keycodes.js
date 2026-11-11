import {SCREEN_SHORTCUTS} from "./screen-shortcuts.js";
import { QMK_CATALOG, QMK_NAMES } from "./qmk-catalog.js";
import { buildKeycode, decodeKeycode, modsLabel } from "./keycode-builders.js";
// QMK keycodes from the pinned Athena firmware (be6d662b), not legacy VIA codes.
const keys = [];
const add = (code, label, title, category = "基础") =>
  keys.push({ code, label, title, category });
for (let i = 0; i < 26; i++)
  add(
    4 + i,
    String.fromCharCode(65 + i),
    `字母 ${String.fromCharCode(65 + i)}`,
  );
for (let i = 0; i < 10; i++)
  add(30 + i, String((i + 1) % 10), `数字 ${(i + 1) % 10}`);
for (const [code, label, title] of [
  [40, "Enter", "回车"],
  [41, "Esc", "退出"],
  [42, "⌫", "Backspace 退格"],
  [43, "Tab", "制表"],
  [44, "Space", "空格"],
  [45, "−", "减号"],
  [46, "=", "等号"],
  [47, "[", "左方括号"],
  [48, "]", "右方括号"],
  [49, "\\", "反斜杠"],
  [50, "#", "非美式 #"],
  [51, ";", "分号"],
  [52, "'", "单引号"],
  [53, "`", "反引号"],
  [54, ",", "逗号"],
  [55, ".", "句号"],
  [56, "/", "斜杠"],
  [57, "Caps", "Caps Lock 大写锁定"],
  [100, "ISO \\", "ISO 额外键"],
])
  add(code, label, title);
for (let i = 0; i < 24; i++)
  add(i < 12 ? 58 + i : 104 + i - 12, `F${i + 1}`, `功能键 F${i + 1}`);
for (const [code, label, title] of [
  [70, "PrtSc", "截屏"],
  [71, "ScrLk", "滚动锁定"],
  [72, "Pause", "暂停"],
  [73, "Ins", "插入"],
  [74, "Home", "行首"],
  [75, "PgUp", "上一页"],
  [76, "Del", "删除"],
  [77, "End", "行尾"],
  [78, "PgDn", "下一页"],
  [79, "→", "方向右"],
  [80, "←", "方向左"],
  [81, "↓", "方向下"],
  [82, "↑", "方向上"],
])
  add(code, label, title, "导航");
["Ctrl", "Shift", "Alt", "Cmd", "RCtrl", "RShift", "RAlt", "RCmd"].forEach(
  (label, i) =>
    add(
      224 + i,
      label,
      `${i < 4 ? "左" : "右"} ${["Control", "Shift", "Alt / Option", "GUI / Windows / Command"][i % 4]}`,
      "修饰键",
    ),
);
for (const [code, label, title] of [
  [0xa8, "静音", "音量静音"],
  [0xa9, "音量＋", "音量增加"],
  [0xaa, "音量－", "音量减少"],
  [0xab, "下一首", "媒体下一首"],
  [0xac, "上一首", "媒体上一首"],
  [0xad, "停止", "媒体停止"],
  [0xae, "播放 / 暂停", "媒体播放或暂停"],
  [0xbd, "亮度＋", "屏幕亮度增加"],
  [0xbe, "亮度－", "屏幕亮度降低"],
  [0xb2, "计算器", "打开计算器"],
])
  add(code, label, title, "媒体");
for (let l = 0; l < 8; l++) {
  add(0x5220 + l, `MO(${l})`, `按住启用第 ${l} 层，松开返回`, "层切换");
  add(0x5260 + l, `TG(${l})`, `切换第 ${l} 层开关`, "层切换");
  add(0x5200 + l, `TO(${l})`, `跳转到第 ${l} 层`, "层切换");
  add(0x5280 + l, `OSL(${l})`, `下一次按键使用第 ${l} 层`, "层切换");
}
add(0, "禁用", "此键无动作", "特殊");
add(1, "▽", "透明：沿用下层按键", "特殊");
add(0x7e04, "切换图片", "Athena 屏幕：下一张图片", "特殊");
add(0x7e05, "屏幕开关", "Athena 屏幕：开启 / 关闭", "特殊");
for (const [c, n] of [
  [0xcd, "鼠标 ↑"],
  [0xce, "鼠标 ↓"],
  [0xcf, "鼠标 ←"],
  [0xd0, "鼠标 →"],
  [0xd1, "鼠标左键"],
  [0xd2, "鼠标右键"],
  [0xd3, "鼠标中键"],
  [0xd9, "滚轮 ↑"],
  [0xda, "滚轮 ↓"],
])
  add(c, n, n, "鼠标");
keys.push(...SCREEN_SHORTCUTS);
for (const entry of QMK_CATALOG) {
  const old = keys.find((k) => k.code === entry.code);
  if (old) {
    old.name = entry.name;
    continue;
  }
  const label = entry.name.replace(/^(KC_|QK_)/, "").replaceAll("_", " ");
  add(entry.code, label, entry.name, entry.category);
  keys.at(-1).name = entry.name;
}
for (let l = 0; l < 8; l++) {
  add(0x5240 + l, `DF(${l})`, `设第 ${l} 层为默认层（本次通电）`, "层切换");
  add(0x52c0 + l, `TT(${l})`, `按住启用第 ${l} 层，连按切换锁定`, "层切换");
  add(0x52e0 + l, `PDF(${l})`, `持久默认第 ${l} 层（断电保留）`, "层切换");
}
const translated = {
  0x7c00: "进入升级模式",
  0x7c01: "重启键盘",
  0x7c03: "清空键盘配置（会重置）",
  0x7c16: "Esc / Shift+波浪号",
  0xa5: "系统关机",
  0xa6: "系统睡眠",
  0xa7: "唤醒系统",
};
for (const k of keys)
  if (translated[k.code]) {
    k.label = translated[k.code];
    k.title += " · " + k.label;
  }
// Friendly labels retain canonical names for search and protocol inspection.
const commonLabels = {
  83: "Num Lock",
  84: "÷",
  85: "×",
  86: "−",
  87: "＋",
  88: "Enter",
  99: ".",
  101: "Menu",
  103: "=",
  133: ",",
  134: "AS400 =",
  175: "选择媒体",
  176: "弹出",
  177: "邮件",
  179: "我的电脑",
  180: "网页搜索",
  181: "浏览器主页",
  182: "后退",
  183: "前进",
  184: "网页停止",
  185: "刷新",
  186: "收藏夹",
  187: "快进",
  188: "快退",
  191: "控制面板",
  192: "助手",
  193: "任务视图",
  194: "启动台",
  219: "滚轮 ←",
  220: "滚轮 →",
  221: "鼠标慢速",
  222: "鼠标中速",
  223: "鼠标快速",
};
for (let i = 0; i < 10; i++) commonLabels[89 + i] = String((i + 1) % 10);
for (let i = 0; i < 9; i++) {
  commonLabels[135 + i] = `国际 ${i + 1}`;
  commonLabels[144 + i] = `语言 ${i + 1}`;
}
for (let i = 3; i < 8; i++) commonLabels[209 + i] = `鼠标按键 ${i + 1}`;
for (const k of keys)
  if (commonLabels[k.code]) {
    k.label = commonLabels[k.code];
    k.title = `${k.category === "小键盘" ? "数字小键盘 · " : ""}${k.label} · ${k.name || ""}`;
  }
export const KEYCODES = keys;
export const KEY_CATEGORIES = [
  "基础",
  "小键盘",
  "修饰键",
  "导航",
  "媒体",
  "国际键",
  "层切换",
  "鼠标",
  "系统",
  "灯光",
  "特殊",
  "快捷组合",
  "双功能键",
  "宏",
  "多击动作",
  "组合触发",
  "按键替换",
  "高级参数",
];
const byCode = new Map(keys.map((k) => [k.code, k]));
export function keyInfo(code) {
  const packed = decodeKeycode(code);
  if (packed) {
    const { type, key, mods, layer } = packed;
    const label =
      type === "MODS"
        ? `${modsLabel(mods)}+${keyInfo(key).label}`
        : `${type}(${layer ?? modsLabel(mods)}${key === undefined ? "" : "," + keyInfo(key).label})`;
    return {
      code,
      label,
      title:
        type === "MT"
          ? `轻按 ${keyInfo(key).label}，按住 ${modsLabel(mods)}`
          : type === "LT"
            ? `轻按 ${keyInfo(key).label}，按住第 ${layer} 层`
            : label,
      category: "快捷组合",
    };
  }
  if (
    (code >= 0x5700 && code <= 0x57ff) ||
    (code >= 0x7700 && code <= 0x777f)
  ) {
    const td = code < 0x6000,
      index = code & 255;
    return {
      code,
      label: `${td ? "TD" : "M"}(${index})`,
      title: `${td ? "多击动作" : "宏"} ${index}`,
      category: td ? "多击动作" : "宏",
    };
  }
  return (
    byCode.get(code) || {
      code,
      label: `0x${code.toString(16).toUpperCase().padStart(4, "0")}`,
      title: "现有自定义功能（原样保留）",
      category: "特殊",
    }
  );
}
export function parseKeycode(text) {
  const v = text.trim().toUpperCase();
  if (/^0X[0-9A-F]{1,4}$/.test(v)) return Number(v);
  const platformAliases = { OPTION: 226, ROPTION: 230, WIN: 227, RWIN: 231, SUPER: 227, RSUPER: 231 };
  if (v in platformAliases) return platformAliases[v];
  if (v in QMK_NAMES) return QMK_NAMES[v];
  const named = keys.find((k) => k.label.toUpperCase() === v);
  if (named) return named.code;
  const m = /^(MO|TO|DF|TG|OSL|TT|PDF|TD|M)\((\d+)\)$/.exec(v);
  if (m) {
    const n = Number(m[2]);
    if (m[1] === "TD" && n < 256) return 0x5700 + n;
    if (m[1] === "M" && n < 128) return 0x7700 + n;
    return buildKeycode(m[1], { layer: n });
  }
  throw Error("请输入已知 QMK 名称（如 KC_A）或 0x 开头的四位十六进制键码");
}

// Examples describe the same physical position on the target layer.
export function layerExample(code) {
  const key = keyInfo(code);
  if (key.category !== "层切换") return "";
  const layer = code & 31;
  const prefix = `若第 ${layer} 层的 A 位置设为音量＋，`;
  if (key.label.startsWith("MO("))
    return prefix + "按住此键再按 A 调高音量；松开此键恢复。";
  if (key.label.startsWith("TG("))
    return prefix + `触发此键后按 A 调高音量；再触发 TG(${layer}) 关闭该层。`;
  if (key.label.startsWith("TO("))
    return prefix + "按一下此键后，A 持续调高音量；需用其他层切换键返回。";
  if (key.label.startsWith("DF(") || key.label.startsWith("PDF("))
    return (
      prefix + "设为默认层后按 A 调高音量；请先在目标层保留返回第 0 层的键。"
    );
  if (key.label.startsWith("TT("))
    return (
      prefix + "按住此键再按 A 调高音量；连按达到高级参数中的次数后锁定该层。"
    );
  return prefix + "轻按此键，再按一次 A 调高音量；随后恢复原层。";
}
