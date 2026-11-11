// IDs and widths pinned to quantum/qmk_settings.c at be6d662b.
export const QMK_SETTINGS = [
  [
    1,
    "Esc / 波浪号例外",
    1,
    ["Alt 强制 Esc", "Ctrl 强制 Esc", "GUI 强制 Esc", "Shift 强制 Esc"],
  ],
  [2, "组合触发等待时间（ms）", 2],
  [
    3,
    "自动 Shift",
    1,
    [
      "启用",
      "允许修饰键",
      "排除符号",
      "排除数字",
      "排除字母",
      "允许重复",
      "禁用自动重复",
    ],
  ],
  [4, "自动 Shift 长按时间（ms）", 2],
  [5, "一次性修饰键锁定连按次数", 1],
  [6, "一次性按键超时（ms）", 2],
  [7, "轻按 / 长按分界（ms）", 2],
  [
    8,
    "双功能键行为",
    1,
    [
      "宽容长按 Permissive Hold",
      "忽略其他键按下",
      "禁用快速连按 Quick Tap",
      "长按后独立松开算轻按",
    ],
  ],
  [9, "鼠标启动延迟（ms）", 2],
  [10, "鼠标移动间隔（ms）", 2],
  [11, "鼠标每步距离", 2],
  [12, "鼠标最高速度", 2],
  [13, "鼠标加速步数", 2],
  [14, "滚轮启动延迟（10ms 单位）", 2],
  [15, "滚轮间隔（ms）", 2],
  [16, "滚轮最高速度", 2],
  [17, "滚轮加速步数", 2],
  [18, "模拟轻按持续时间（ms）", 2],
  [19, "Caps 双功能轻按持续时间（ms）", 2],
  [20, "TT 锁层连按次数", 1],
  [
    21,
    "系统修饰键配置",
    4,
    [
      "交换 Ctrl / Caps",
      "Caps 改为 Ctrl",
      "交换左 Alt / GUI",
      "交换右 Alt / GUI",
      "禁用 GUI",
      "交换 Grave / Esc",
      "交换反斜杠 / 退格",
      "NKRO 全键无冲",
      "交换左 Ctrl / GUI",
      "交换右 Ctrl / GUI",
    ],
  ],
].map(([id, label, size, bits]) => ({ id, label, size, bits }));
export const settingById = (id) => QMK_SETTINGS.find((s) => s.id === id);
export function encodeSetting(id, value) {
  const s = settingById(id);
  if (!s) throw Error("未知参数");
  // The firmware copies several mouse values into uint8_t globals.
  const max = [10, 12, 13, 14, 15, 16, 17].includes(id)
    ? 255
    : id === 9
      ? 2550
      : 2 ** (8 * s.size) - 1;
  if (!Number.isInteger(value) || value < 0 || value > max)
    throw Error(`${s.label}须为 0–${max}`);
  const b = new Uint8Array(s.size);
  for (let i = 0; i < s.size; i++)
    b[i] = Math.floor(value / 2 ** (8 * i)) & 255;
  return b;
}
export const decodeSetting = (bytes) =>
  Array.from(bytes).reduce((n, b, i) => n + b * 2 ** (8 * i), 0);
