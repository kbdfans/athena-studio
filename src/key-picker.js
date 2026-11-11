import {searchText} from "./i18n-core.js";
import { platformKeyLabel } from "./platform-keys.js";
import { KEYCODES, keyInfo, parseKeycode } from "./keycodes.js";
import { isCommonKey } from "./keycode-categories.js";
import { decorateFunctionKey } from "./function-palette.js";
export function editableKeyName(code) {
  const info = keyInfo(code);
  // Distinguish numpad 1 from the alpha-section 1, and other duplicate legends.
  return KEYCODES.filter((k) => k.label === info.label).length > 1
    ? info.name || `0x${code.toString(16)}`
    : platformKeyLabel(info);
}
export function pickerKeys(query, group = "常用", basicOnly = false) {
  const q = query.trim().toLowerCase();
  return KEYCODES.filter(
    (k) =>
      (!basicOnly || k.code <= 255) &&
      (!q
        ? group === "全部" ||
          (group === "常用" ? isCommonKey(k) : k.category === group)
        : `${platformKeyLabel(k)} ${searchText(k)}`.toLowerCase().includes(q)),
  );
}
export function openKeyPicker(input) {
  const dialog = document.createElement("dialog");
  dialog.className = "key-picker-dialog";
  dialog.setAttribute("aria-label", "选择按键功能");
  const header = document.createElement("div");
  header.className = "picker-heading";
  const title = document.createElement("h3");
  title.textContent = "选择按键功能";
  const close = document.createElement("button");
  close.textContent = "×";
  close.setAttribute("aria-label", "关闭按键选择器");
  close.onclick = () => dialog.close();
  header.append(title, close);
  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "搜索名称，例如空格、回车、KC_A";
  search.setAttribute("aria-label", "搜索要选择的按键");
  const tabs = document.createElement("div");
  tabs.className = "picker-tabs";
  const hint = document.createElement("div");
  hint.className = "function-hint";
  hint.setAttribute("aria-hidden", "true");
  hint.dataset.i18nSkip = "";
  const list = document.createElement("div");
  list.className = "picker-results";
  list.setAttribute("aria-label", "按键搜索结果");
  let group = "常用";
  const choose = (code) => {
    input.value = editableKeyName(code);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    dialog.close();
  };
  const render = () => {
    list.replaceChildren();
    for (const b of tabs.children)
      b.setAttribute("aria-pressed", String(b.dataset.group === group));
    const found = pickerKeys(
      search.value,
      group,
      input.dataset.basicOnly === "true",
    );
    for (const k of found) {
      const b = decorateFunctionKey(document.createElement("button"), platformKeyLabel(k), k.title);
      b.onclick = () => choose(k.code);
      list.append(b);
    }
    if (!found.length) {
      const p = document.createElement("p");
      p.textContent = "未找到按键。可在下方输入 QMK 名称或十六进制键码。";
      list.append(p);
    }
  };
  for (const name of [
    "常用",
    "小键盘",
    "修饰键",
    "导航",
    "媒体",
    ...(input.dataset.basicOnly === "true" ? [] : ["层切换"]),
    "全部",
  ]) {
    const b = document.createElement("button");
    b.textContent = name;
    b.dataset.group = name;
    b.onclick = () => {
      group = name;
      search.value = "";
      render();
    };
    tabs.append(b);
  }
  const custom = document.createElement("details");
  custom.className = "picker-custom";
  const summary = document.createElement("summary");
  summary.textContent = "手动输入 QMK 键码";
  const raw = document.createElement("input");
  raw.placeholder = "KC_A / TD(0) / 0x0004";
  raw.setAttribute("aria-label", "手动键码");
  const use = document.createElement("button");
  use.textContent = "使用键码";
  const error = document.createElement("p");
  error.setAttribute("role", "alert");
  use.onclick = () => {
    try {
      const c = parseKeycode(raw.value);
      if (input.dataset.basicOnly === "true" && c > 255)
        throw Error("此动作只能使用基础按键，请勿嵌套层或宏功能");
      choose(c);
    } catch (e) {
      error.textContent = e.message;
    }
  };
  custom.append(summary, raw, use, error);
  dialog.append(header, search, tabs, hint, list, custom);
  dialog.addEventListener("close", () => {
    dialog.remove();
    input.focus();
  });
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });
  search.oninput = render;
  document.body.append(dialog);
  render();
  dialog.showModal();
  search.focus();
}
export function keyFieldControl(input) {
  const wrap = document.createElement("div");
  wrap.className = "key-field-control";
  const pick = document.createElement("button");
  pick.type = "button";
  pick.textContent = "选择";
  pick.setAttribute(
    "aria-label",
    `选择${input.getAttribute("aria-label") || "按键"}`,
  );
  pick.onclick = () => openKeyPicker(input);
  wrap.append(input, pick);
  return wrap;
}
