import { platformModifierLabels } from "./platform-keys.js";
import { editableKeyName, keyFieldControl } from "./key-picker.js";
import { AdvancedDevice, words, unwords } from "./advanced-protocol.js";
import { buildKeycode } from "./keycode-builders.js";
import { KEYCODES, keyInfo, parseKeycode } from "./keycodes.js";
import {
  splitMacros,
  packMacros,
  encodeMacro,
  decodeMacro,
} from "./macro-codec.js";
import {
  QMK_SETTINGS,
  settingById,
  encodeSetting,
  decodeSetting,
} from "./qmk-settings.js";
import { ATHENA_UID } from "./device.js";
import { digest } from "./backup-v2.js";
export const ADVANCED_CATEGORIES = [
  "快捷组合",
  "双功能键",
  "宏",
  "多击动作",
  "组合触发",
  "按键替换",
  "高级参数",
];

const hex = (n) => "0x" + n.toString(16).toUpperCase().padStart(4, "0");
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const button = (text, fn) => {
  const b = el("button", "", text);
  b.type = "button";
  b.onclick = fn;
  return b;
};
function field(parent, label, input) {
  const l = el("label", "advanced-field");
  input.setAttribute("aria-label", label);
  l.append(
    el("span", "", label),
    input.dataset.keyInput ? keyFieldControl(input) : input,
  );
  parent.append(l);
  return input;
}
function select(options, value) {
  const s = el("select");
  for (const [v, label] of options) {
    const o = el("option", "", label);
    o.value = v;
    s.append(o);
  }
  s.value = value;
  return s;
}
function number(value, min, max) {
  const i = el("input");
  Object.assign(i, { type: "number", value, min, max, step: 1 });
  return i;
}
function keyInput(value) {
  const i = el("input");
  i.value = typeof value === "string" ? value : editableKeyName(value);
  i.dataset.keyInput = "true";
  i.setAttribute("list", "qmk-keycode-names");
  i.spellcheck = false;
  return i;
}
function keyValue(input) {
  return parseKeycode(input.value);
}
function bits(parent, label, value, names) {
  const box = el("fieldset", "advanced-bits");
  box.append(el("legend", "", label));
  const inputs = [];
  names.forEach((name, i) => {
    const l = el("label");
    const c = el("input");
    c.type = "checkbox";
    c.checked = !!(value & (1 << i));
    l.append(c, document.createTextNode(name));
    if (name === "保留位") {
      c.disabled = true;
      l.hidden = true;
    }
    box.append(l);
    inputs.push(c);
  });
  parent.append(box);
  return () =>
    inputs.reduce(
      (n, c, i) => n | (c.checked ? 1 << i : 0),
      value & ~((1 << names.length) - 1),
    );
}
function download(data, name) {
  const a = el("a");
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function setupAdvanced({
  getDevice,
  ready,
  getBusy,
  run,
  assign,
  notice,
  getTarget = () => "当前按键",
}) {
  const model=()=>getDevice()?.profile?.id||"athena75";
  const storageKey=()=>`athena-advanced-backups-v1-${ATHENA_UID}${model()==="athena75"?"":"-"+model()}`;
  let api = null,
    bound = null,
    current = "",
    panel = null,
    status = null,
    cache = new Map();
  const datalist = el("datalist");
  datalist.id = "qmk-keycode-names";
  for (const k of KEYCODES) {
    const o = el("option");
    o.value = k.name || hex(k.code);
    o.label = `${k.label} · ${k.title}`;
    datalist.append(o);
  }
  document.body.append(datalist);
  const report = (message, error = false) => {
    if (status) {
      status.textContent = message;
      status.classList.toggle("error", error);
    }
    notice(message, error);
  };
  const task = (fn) =>
    run(async () => {
      try {
        await fn();
      } catch (e) {
        report(e.message, true);
        throw e;
      }
    });
  async function ensure() {
    if (!ready()) throw Error("请先连接键盘并读取键位");
    if (bound !== getDevice()) {
      bound = getDevice();
      api = new AdvancedDevice(bound);
    }
    if (!api.caps) await api.capabilities();
    return api;
  }
  async function backup(record) {
    const data = JSON.stringify({
      format: "athena-advanced-entry-v1",
      uid: ATHENA_UID,
      model:model(),
      created: new Date().toISOString(),
      ...record,
    });
    const sha256 = await digest(new TextEncoder().encode(data));
    let old = JSON.parse(localStorage.getItem(storageKey()) || "[]");
    localStorage.setItem(
      storageKey(),
      JSON.stringify([{ data, sha256 }, ...old].slice(0, 30)),
    );
    const saved = JSON.parse(localStorage.getItem(storageKey()) || "[]")[0];
    if (saved?.data !== data || saved.sha256 !== sha256)
      throw Error("高级配置备份保存失败，未开始写入");
  }
  function safe(fn) {
    return () => {
      try {
        fn();
      } catch (e) {
        report(e.message, true);
      }
    };
  }
  function tools(root) {
    const row = el("div", "advanced-tools");
    row.append(
      button("导出最近自动备份", () =>
        task(async () => {
          const b = JSON.parse(localStorage.getItem(storageKey()) || "[]")[0];
          if (
            !b ||
            (await digest(new TextEncoder().encode(b.data))) !== b.sha256
          )
            throw Error("尚无可用备份");
          download(JSON.parse(b.data), "athena-advanced-before.json");
        }),
      ),
      button("导出全部高级配置", () =>
        task(async () => {
          const a = await ensure();
          const data = {
            format: "athena-advanced-v1",
            uid: ATHENA_UID,
      model:model(),
            created: new Date().toISOString(),
            caps: a.caps,
            entries: {},
            settings: {},
          };
          for (const type of ["td", "combo", "override"]) {
            data.entries[type] = [];
            for (let i = 0; i < a.caps[type]; i++)
              data.entries[type].push([...(await a.readEntry(type, i))]);
          }
          data.macros = [...(await a.readMacros())];
          for (const id of a.caps.settings)
            if (settingById(id))
              data.settings[id] = [...(await a.readSetting(id))];
          download(data, "athena-advanced-all.json");
          report("全部高级配置已读取并导出");
        }),
      ),
    );
    const input = el("input");
    input.type = "file";
    input.accept = ".json";
    input.hidden = true;
    row.append(
      button("恢复单项备份", () => input.click()),
      input,
    );
    input.onchange = () =>
      task(async () => {
        const f = input.files[0];
        input.value = "";
        if (!f) return;
        if (f.size > 1048576) throw Error("备份过大");
        const b = JSON.parse(await f.text());
        if (
          b.format !== "athena-advanced-entry-v1" ||
          b.uid !== ATHENA_UID ||
          (b.model||"athena75")!==model() ||
          !Array.isArray(b.bytes) ||
          b.bytes.some((v) => !Number.isInteger(v) || v < 0 || v > 255)
        )
          throw Error("请选择自动生成的 Athena 单项备份");
        const a = await ensure(),
          next = Uint8Array.from(b.bytes);
        if (b.kind === "macros") {
          if (b.count !== a.caps.macros) throw Error("宏数量不匹配");
          splitMacros(next, a.caps.macros);
          await a.applyMacros(await a.readMacros(), next, backup);
        } else if (b.kind === "setting")
          await a.applySetting(
            b.index,
            await a.readSetting(b.index),
            next,
            backup,
          );
        else
          await a.applyEntry(
            b.kind,
            b.index,
            await a.readEntry(b.kind, b.index),
            next,
            backup,
          );
        cache.clear();
        report("备份已恢复并回读确认；请重新读取编辑项");
      });
    const details = el("details", "advanced-backup-tools");
    details.append(el("summary", "", "备份与恢复"), row);
    root.append(details);
  }
  function header(root, name, description) {
    const h = el("div", "advanced-heading");
    h.append(el("h3", "", name), el("p", "", description));
    root.append(h);
    status = el(
      "p",
      "advanced-status",
      "先读取键盘配置，再编辑需要调整的项目。",
    );
    status.setAttribute("role", "status");
    root.append(status);
  }
  function builder(root, dual) {
    header(
      root,
      dual ? "轻按 / 长按" : "组合快捷键",
      dual
        ? "给同一个键设置两种动作，按住与轻按各司其职。"
        : "把常用的组合操作，放到一个按键上。",
    );
    status.hidden = true;
    const form = el("div", "advanced-form builder-form");
    root.append(form);
    const type = field(
      form,
      "1 · 选择动作",
      select(
        dual
          ? [
              ["MT", "轻按输入 · 按住修饰键"],
              ["LT", "轻按输入 · 按住切层"],
            ]
          : [
              ["MODS", "同时按下多个键"],
              ["OSM", "修饰键只对下一键生效"],
              ["LM", "按住时启用层和修饰键"],
            ],
        dual ? "MT" : "MODS",
      ),
    );
    const tap = field(form, "2 · 选择按键", keyInput(dual ? 44 : 6));
    tap.dataset.basicOnly = "true";
    const layer = field(
      form,
      "目标层",
      select(
        Array.from({ length: 8 }, (_, i) => [i, `第 ${i} 层`]),
        1,
      ),
    );
    const modifierBox = el("div", "builder-modifiers");
    form.append(modifierBox);
    const mods = bits(modifierBox, "3 · 搭配修饰键（可多选）", 1, platformModifierLabels());
    const side = field(
      modifierBox,
      "左右侧",
      select(
        [
          ["0", "左侧"],
          ["16", "右侧"],
        ],
        0,
      ),
    );
    const result = el("div", "advanced-actionbar");
    const summary = el("div", "advanced-preview");
    const target = el("span", "advanced-target");
    const apply = button(
      "赋予当前按键",
      safe(() => assign(compute())),
    );
    apply.classList.add("primary-action");
    result.append(summary, target, apply);
    root.append(result);
    const compute = () =>
      buildKeycode(type.value, {
        key: ["MODS", "MT", "LT"].includes(type.value) ? keyValue(tap) : 0,
        layer: Number(layer.value),
        mods: mods() | Number(side.value),
      });
    const examples = el("p", "advanced-note builder-example");
    root.append(examples);
    root.updateTarget = () => {
      target.textContent = `应用到：${getTarget()}`;
    };
    const preview = () => {
      tap.closest(".advanced-field").hidden = ["OSM", "LM"].includes(
        type.value,
      );
      layer.closest(".advanced-field").hidden = !["LT", "LM"].includes(
        type.value,
      );
      modifierBox.hidden = type.value === "LT";
      try {
        const c = compute();
        summary.textContent = keyInfo(c).title;
        summary.classList.remove("error");
        apply.disabled = getBusy();
        apply.dataset.invalid = "false";
      } catch (e) {
        summary.textContent = e.message;
        summary.classList.add("error");
        apply.disabled = true;
        apply.dataset.invalid = "true";
      }
      const descriptions = {
        MODS: "例如：GUI / Cmd + C 在 Mac 复制，Ctrl + C 在 Windows 复制。",
        OSM: "轻按一次后，下一次按键带上所选修饰键；不需要一直按住。",
        LM: "按住此键，同时启用目标层和所选修饰键；松开恢复。",
        MT: "例如：轻按输入空格，按住变成 Ctrl。判定时间可在「高级参数」调整。",
        LT: "例如：轻按输入空格，按住使用第 1 层；松开后恢复。",
      };
      examples.textContent = descriptions[type.value];
      root.updateTarget();
    };
    form.oninput = preview;
    form.onchange = preview;
    root.refreshActions = preview;
    preview();
  }
  function entries(root, type) {
    const spec = {
      td: [
        "多击动作 · Tap Dance",
        "同一键可分别设置轻按、长按、双击、双击后按住。应用后再赋予 TD 键。",
      ],
      combo: [
        "组合触发 · Combo",
        "同时按下 2–4 个键码触发另一个功能，无需占用额外键位。",
      ],
      override: [
        "按键替换 · Key Override",
        "按住指定修饰键时，将一个按键替换为另一个功能。",
      ],
    }[type];
    header(root, ...spec);
    const toolbar = el("div", "advanced-row");
    const slots = select([], "");
    slots.setAttribute("aria-label", `${spec[0]}编号`);
    const edit = el("div", "advanced-form");
    let before = null,
      index = -1,
      session = null,
      collect = null,
      dirty = false;
    const empty = el(
      "p",
      "advanced-empty",
      "连接键盘并读取配置后，即可编辑这条规则。",
    );
    edit.append(empty);
    const draftState = el("span", "draft-state", "尚未读取");
    const loadEntry = async () => {
      const a = await ensure();
      const nextIndex = Number(slots.value);
      const actual = await a.readEntry(type, nextIndex);
      index = nextIndex;
      before = actual;
      dirty = false;
      session = bound;
      draw();
      updateRuleActions();
      report(`已读取 ${index} · 共 ${a.caps[type]} 个位置`);
    };
    toolbar.append(
      slots,
      button("读取配置", () =>
        task(async () => {
          const a = await ensure();
          if (!a.caps[type]) throw Error("当前固件未提供此功能");
          if (dirty) throw Error("此条有未应用修改，请先应用或撤销编辑");
          const value = slots.value;
          slots.replaceChildren();
          for (let i = 0; i < a.caps[type]; i++) {
            const o = el("option", "", `${type === "td" ? "TD" : "规则"} ${i}`);
            o.value = i;
            slots.append(o);
          }
          if (value) slots.value = value;
          await loadEntry();
        }),
      ),
    );
    slots.onchange = () => {
      if (dirty) {
        slots.value = index;
        report("此条有未应用修改，请先应用或撤销编辑", true);
        return;
      }
      task(loadEntry);
    };
    edit.addEventListener("input", () => {
      dirty = true;
      updateRuleActions();
    });
    edit.addEventListener("change", () => {
      dirty = true;
      updateRuleActions();
    });
    root.append(toolbar, edit);
    function draw() {
      edit.replaceChildren();
      const values = unwords(before);
      if (type === "td") {
        const labels = ["轻按", "长按", "双击", "双击后按住"];
        const fields = labels.map((l, i) =>
          field(edit, l, keyInput(values[i])),
        );
        const term = field(edit, "判定时间（ms）", number(values[4], 0, 65535));
        collect = () => {
          const t = Number(term.value);
          if (!Number.isInteger(t) || t < 0 || t > 65535)
            throw Error("判定时间须为 0–65535");
          return words([...fields.map(keyValue), t]);
        };
      }
      if (type === "combo") {
        const fields = Array.from({ length: 4 }, (_, i) =>
          field(
            edit,
            `触发键 ${i + 1}${i > 1 ? "（可选，留为禁用）" : ""}`,
            keyInput(values[i]),
          ),
        );
        const output = field(edit, "输出功能", keyInput(values[4]));
        collect = () => {
          const codes = fields.map(keyValue),
            used = codes.filter(Boolean),
            out = keyValue(output);
          if (out && (used.length < 2 || new Set(used).size !== used.length))
            throw Error("启用组合需要至少两个不同触发键");
          if (codes.some((c, i) => !c && codes.slice(i + 1).some(Boolean)))
            throw Error("请依次填写触发键，空位放在最后");
          return words([...codes, out]);
        };
      }
      if (type === "override") {
        const trigger = field(edit, "原按键", keyInput(values[0])),
          replacement = field(edit, "替换输出", keyInput(values[1]));
        const layers = bits(
          edit,
          "生效层",
          values[2],
          Array.from({ length: 8 }, (_, i) => `层 ${i}`),
        );
        const names = ["左", "右"].flatMap((side) =>
          platformModifierLabels().map((name) => `${side} ${name}`),
        );
        const triggerMods = bits(edit, "必须按住", before[6], names);
        const extra = el("details", "rule-extra");
        extra.append(el("summary", "", "更多触发条件"));
        edit.append(extra);
        const negative = bits(extra, "不能按住", before[7], names),
          suppressed = bits(extra, "输出时抑制", before[8], names);
        const options = bits(extra, "触发选项", before[9], [
          "按原键时触发",
          "按修饰键时触发",
          "释放排除键时触发",
          "任一必需修饰键即可",
          "不重发原键",
          "其他键不取消",
          "保留位",
          "启用此规则",
        ]);
        collect = () => {
          const opt = options();
          if (opt & 128 && (!keyValue(trigger) || !(layers() & 255)))
            throw Error("启用替换规则需要原按键和至少一个生效层");
          if (triggerMods() & negative())
            throw Error("必须按住和不能按住不能重叠");
          return Uint8Array.from([
            ...words([keyValue(trigger), keyValue(replacement), layers()]),
            triggerMods(),
            negative(),
            suppressed(),
            opt,
          ]);
        };
      }
    }
    const actions = el("div", "advanced-row advanced-actionbar");
    const apply = async (clear = false) => {
      const a = await ensure();
      if (!before || session !== bound) throw Error("请先重新读取此项");
      const next = clear ? new Uint8Array(10) : collect();
      before = await a.applyEntry(type, index, before, next, backup);
      dirty = false;
      draw();
      updateRuleActions();
      report(`规则 ${index} 已${clear ? "清空" : "应用"}并回读确认`);
    };
    actions.append(
      button("应用此条规则", () => task(() => apply())),
      button("清空此条", () => task(() => apply(true))),
    );
    if (type === "td")
      actions.append(
        button(
          "赋予当前按键",
          safe(() => {
            if (!before || session !== getDevice())
              throw Error("请先读取并配置 TD");
            assign(0x5700 + index);
          }),
        ),
      );
    const undo = button("撤销编辑", () => {
      dirty = false;
      draw();
      updateRuleActions();
    });
    actions.append(undo, draftState);
    function updateRuleActions() {
      const loaded = !!before && session === getDevice() && ready();
      const buttons = actions.querySelectorAll("button");
      buttons[0].disabled = !loaded || !dirty;
      buttons[0].classList.add("primary-action");
      buttons[1].disabled = !loaded;
      if (type === "td") buttons[2].disabled = !loaded || dirty;
      undo.disabled = !dirty;
      draftState.textContent = !loaded
        ? "尚未读取"
        : dirty
          ? "有未应用修改"
          : "已与键盘同步";
      if (loaded && dirty) {
        try {
          collect();
        } catch (e) {
          buttons[0].disabled = true;
          draftState.textContent = e.message;
        }
      }
    }
    root.hasDraft = () => dirty;
    root.refreshActions = updateRuleActions;
    root.append(actions);
    updateRuleActions();
    tools(root);
  }
  function macros(root) {
    header(
      root,
      "宏 · 按顺序执行",
      "添加文字、按下、释放、轻按与延迟。英文文本按 US 布局发送；应用后将 M 编号赋予一个按键。",
    );
    let before = null,
      parts = null,
      actions = [],
      index = 0,
      session = null,
      decoded = true,
      dirty = false;
    const toolbar = el("div", "advanced-row"),
      slots = select([], ""),
      editor = el("div", "macro-steps"),
      usage = el("p", "advanced-note");
    slots.setAttribute("aria-label", "宏编号");
    const show = () => {
      index = Number(slots.value);
      dirty = false;
      decoded = true;
      try {
        actions = decodeMacro(parts[index]);
      } catch (e) {
        actions = [];
        decoded = false;
        report(e.message, true);
      }
      draw();
    };
    toolbar.append(
      slots,
      button("读取宏", () =>
        task(async () => {
          const a = await ensure();
          if (dirty) throw Error("此宏有未应用修改，请先应用或撤销编辑");
          before = await a.readMacros();
          parts = splitMacros(before, a.caps.macros);
          session = bound;
          slots.replaceChildren();
          for (let i = 0; i < a.caps.macros; i++) {
            const o = el("option", "", `M(${i})`);
            o.value = i;
            slots.append(o);
          }
          show();
          report(`已读取 ${a.caps.macros} 个宏 · ${a.caps.macroSize} 字节`);
        }),
      ),
    );
    slots.onchange = () => {
      if (dirty) {
        slots.value = index;
        report("此宏有未应用修改，请先应用或撤销编辑", true);
        return;
      }
      show();
    };
    root.append(toolbar, usage, editor);
    function draw() {
      editor.replaceChildren();
      usage.textContent = parts
        ? `已用 ${parts.reduce((n, m) => n + m.length + 1, 1)} / ${before.length} 字节；编辑后将在应用时检查容量。`
        : "连接后读取宏数量与实际空间。";
      if (!actions.length)
        editor.append(
          el(
            "p",
            "advanced-note",
            decoded
              ? "此宏为空，添加第一步。"
              : "原始宏不可解码，保持原样；可先导出备份后清空此宏。",
          ),
        );
      actions.forEach((a, i) => {
        const row = el("div", "macro-step");
        row.append(el("span", "step-number", String(i + 1)));
        const t = select(
          [
            ["text", "文字"],
            ["tap", "轻按"],
            ["down", "按下"],
            ["up", "释放"],
            ["delay", "延迟 ms"],
          ],
          a.type,
        );
        t.setAttribute("aria-label", `第 ${i + 1} 步类型`);
        row.append(t);
        let input;
        if (a.type === "text") {
          input = el("textarea");
          input.rows = 1;
          input.value = a.value;
        } else
          input =
            a.type === "delay" ? number(a.value, 0, 65024) : keyInput(a.value);
        input.setAttribute("aria-label", `第 ${i + 1} 步内容`);
        input.oninput = () => {
          dirty = true;
          a.value = ["text", "delay"].includes(a.type)
            ? input.value
            : input.value;
          updateMacroActions();
        };
        row.append(input.dataset.keyInput ? keyFieldControl(input) : input);
        t.onchange = () => {
          dirty = true;
          a.type = t.value;
          a.value = a.type === "text" ? "" : a.type === "delay" ? 100 : 4;
          draw();
        };
        row.append(
          button("↑", () => {
            if (i) {
              dirty = true;
              [actions[i - 1], actions[i]] = [actions[i], actions[i - 1]];
              draw();
            }
          }),
          button("↓", () => {
            if (i < actions.length - 1) {
              dirty = true;
              [actions[i + 1], actions[i]] = [actions[i], actions[i + 1]];
              draw();
            }
          }),
          button("删除", () => {
            dirty = true;
            actions.splice(i, 1);
            draw();
          }),
        );
        editor.append(row);
      });
      updateMacroActions();
    }
    const row = el("div", "advanced-row advanced-actionbar");
    row.append(
      button(
        "＋ 添加步骤",
        safe(() => {
          if (!parts || !decoded)
            throw Error("请先读取宏；不可解码的宏需先备份并清空");
          dirty = true;
          actions.push({ type: "tap", value: 4 });
          draw();
        }),
      ),
      button("应用此宏", () =>
        task(async () => {
          const a = await ensure();
          if (!parts || session !== bound || !decoded)
            throw Error("请先读取可编辑的宏");
          const normalized = actions.map((step) => ({
            ...step,
            value: ["text", "delay"].includes(step.type)
              ? step.value
              : typeof step.value === "number"
                ? step.value
                : parseKeycode(step.value),
          }));
          const nextParts = parts.map((p) => p.slice());
          nextParts[index] = encodeMacro(normalized);
          before = await a.applyMacros(
            before,
            packMacros(nextParts, a.caps.macroSize),
            backup,
          );
          parts = splitMacros(before, a.caps.macros);
          show();
          report(`M(${index}) 已应用并回读确认`);
        }),
      ),
      button("清空此宏", () =>
        task(async () => {
          const a = await ensure();
          if (!parts || session !== bound) throw Error("请先读取宏");
          const next = parts.map((p) => p.slice());
          next[index] = new Uint8Array();
          before = await a.applyMacros(
            before,
            packMacros(next, a.caps.macroSize),
            backup,
          );
          parts = splitMacros(before, a.caps.macros);
          show();
          report(`M(${index}) 已清空，其他宏保留`);
        }),
      ),
      button(
        "赋予当前按键",
        safe(() => {
          if (!parts || session !== getDevice()) throw Error("请先读取宏");
          assign(0x7700 + index);
        }),
      ),
    );
    const draftState = el("span", "draft-state");
    const undo = button("撤销编辑", () => show());
    row.append(undo, draftState);
    function updateMacroActions() {
      const loaded = !!parts && session === getDevice() && ready(),
        buttons = row.querySelectorAll("button");
      buttons[0].disabled = !loaded || !decoded;
      buttons[1].disabled = !loaded || !decoded || !dirty;
      buttons[1].classList.add("primary-action");
      buttons[2].disabled = !loaded;
      buttons[3].disabled = !loaded || dirty;
      undo.disabled = !dirty;
      draftState.textContent = !loaded
        ? "尚未读取"
        : dirty
          ? "有未应用修改"
          : "已与键盘同步";
      if (loaded && decoded) {
        try {
          const edited = encodeMacro(
            actions.map((a) => ({
              ...a,
              value:
                ["text", "delay"].includes(a.type) ||
                typeof a.value === "number"
                  ? a.value
                  : parseKeycode(a.value),
            })),
          );
          const next = parts.map((p) => p.slice());
          next[index] = edited;
          packMacros(next, before.length);
          usage.textContent = `预计占用 ${next.reduce((n, m) => n + m.length + 1, 1)} / ${before.length} 字节`;
        } catch (e) {
          buttons[1].disabled = true;
          draftState.textContent = e.message;
        }
      }
    }
    root.hasDraft = () => dirty;
    root.refreshActions = updateMacroActions;
    root.append(row);
    tools(root);
    draw();
  }
  function settings(root) {
    header(
      root,
      "高级参数 · QMK Settings",
      "控制轻按／长按、自动 Shift、一次性按键、鼠标与系统修饰键。每一项单独应用并保存在键盘。",
    );
    const form = el("div", "settings-list");
    root.append(
      button("读取高级参数", () =>
        task(async () => {
          const a = await ensure(),
            session = bound;
          if (form.querySelector('[data-dirty="true"]'))
            throw Error("有未应用参数，请先应用或撤销编辑");
          form.replaceChildren();
          const groups = new Map();
          let itemCount = 0;
          const groupFor = (id) =>
            [1, 7, 8, 18, 19].includes(id)
              ? "轻按与长按"
              : [3, 4].includes(id)
                ? "自动 Shift"
                : [5, 6, 20].includes(id)
                  ? "层与一次性按键"
                  : id === 2
                    ? "组合触发"
                    : id === 21
                      ? "系统修饰键"
                      : "鼠标与滚轮";
          for (const spec of QMK_SETTINGS.filter((s) =>
            a.caps.settings.includes(s.id),
          )) {
            let before = await a.readSetting(spec.id);
            itemCount++;
            const name = groupFor(spec.id);
            if (!groups.has(name)) {
              const section = el("details", "setting-group");
              section.open = name === "轻按与长按";
              section.append(el("summary", "", name));
              form.append(section);
              groups.set(name, section);
            }
            const row = el("div", "setting-row");
            const val = decodeSetting(before);
            let read;
            if (spec.bits) read = bits(row, spec.label, val, spec.bits);
            else {
              const input = field(
                row,
                spec.label,
                number(val, 0, spec.size === 1 ? 255 : 65535),
              );
              read = () => Number(input.value);
            }
            const apply = button("应用此项", () =>
              task(async () => {
                await ensure();
                if (session !== bound) throw Error("请重新读取参数");
                before = await a.applySetting(
                  spec.id,
                  before,
                  encodeSetting(spec.id, read()),
                  backup,
                );
                row.dataset.dirty = "false";
                apply.disabled = true;
                report(`${spec.label} 已应用并回读确认`);
              }),
            );
            apply.disabled = true;
            const update = () => {
              try {
                const next = encodeSetting(spec.id, read());
                const dirty = next.some((b, i) => b !== before[i]);
                row.dataset.dirty = String(dirty);
                apply.disabled = !dirty || !ready() || session !== getDevice();
                apply.title = "";
              } catch (e) {
                apply.disabled = true;
                row.dataset.dirty = "true";
                apply.title = e.message;
              }
            };
            row.addEventListener("input", update);
            row.addEventListener("change", update);
            const undo = button("撤销编辑", () => {
              const v = decodeSetting(before);
              if (spec.bits)
                row
                  .querySelectorAll('input[type="checkbox"]')
                  .forEach((c, i) => {
                    c.checked = !!(v & (1 << i));
                  });
              else row.querySelector("input").value = v;
              update();
            });
            row.refreshActions = () => {
              update();
              undo.disabled = row.dataset.dirty !== "true";
            };
            row.addEventListener("input", row.refreshActions);
            row.addEventListener("change", row.refreshActions);
            row.append(apply, undo);
            row.refreshActions();
            groups.get(name).append(row);
          }
          report(`已读取 ${itemCount} 项参数 · 按用途分组，每项独立应用`);
        }),
      ),
      form,
    );
    root.refreshActions = () =>
      form
        .querySelectorAll(".setting-row")
        .forEach((row) => row.refreshActions?.());
    tools(root);
  }
  function organizePanel(root) {
    const body = el("div", "advanced-body");
    for (const child of [...root.children])
      if (
        !child.matches(
          ".advanced-heading,.advanced-status,.advanced-actionbar,.advanced-backup-tools",
        )
      )
        body.append(child);
    const footer = root.querySelector(
      ".advanced-actionbar,.advanced-backup-tools",
    );
    root.insertBefore(body, footer);
  }
  function render(host, category) {
    current = category;
    host.classList.add("advanced-picker");
    if (cache.has(category)) {
      panel = cache.get(category);
      status = panel.querySelector(".advanced-status");
      host.append(panel);
      panel.updateTarget?.();
      panel.refreshActions?.();
      return;
    }
    panel = el("section", "advanced-panel");
    panel.dataset.category = category;
    host.append(panel);
    cache.set(category, panel);
    if (category === "快捷组合" || category === "双功能键")
      builder(panel, category === "双功能键");
    else if (category === "宏") macros(panel);
    else if (category === "高级参数") settings(panel);
    else
      entries(
        panel,
        { 多击动作: "td", 组合触发: "combo", 按键替换: "override" }[category],
      );
    organizePanel(panel);
  }
  function refresh() {
    if (!getBusy() && panel?.isConnected) {
      panel.updateTarget?.();
      panel.refreshActions?.();
    }
    if (bound && bound !== getDevice()) {
      api = null;
      bound = null;
      if (status)
        status.textContent =
          "连接已变化，未应用编辑仍在本页；请撤销编辑后重新读取。";
    }
  }
  window.addEventListener("beforeunload", (e) => {
    if ([...cache.values()].some((p) => p.hasDraft?.())) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  return { render, refresh };
}
