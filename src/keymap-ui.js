import {DEVICE_PROFILES} from "./device-profiles.js";
import {profileLayout} from "./profile-layouts.js";
import {SCREEN_SHORTCUTS,screenShortcutSupported} from "./screen-shortcuts.js";
import { setupWorkspaceModals } from "./workspace-modals.js";
import { platformKeyLabel } from "./platform-keys.js";
import { PICKER_GROUPS, categoryKeys } from "./keycode-categories.js";
import { setupAdvanced, ADVANCED_CATEGORIES } from "./advanced-ui.js";


import { ATHENA_UID } from "./device.js";
import {
  KeymapDevice,
  keyIndex as modelKeyIndex,
  changesBetween,
  validateKeymap,
} from "./keymap-protocol.js";
import { keyboardLayout, layoutChoices, withLayoutChoice, PHYSICAL_LAYOUT_MASK } from "./keyboard-layout.js";
import { TKL_KEYS, TKL_MM } from "./tkl-layout.js";
import { usesModifierColor } from "./keycap-colors.js";
import { keycapStyle, KEYBOARD_ASPECT_RATIO, SCREEN_POSITION } from "./keyboard-geometry.js";
import { KEYCODES, keyInfo, parseKeycode, layerExample } from "./keycodes.js";
import { createPetPack } from "./pet-pack.js";
import { petPreview } from "./pet-preview.js";
import { digest } from "./backup-v2.js";
const $ = (id) => document.getElementById(id);
const compactLabel = (k) =>
  k.code === 0x7e04 ? "图片" : k.code === 0x7e05 ? "屏幕" : platformKeyLabel(k);
const copy = (m) => ({ ...m, keycodes: [...m.keycodes] });

