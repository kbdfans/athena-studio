import {searchText} from "./i18n-core.js";
import { platformKeyLabel } from "./platform-keys.js";
// Modes change the picker only, never device configuration or existing keycodes.
export const PICKER_GROUPS = {
  basic: [
    {
      label: "日常输入",
      items: [
        ["基础", "基础按键"],
        ["小键盘", "数字小键盘"],
      ],
    },
    {
      label: "常用控制",
      items: [
        ["屏幕快捷键", "屏幕快捷键"],
        ["媒体", "媒体控制"],
        ["层切换", "常用层切换"],
        ["鼠标", "鼠标按键"],
        ["布局设置", "布局设置"],
      ],
    },
  ],
  advanced: [
    {
      label: "组合与自动化",
      items: [
        ["快捷组合", "组合快捷键"],
        ["双功能键", "轻按 / 长按"],
        ["宏", "宏"],
        ["多击动作", "多击动作"],
        ["组合触发", "Combo 组合触发"],
        ["按键替换", "按键替换"],
      ],
    },
    {
      label: "扩展键码",
      items: [
        ["层切换", "完整层功能"],
        ["国际键", "国际 / 语言"],
        ["系统", "系统功能"],
        ["灯光", "灯光控制"],
        ["特殊", "固件与特殊"],
        ["全部键码", "全部键码"],
      ],
    },
    { label: "行为设置", items: [["高级参数", "高级参数"]] },
  ],
};
export function isCommonKey(k) {
  const c = k.code;
  return (
    (c <= 0x63 && c !== 0x32) ||
    [0x65, 0x67, 0x7e04, 0x7e05, 0x7e10, 0x7e11, 0x7e12].includes(c) ||
    (c >= 0xe0 && c <= 0xe7) ||
    [
      0xa8, 0xa9, 0xaa, 0xab, 0xac, 0xad, 0xae, 0xb2, 0xbd, 0xbe, 0xcd, 0xce,
      0xcf, 0xd0, 0xd1, 0xd2, 0xd3, 0xd9, 0xda,
    ].includes(c) ||
    [0x5200, 0x5220, 0x5260, 0x5280].some((base) => c >= base && c < base + 8)
  );
}
export function categoryKeys(keys, mode, category, query = "") {
  const q = query.trim().toLowerCase();
  return keys.filter(
    (k) =>
      (mode === "advanced" || isCommonKey(k)) &&
      (q || category === "全部键码" || k.category === category) &&
      (!q ||
        `${platformKeyLabel(k)} ${searchText(k)}`
          .toLowerCase()
          .includes(q)),
  );
}