export function setupKeymap({
  getDevice,
  getDemo=()=>false,
  getBusy,
  setBusy,
  notice,
  onView = () => {},
}) {
  let profile=DEVICE_PROFILES.athena75, {definition,defaults}=profileLayout(profile);
  const keyIndex=(layer,row,col)=>modelKeyIndex(layer,row,col,profile);
  const backupKey=()=>`athena-keymap-backups-v1-${profile.uid}${profile.id==="athena75"?"":"-"+profile.id}`;
  let baseline = {
      format: "athena-keymap-v1",
      uid: ATHENA_UID,
      protocol: 12,
      layers: 8,
      rows: 11,
      cols: 8,
      layoutOptions: 10,
      keycodes: [...defaults],
    },
    draft = copy(baseline),
    origin = copy(baseline),
    applying = false,
    syncError = false,
    layer = 0,
    selected = { row: 10, col: 0 },
    category = "基础",
    mode = "basic",
    loaded = false,
    boundDevice = null,
    screen = false;
  const count = () => changesBetween({ ...baseline, layoutOptions: draft.layoutOptions }, draft).length + Number(baseline.layoutOptions !== draft.layoutOptions);
  const connected = () =>
    !!(getDevice() && !getDevice().broken && getDevice().device.opened);
  const ready = () => connected() && boundDevice === getDevice() && loaded;
  const advanced = setupAdvanced({
    getTarget: () =>
      `第 ${layer} 层 · ${platformKeyLabel(keyInfo(defaults[selected.row * 8 + selected.col]))}`,
    getDevice,
    ready,
    getBusy,
    run,
    assign,
    notice,
  });
  function download(map, name) {
    const blob = new Blob([JSON.stringify(map, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function backup(map) {
    const data = JSON.stringify(map),
      sha256 = await digest(new TextEncoder().encode(data));
    const records = JSON.parse(localStorage.getItem(backupKey()) || "[]");
    const record = { created: new Date().toISOString(), data, sha256 };
    localStorage.setItem(
      backupKey(),
      JSON.stringify([record, ...records].slice(0, 10)),
    );
    const saved = JSON.parse(localStorage.getItem(backupKey()) || "[]")[0];
    if (
      !saved ||
      saved.data !== data ||
      (await digest(new TextEncoder().encode(saved.data))) !== sha256
    )
      throw Error("键位备份保存失败，未开始写入");
  }
  async function run(fn, { quiet = true } = {}) {
    if (getBusy()) return;
    setBusy(true, { quiet });
    try {
      const started = Date.now();
      while (getDevice()?.pending && Date.now() - started < 5500)
        await new Promise((r) => setTimeout(r, 20));
      await fn();
    } catch (e) {
      notice(e.message, true);
    } finally {
      setBusy(false);
      refreshConnection();
    }
  }
  const modals = setupWorkspaceModals({ getBusy, onClose: () => viewPage("keymap") });
  function viewScreen(value) {
    viewPage(value ? "screen" : "keymap");
  }
  function viewPage(page) {
    if (getBusy()) return;
    const zmk=getDevice()?.protocol==="zmk";
    if(zmk && page==="screen")page="keymap";
    if(!zmk&&!getDemo()&&(!ready()||(page==="screen"&&!getDevice()?.capabilities?.screen)))page="keymap";
    const value = page === "screen";
    screen = value;
    document.body.classList.toggle("screen-open", false);
    document.body.classList.toggle("tester-open", page === "test");
    $("keymap-workspace").hidden = zmk;
    $("screen-settings").hidden = !value;
    $("keyboard-tester").hidden = page !== "test";
    modals.show(page);
    onView(page);
    history.replaceState(null, "", `#${page}`);
    for (const [id, on] of [
      ["keymap-nav", page === "keymap"],
      ["tester-nav", page === "test"],
      ["screen-nav", value],
    ]) {
      $(id).classList.toggle("selected", on);
      $(id).setAttribute("aria-pressed", String(on));
    }
    $("console-subtitle").textContent = value
      ? "图片、动画和像素小猫，住进键盘的小屏幕。"
      : "每一个按键，每一帧陪伴，都由你决定。";
  }
  $("tester-nav").onclick = () => viewPage("test");
  $("keymap-nav").onclick = () => viewScreen(false);
  for (const id of ["screen-nav", "screen-shortcut"])
    $(id).onclick = () => viewScreen(true);
  $("screen-back").onclick = () => viewScreen(false);
  function refreshConnection() {
    if(getDevice()?.protocol==="zmk")return;
    advanced.refresh();
    document.querySelectorAll(".layout-controls button").forEach(b => {
      b.disabled = getBusy() || (connected() && !ready()) || syncError ||
        (b.dataset.layoutPreviewOnly === "true" && connected()) ||
        (b.dataset.layoutUndo === "true" && !((draft.layoutOptions ^ origin.layoutOptions) & PHYSICAL_LAYOUT_MASK));
    });
    if (boundDevice !== getDevice() || !connected()) loaded = false;
    const live = ready();
    $("keymap-state").textContent = live
      ? "已连接 · 改键即时生效"
      : connected()
        ? "键位尚未读取"
        : "未连接 · 演示 / 本地预览";
    $("keymap-state").classList.toggle("live", live);
    $("keymap-reload").disabled = !connected() || getBusy();
    $("keymap-sync").textContent = syncError
        ? "同步未确认 · 请重新读取键盘"
        : live
          ? "点击即生效 · 自动备份与回读校验"
          : "离线仅预览 · 连接后读取键盘实际配置";
    $("keymap-sync").classList.toggle("error", syncError);
    $("keymap-import").textContent = live
      ? "导入并应用键位 ↑"
      : "导入键位预览 ↑";
    $("key-reset").disabled =
      getBusy() ||
      (connected() && !live) ||
      draft.keycodes[keyIndex(layer, selected.row, selected.col)] ===
        origin.keycodes[keyIndex(layer, selected.row, selected.col)];
  }

  function renderChoices() {
    const q = $("key-search").value.trim().toLowerCase(),
      value = draft.keycodes[keyIndex(layer, selected.row, selected.col)],
      host = $("key-choices");
    host.replaceChildren();
    host.classList.remove("advanced-picker", "numpad-picker", "layout-picker", "screen-shortcut-picker");
    for (const b of $("key-categories").querySelectorAll("button")) {
      b.classList.toggle("selected", !q && b.dataset.category === category);
      b.setAttribute(
        "aria-pressed",
        String(!q && b.dataset.category === category),
      );
    }
    host.classList.toggle("physical-picker", !q && category === "基础");
    if (!q && category === "布局设置") {
      renderLayoutSettings(host);
      return;
    }
    if (!q && ADVANCED_CATEGORIES.includes(category)) {
      advanced.render(host, category);
      return;
    }
    const make = (k) => {
      const b = document.createElement("button");
      b.textContent = platformKeyLabel(k);
      b.title = [k.title, layerExample(k.code)].filter(Boolean).join("。例：");
      b.setAttribute("aria-label", `赋予 ${platformKeyLabel(k)} · ${k.title}`);
      b.classList.toggle("selected", value === k.code);
      b.setAttribute("aria-pressed", String(value === k.code));
      b.disabled=!getDemo() && !getDevice()?.capabilities?.screen && SCREEN_SHORTCUTS.some(item=>item.code===k.code);
      b.onclick = () => assign(k.code);
      return b;
    };
    if (!q && category === "屏幕快捷键" && !getDemo() && !getDevice()?.capabilities?.screen) {
      const p=document.createElement("p");p.className="empty";p.textContent="此型号的宠物与弹球需要单独适配固件。当前可分配原有图片切换和屏幕开关。";host.append(p);for(const code of [0x7e04,0x7e05])host.append(make(keyInfo(code)));
    } else if (!q && category === "屏幕快捷键") {
      host.classList.add("screen-shortcut-picker");
      const intro=document.createElement("p");intro.className="screen-shortcut-help";
      intro.textContent="先选上方的按键，再选择屏幕功能。模式键直接切换屏幕，关闭网页后仍可使用。";host.append(intro);
      for(const k of SCREEN_SHORTCUTS){const b=make(k);b.dataset.screenModeKey=String(k.code);b.classList.add("screen-shortcut-card");const name=document.createElement("strong"),detail=document.createElement("small");name.textContent=k.label;detail.textContent=k.title;b.replaceChildren(name,detail);host.append(b);}
      const hint=document.createElement("p");hint.className="screen-shortcut-help";hint.textContent="独立模式键需要新版固件；现有左右 Shift + P / T 快捷键仍可使用。";host.append(hint);
      for(const code of [0x7e04,0x7e05])host.append(make(keyInfo(code)));
    } else if (!q && category === "基础") {
      const scroll = document.createElement("div");
      scroll.className = "function-keyboard-scroll";
      const board = document.createElement("div");
      board.className = "function-keyboard";
      board.style.aspectRatio = `${TKL_MM.width} / ${TKL_MM.height}`;
      board.setAttribute("aria-label", "87 键 TKL 功能布局");
      for (const k of TKL_KEYS) {
        const code = k.code,
          b = make(keyInfo(code));
        b.classList.add("function-keycap");
        b.textContent = compactLabel(keyInfo(code));
        b.style.cssText = keycapStyle(k, TKL_MM);
        if (usesModifierColor(code, k.w)) b.classList.add("modifier");
        board.append(b);
      }
      scroll.append(board);
      host.append(scroll);
      const extra = document.createElement("div");
      extra.className = "extra-function-keys";
      const label = document.createElement("span");
      label.textContent = "更多常用键";
      extra.append(label);
      for (const c of [0, 1]) extra.append(make(keyInfo(c)));
      host.append(extra);
    } else if (!q && category === "小键盘") {
      host.classList.add("numpad-picker");
      const pad = document.createElement("div");
      pad.className = "numpad-board";
      const arrangement = [
        [83, 0, 0],
        [84, 1, 0],
        [85, 2, 0],
        [86, 3, 0],
        [95, 0, 1],
        [96, 1, 1],
        [97, 2, 1],
        [87, 3, 1, 1, 2],
        [92, 0, 2],
        [93, 1, 2],
        [94, 2, 2],
        [89, 0, 3],
        [90, 1, 3],
        [91, 2, 3],
        [88, 3, 3, 1, 2],
        [98, 0, 4, 2],
        [99, 2, 4],
      ];
      for (const [c, x, y, w = 1, h = 1] of arrangement) {
        const b = make(keyInfo(c));
        b.style.gridColumn = `${x + 1} / span ${w}`;
        b.style.gridRow = `${y + 1} / span ${h}`;
        pad.append(b);
      }
      host.append(pad);
      const extra = document.createElement("div");
      extra.className = "numpad-extra";
      for (const c of [103, 133, 134])
        if (mode === "advanced" || c === 103) extra.append(make(keyInfo(c)));
      host.append(extra);
    } else {
      const list = categoryKeys(KEYCODES, mode, category, q);
      for (const k of list) {
        if(!getDemo() && !getDevice()?.capabilities?.screen && SCREEN_SHORTCUTS.some(item=>item.code===k.code))continue;
        const b = make(k);
        b.classList.toggle("wide", k.label.length > 5);
        host.append(b);
      }
      if (!list.length) {
        const p = document.createElement("p");
        p.className = "empty";
        p.textContent = "没有找到这个功能";
        host.append(p);
      }
    }
    if (
      q &&
      mode === "basic" &&
      categoryKeys(KEYCODES, "advanced", category, q).length >
        categoryKeys(KEYCODES, mode, category, q).length
    ) {
      const more = document.createElement("button");
      more.className = "advanced-search-link";
      more.textContent = "在高级模式查看更多结果 →";
      more.onclick = () => switchMode("advanced", true);
      host.append(more);
    }
    for (const b of $("key-categories").querySelectorAll("button")) {
      b.classList.toggle("selected", !q && b.dataset.category === category);
      b.setAttribute(
        "aria-pressed",
        String(!q && b.dataset.category === category),
      );
    }
  }
  function renderInspector() {
    const i = keyIndex(layer, selected.row, selected.col),
      info = keyInfo(draft.keycodes[i]),
      original = keyInfo(origin.keycodes[i]);
    $("selected-keycap").textContent = platformKeyLabel(info);
    $("selected-name").textContent = info.title;
    $("selected-original").textContent = `原值：${platformKeyLabel(original)}`;
    $("selected-position").textContent = `第 ${layer} 层`;
    const example = layerExample(info.code);
    $("selected-example").textContent = example ? `例：${example}` : "";
    $("selected-example").hidden = !example;
    $("key-description").textContent = info.title;
    $("key-hex").value =
      `0x${info.code.toString(16).toUpperCase().padStart(4, "0")}`;
    renderChoices();
  }
  function renderKeyboard() {
    const host = $("keyboard");
    const geometry=profileLayout(profile,draft.layoutOptions);
    host.setAttribute("aria-label",`${profile.name} 按键布局`);
    host.style.aspectRatio = `${geometry.board.width} / ${geometry.board.height}`;
    host.replaceChildren();
    const visibleKeys = keyboardLayout(definition, draft.layoutOptions,profile.id);
    if (!visibleKeys.some(k => k.row === selected.row && k.col === selected.col))
      selected = { row: visibleKeys[0].row, col: visibleKeys[0].col };
    for (const key of visibleKeys) {
      const i = keyIndex(layer, key.row, key.col),
        info = keyInfo(draft.keycodes[i]),
        b = document.createElement("button");
      b.className = "keycap";
      if (profile.id==="athena75" && key.row === 8 && key.col === 2) b.classList.add("image-button");
      b.dataset.matrix = `${key.row},${key.col}`;
      b.textContent = compactLabel(info);
      if (info.label.length > 8) b.classList.add("long-key-label");
      b.setAttribute(
        "aria-label",
        `按键 ${platformKeyLabel(keyInfo(defaults[key.row * 8 + key.col]))}，第 ${layer} 层，${info.title}`,
      );
      b.setAttribute(
        "aria-pressed",
        String(key.row === selected.row && key.col === selected.col),
      );
      b.title = `${info.title} · ${key.row},${key.col}`;
      b.classList.toggle(
        "modifier",
        usesModifierColor(defaults[key.row * 8 + key.col], key.w),
      );
      b.classList.toggle(
        "selected",
        key.row === selected.row && key.col === selected.col,
      );
      b.classList.toggle("changed", draft.keycodes[i] !== baseline.keycodes[i]);
      b.classList.toggle("transparent", info.code === 1);
      b.style.cssText = keycapStyle(key,geometry.board);
      b.onclick = () => {
        selected = { row: key.row, col: key.col };
        render();
      };
      host.append(b);
    }
    if(!geometry.screen || (!getDemo()&&!getDevice()?.capabilities?.screen))return;
    const lcd = document.createElement("button");
    lcd.className = "keyboard-lcd";
    lcd.style.cssText = keycapStyle(geometry.screen,geometry.board);
    lcd.id = "keyboard-screen";
    lcd.title = "屏幕设置 · 动作示意预览";
    lcd.setAttribute("aria-label", "键盘小屏幕：打开屏幕设置");
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    canvas.setAttribute("aria-label", "猫咪示意预览");
    lcd.append(canvas);
    lcd.onclick = () => viewScreen(true);
    host.append(lcd);
    canvas.getContext("2d").putImageData(
      new ImageData(
        petPreview(createPetPack("mint"), 0, 0, 2, 0, {
          level: 1,
          xp: 40,
          fullness: 90,
        }),
        128,
        128,
      ),
      0,
      0,
    );
  }
  function render() {
    renderKeyboard();
    renderInspector();
    for (const b of $("keymap-layers").children) {
      const n = Number(b.dataset.layer);
      b.classList.toggle("selected", n === layer);
      b.classList.toggle(
        "changed",
        draft.keycodes
          .slice(n * profile.rows*profile.cols, (n+1)*profile.rows*profile.cols)
          .some((k, i) => k !== baseline.keycodes[n * profile.rows*profile.cols + i]),
      );
      b.setAttribute("aria-pressed", String(n === layer));
    }
    $("layer-caption").textContent =
      layer === 0 ? "第 0 层 · 默认输入" : `第 ${layer} 层 · 由层切换键启用`;
    refreshConnection();
  }
  function renderLayoutSettings(host) {
    host.classList.add("layout-picker");
    const panel = document.createElement("section");
    panel.className = "layout-controls";
    const heading = document.createElement("h3"); heading.textContent = "键盘布局";
    const help = document.createElement("p"); help.className = "layout-help";
    help.textContent = "按实际安装的键帽与轴体选择，保留已有键位功能。ISO、左 Shift 和底排连接后即时生效；离线时仅预览。";
    panel.append(heading, help);
    const choices = layoutChoices(definition.layouts.labels, draft.layoutOptions);
    const settings = [
      ["Backspace", "两个 1U 按键 · 当前固件仅支持离线预览，保存到键盘需升级固件", ["整键 2U", "分裂 1U＋1U"]],
      ["Enter", "ISO 使用竖向回车，并调整附近按键", ["ANSI", "ISO"]],
      ["左 Shift", "分裂后为 1.25U Shift 和一个 1U 按键", ["整键 2.25U", "分裂 1.25U＋1U"]],
      ["底排空格", "7U 底排：1.5U＋1U＋1.5U＋7U＋1.5U", ["6.25U", "7U"]],
    ];
    if(profile.id!=="athena75"){const msg=document.createElement("p");msg.textContent="此型号的布局选项暂仅按设备读取展示，写入支持仍待验证。";panel.append(msg);host.append(panel);return;}
    settings.forEach(([title, detail, labels], group) => {
      const row = document.createElement("div"); row.className = "layout-option-row";
      const text = document.createElement("div"), name = document.createElement("strong"), description = document.createElement("p");
      name.textContent = title; description.textContent = detail; text.append(name, description);
      const options = document.createElement("div"); options.className = "layout-segment";
      options.setAttribute("role", "group"); options.setAttribute("aria-label", title);
      labels.forEach((label, choice) => {
        const b = document.createElement("button"); b.textContent = label;
        if (group === 0) b.dataset.layoutPreviewOnly = "true";
        b.setAttribute("aria-pressed", String(choices[group] === choice));
        b.onclick = () => applyLayoutOptions(withLayoutChoice(draft.layoutOptions, group, choice));
        options.append(b);
      });
      row.append(text, options); panel.append(row);
    });
    const undo = document.createElement("button"); undo.className = "layout-undo";
    undo.dataset.layoutUndo = "true"; undo.textContent = ready() ? "恢复本次连接时的布局" : "恢复默认预览布局";
    undo.onclick = () => applyLayoutOptions(((draft.layoutOptions & ~PHYSICAL_LAYOUT_MASK) | (origin.layoutOptions & PHYSICAL_LAYOUT_MASK)) >>> 0);
    panel.append(undo); host.append(panel);
    refreshConnection();
  }
  async function applyLayoutOptions(options) {
    if (getBusy() || options === draft.layoutOptions) return;
    if (!ready()) {
      if (connected() || syncError) { notice("请先重新读取键盘，再切换布局。", true); return; }
      draft.layoutOptions = options; render(); return;
    }
    draft.layoutOptions = options;
    render();
    await run(async () => {
      applying = true; syncError = false;
      try {
        const result = await new KeymapDevice(getDevice()).applyLayout(baseline, options, backup);
        baseline = result; draft = copy(result);
      } catch (e) {
        loaded = false; syncError = true; draft = copy(baseline); throw e;
      } finally { applying = false; render(); }
    }, { quiet: true });
  }
  async function applyMap(next) {
    if (getBusy()) return;
    if (!ready()) {
      if (connected() || syncError) {
        notice("请先重新读取键盘，再修改键位。", true);
        return;
      }
      draft = copy(next);
      render();
      return;
    }
    if (!changesBetween(baseline, next).length) return;
    // Paint the choice immediately; the confirmed baseline only advances after
    // readback. On failure, restore it and require a fresh device read.
    draft = copy(next);
    render();
    await run(async () => {
      applying = true;
      syncError = false;
      refreshConnection();
      try {
        const result = await new KeymapDevice(getDevice()).apply(
          baseline,
          next,
          backup,
        );
        baseline = result;
        draft = copy(result);
      } catch (e) {
        // Never present an unverified assignment as the device's current value.
        loaded = false;
        syncError = true;
        draft = copy(baseline);
        throw e;
      } finally {
        applying = false;
        render();
      }
    }, { quiet: true });
  }
  async function assign(code) {
    if(!getDemo() && !getDevice()?.capabilities?.screen && SCREEN_SHORTCUTS.some(k=>k.code===code)){notice("此型号尚未支持屏幕工作室固件。",true);return;}
    if(connected() && SCREEN_SHORTCUTS.some(k=>k.code===code)){
      if(getBusy())return;
      let version;
      await run(async()=>{version=(await getDevice().petCommand()).motionVersion;}, { quiet: true });
      if(!screenShortcutSupported(code,version)){notice("请先升级支持独立模式键的固件，再分配此功能。",true);return;}
    }
    const next = copy(draft);
    next.keycodes[keyIndex(layer, selected.row, selected.col)] = code;
    return applyMap(next);
  }
  for (let i = 0; i < 8; i++) {
    const b = document.createElement("button");
    b.textContent = i;
    b.dataset.layer = i;
    b.setAttribute("aria-label", `第 ${i} 层`);
    b.onclick = () => {
      layer = i;
      render();
    };
    $("keymap-layers").append(b);
  }
  function renderCategories() {
    const host = $("key-categories");
    host.dataset.mode = mode;
    host.replaceChildren();
    for (const group of PICKER_GROUPS[mode]) {
      const heading = document.createElement("span");
      heading.className = "category-group-label";
      heading.textContent = group.label;
      host.append(heading);
      for (const [name, label] of group.items) {
        const b = document.createElement("button");
        b.textContent = label;
        b.dataset.category = name;
        b.onclick = () => {
          category = name;
          $("key-search").value = "";
          renderChoices();
        };
        host.append(b);
      }
    }
    for (const name of ["basic", "advanced"]) {
      $(`key-mode-${name}`).classList.toggle("selected", mode === name);
      $(`key-mode-${name}`).setAttribute("aria-pressed", String(mode === name));
    }
    document.querySelector(".sidebar-tools .key-advanced").hidden =
      mode === "basic";
    $("key-search").placeholder =
      mode === "basic" ? "搜索常用功能…" : "搜索全部键码…";
  }
  function switchMode(next, keepQuery = false) {
    mode = next;
    category = mode === "basic" ? "基础" : "快捷组合";
    if (!keepQuery) $("key-search").value = "";
    renderCategories();
    renderChoices();
  }
  $("key-mode-basic").onclick = () => switchMode("basic");
  $("key-mode-advanced").onclick = () => switchMode("advanced");
  renderCategories();
  $("key-search").oninput = renderChoices;
  $("key-reset").onclick = () =>
    assign(origin.keycodes[keyIndex(layer, selected.row, selected.col)]);
  $("key-hex-apply").onclick = () => {
    try {
      assign(parseKeycode($("key-hex").value));
    } catch (e) {
      notice(e.message, true);
    }
  };
  async function load() {
    const d = getDevice();
    if (!d || d.broken) throw Error("请先连接键盘");
    loaded = false;
    const actual = await new KeymapDevice(d).read();
    profile=d.profile||DEVICE_PROFILES.athena75;({definition,defaults}=profileLayout(profile));
    selected={row:0,col:0};layer=0;
    document.querySelector(".layer-bar .section-label").textContent=`${profile.name} · 层`;
    // Connecting never commits an offline preview or replays failed changes.
    baseline = actual;
    draft = copy(actual);
    origin = copy(actual);
    boundDevice = d;
    loaded = true;
    syncError = false;
    render();
  }
  $("keymap-reload").onclick = () =>
    run(async () => {
      await load();
      notice("已重新读取 8 层键位。");
    });
  $("keymap-export").onclick = () =>
    download(
      { ...draft, exported: new Date().toISOString() },
      `${profile.id}-keymap.json`,
    );
  $("keymap-backup").onclick = async () => {
    try {
      const b = JSON.parse(localStorage.getItem(backupKey()) || "[]")[0];
      if (!b) throw Error("还没有写入前备份，首次修改键位时会自动生成");
      if ((await digest(new TextEncoder().encode(b.data))) !== b.sha256)
        throw Error("备份校验失败");
      download(
        validateKeymap(JSON.parse(b.data)),
        `${profile.id}-keymap-before-${b.created.replace(/[:.]/g, "-")}.json`,
      );
    } catch (e) {
      notice(e.message, true);
    }
  };
  $("keymap-import").onclick = () => $("keymap-file").click();
  $("keymap-file").onchange = async () => {
    const f = $("keymap-file").files[0];
    $("keymap-file").value = "";
    if (!f || getBusy()) return;
    try {
      if (f.size > 65536) throw Error("键位文件过大");
      const data = validateKeymap(JSON.parse(await f.text()));
      changesBetween(baseline, data);
      await applyMap(data);
    } catch (e) {
      notice(e.message, true);
    }
  };
  window.addEventListener("beforeunload", (e) => {
    if (applying || (!connected() && count())) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  render();
  viewPage(
    location.hash === "#test"
      ? "test"
      : location.hash === "#screen"
        ? "screen"
        : "keymap",
  );
  function previewModel(id){
    if(getDevice())throw Error("请先断开键盘再使用演示模式");
    profile=DEVICE_PROFILES[id]||DEVICE_PROFILES.athena75;({definition,defaults}=profileLayout(profile));
    baseline={format:"athena-keymap-v1",model:profile.id,uid:profile.uid,protocol:12,layers:profile.layers,rows:profile.rows,cols:profile.cols,layoutOptions:profile.layoutOptions,keycodes:[...defaults]};
    draft=copy(baseline);origin=copy(baseline);loaded=false;boundDevice=null;syncError=false;layer=0;selected={row:0,col:0};
    document.querySelector(".layer-bar .section-label").textContent=`${profile.name} · 层`;
    render();viewPage("keymap");
  }
  return {
    snapshot:()=>ready()?structuredClone(baseline):null,
    previewModel,viewPage,
    refreshConnection,
    load,
    getLayoutOptions: () => draft.layoutOptions,
    getProfile:()=>profile,
  };
}
