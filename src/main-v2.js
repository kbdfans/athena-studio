import {ZmkRuntime} from './zmk-runtime.js';
import {connectZmkSerial} from './zmk-serial.js';
import {setupZmkUI} from './zmk-ui.js';
import {setupFeedback} from './feedback-ui.js';
import {startDiagnostics,recordDiagnostic} from './diagnostics.js';
import {setupFirmwareUpgrade} from './firmware-upgrade-ui.js';
import {connectIdentifiedKeyboard} from "./connect-keyboard.js";
import {setupLanguages} from "./i18n.js";
import {renderConnectionGate} from "./connection-gate.js";
import { saveSource, saveSourceSettings } from "./source-history.js";
import { transferImage } from "./image-transfer.js";
import { setupWriteFeedback } from "./write-feedback.js";
import { setupSourceHistory } from "./source-history-ui.js";
import { hasLiveConnection, renderConnectionControls } from "./connection-state.js";
import {
  SLOTS,
  slotAt,
  encodeQgf,
  inspectQgf,
  encodeUf2,
  pixels565,
  rgba565,
  optimizeFrames,
} from "./format-v2.js";
import { identifyAthena } from "./device.js";
import { setupPet } from "./pet-ui.js";
import { setupKeymap } from "./keymap-ui.js";
import { setupKeyboardTester } from "./keyboard-tester.js";
startDiagnostics();
let petUI, keymapUI, testerUI, sourceHistoryUI, firmwareUI, zmkUI;
let sourceId = null, sourceSettingsTimer;
let transferStarted = 0;
import { saveBackup, listBackups, getBackup, digest } from "./backup-v2.js";
const $ = (id) => document.getElementById(id);
const writeFeedback = setupWriteFeedback();
const state = {
  sessionReady: false,
  demo: false,
  source: null,
  output: [],
  bytes: null,
  slot: 0,
  zoom: 1,
  x: 0.5,
  y: 0.5,
  playing: !matchMedia("(prefers-reduced-motion: reduce)").matches,
  frame: 0,
  boot: null,
  identity: null,
  busy: false,
  epoch: 0,
  preparedEpoch: 0,
  headers: null,
};
const scratch = document.createElement("canvas"),
  sc = scratch.getContext("2d", { willReadFrequently: true }),
  small = document.createElement("canvas");
small.width = small.height = 128;
const sm = small.getContext("2d", { willReadFrequently: true });
let timer,
  worker,
  pendingWrite = null,
  prevTime = 0;
let noticeTimer;
function notice(text, error = false) {
  if(error)recordDiagnostic("runtime.error");
  clearTimeout(noticeTimer);
  if (!error) noticeTimer = setTimeout(() => { if (!state.busy) $("notice").hidden = true; }, 6000);
  $("notice").hidden = false;
  $("notice").textContent = text;
  $("notice").classList.toggle("error", error);
}
function busy(value, { quiet = false } = {}) {
  state.busy = value;
  document.body.classList.toggle("busy", value);
  document.body.classList.toggle("busy-quiet", value && quiet);
  document.querySelectorAll("button,input,select,textarea").forEach((e) => {
    if (value) {
      e.dataset.wasDisabled = e.disabled ? "1" : "0";
      e.disabled = true;
    } else if ("wasDisabled" in e.dataset) {
      e.disabled = e.dataset.wasDisabled === "1";
      delete e.dataset.wasDisabled;
    }
  });
  updateDevice();
}
function progress(label, pct, phase) {
  writeFeedback.progress(pct, label, phase);
}
function updateDevice() {
  const boot = hasLiveConnection(state.boot);
  renderConnectionControls(state.boot, state.busy);
  const isZmk=state.boot?.protocol==='zmk';
  const screenSupported = !isZmk && state.boot?.capabilities?.screen !== false;
  for(const id of ['tester-nav','firmware-nav','connection-test-feature']){const e=$(id);if(e)e.hidden=isZmk;}
  $('keymap-workspace').hidden=isZmk;
  zmkUI?.refresh();
  $("connection-screen-feature").hidden = !screenSupported;
  $("firmware-entry").hidden = !boot || isZmk;
  $("firmware-entry").textContent = screenSupported ? "固件升级与操作图示" : "升级固件，启用屏幕功能";
  $("shared-connection-copy").textContent = isZmk ? "键位设置与布局切换共用当前连接，修改后自动保存到键盘。" : screenSupported
    ? "键位设置、屏幕设置和键盘检测共用当前连接，切换功能或关闭弹窗都无需重新连接。"
    : "键位设置和键盘检测共用当前连接。当前固件尚未支持屏幕工作室，请先升级对应型号固件。";
  for(const id of ["screen-nav","screen-shortcut"])$(id).hidden=!!state.boot&&!state.boot.capabilities?.screen;
  const allowed=renderConnectionGate(state.boot,state.sessionReady,state.busy,document,state.demo,firmwareUI?.isOpenForUpgrade()||false);
  if(!allowed)testerUI?.setVisible(false);
  $("demo-banner").hidden=!state.demo;
  document.body.classList.toggle("demo-mode",state.demo);
  $("connection-state").textContent = boot
    ? state.boot.isRuntime
      ? "正常模式已连接 · 无需升级模式"
      : "升级设备已连接"
    : "尚未连接 v2 键盘";
  $("connection-dot").classList.toggle("connected", !!boot);
  petUI?.refreshConnection();
  if(!isZmk){keymapUI?.refreshConnection();testerUI?.refreshConnection();}
  $("write").disabled =
    !state.boot?.capabilities?.screen || !boot || !state.bytes || state.busy || state.preparedEpoch !== state.epoch;
  $("download").disabled = !state.bytes || state.busy;
  $("disconnect").hidden = !boot;
  $("recover-screen").hidden = !boot || !state.boot.capabilities?.screen;
  $("recover-screen").disabled = state.busy;
}
function cropBox() {
  const { width, height } = state.source;
  const side = Math.min(width, height) / state.zoom;
  return { x: (width - side) * state.x, y: (height - side) * state.y, side };
}
function paintSource(index, target) {
  if (!state.source) return;
  const f =
    state.source.frames[
      Math.max(0, Math.min(index, state.source.frames.length - 1))
    ];
  if (!f) return;
  scratch.width = state.source.width;
  scratch.height = state.source.height;
  sc.putImageData(
    new ImageData(f.rgba, state.source.width, state.source.height),
    0,
    0,
  );
  const c = cropBox(),
    ctx = target.getContext("2d");
  ctx.fillStyle = "#101217";
  ctx.fillRect(0, 0, target.width, target.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(
    scratch,
    c.x,
    c.y,
    c.side,
    c.side,
    0,
    0,
    target.width,
    target.height,
  );
}
function render() {
  if (!state.source) return;
  const f = state.output[state.frame];
  const sourceIndex = f?.sourceIndex ?? Number($("start").value) - 1;
  paintSource(sourceIndex, $("crop"));
  const ctx = $("screen").getContext("2d");
  if (f) ctx.putImageData(new ImageData(rgba565(f.data), 128, 128), 0, 0);
  else {
    paintSource(sourceIndex, small);
    ctx.putImageData(
      new ImageData(
        rgba565(pixels565(sm.getImageData(0, 0, 128, 128).data)),
        128,
        128,
      ),
      0,
      0,
    );
  }
  $("frame-position").textContent =
    `${String(state.frame + 1).padStart(2, "0")} / ${state.output.length || "—"}`;
  $("scrub").max = Math.max(0, state.output.length - 1);
  $("scrub").value = state.frame;
  $("play").textContent = state.playing ? "Ⅱ" : "▶";
  $("play").setAttribute("aria-label", state.playing ? "暂停动画" : "播放动画");
}
function animate(time) {
  if (state.playing && state.output.length && !state.busy) {
    if (!prevTime) prevTime = time;
    let elapsed = time - prevTime;
    let loops = 0;
    while (
      elapsed >= state.output[state.frame].delay &&
      loops++ < state.output.length
    ) {
      elapsed -= state.output[state.frame].delay;
      prevTime += state.output[state.frame].delay;
      state.frame = (state.frame + 1) % state.output.length;
    }
    render();
  } else prevTime = time;
  requestAnimationFrame(animate);
}
function syncStats() {
  const s = slotAt(state.slot),
    n = state.output.length,
    duration = state.output.reduce((a, f) => a + f.delay, 0) / 1000;
  $("frame-count").innerHTML = `${n}<small> / ${s.maxFrames}</small>`;
  $("out-duration").textContent = `${duration.toFixed(2)}s`;
  $("size").textContent =
    `${((state.bytes?.length || 0) / 1024).toFixed(0)} KB / ${s.capacity / 1048576} MB`;
  $("capacity-bar").style.width =
    `${((state.bytes?.length || 0) / s.capacity) * 100}%`;
  $("duration").textContent = `${duration.toFixed(2)} 秒`;
  $("optimization-note").textContent =
    `${Number($("end").value) - Number($("start").value) + 1} 原始帧 → ${n} 输出帧 · 保留播放时长`;
  $("preview-mode").textContent = state.source?.demo
    ? "示例预览"
    : "已适配 · RGB565";
  updateDevice();
}
function sourceSettings() {
  return {zoom:state.zoom,x:state.x,y:state.y,start:Number($("start").value),end:Number($("end").value),fps:Number($("fps").value)};
}
function prepare(delay = 120) {
  if (sourceId) {
    const id = sourceId, settings = sourceSettings();
    clearTimeout(sourceSettingsTimer);
    sourceSettingsTimer = setTimeout(() => saveSourceSettings(id,settings).catch(() => sourceHistoryUI?.report()),250);
  }
  clearTimeout(timer);
  const epoch = ++state.epoch;
  state.bytes = null;
  updateDevice();
  render();
  timer = setTimeout(async () => {
    try {
      if (!state.source) return;
      const count = state.source.frames.length;
      let start = Math.max(1, Math.min(count, Number($("start").value) || 1)),
        end = Math.max(start, Math.min(count, Number($("end").value) || count));
      $("start").value = start;
      $("end").value = end;
      const frames = [];
      for (let i = start - 1; i < end; i++) {
        if (epoch !== state.epoch) return;
        paintSource(i, small);
        frames.push({
          data: pixels565(sm.getImageData(0, 0, 128, 128).data),
          delay: state.source.frames[i].delay,
          sourceIndex: i,
        });
        if (i % 20 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      if (epoch !== state.epoch) return;
      state.output = optimizeFrames(
        frames,
        slotAt(state.slot).maxFrames,
        Number($("fps").value),
      );
      state.bytes = encodeQgf(state.output, state.slot);
      state.preparedEpoch = epoch;
      state.frame = 0;
      prevTime = 0;
      syncStats();
      render();
    } catch (e) {
      if (epoch === state.epoch) {
        state.bytes = null;
        notice(e.message, true);
        updateDevice();
      }
    }
  }, delay);
}
function setSource(source, name) {
  sourceId = null;
  state.source = source;
  state.zoom = 1;
  state.x = state.y = 0.5;
  state.frame = 0;
  state.output = [];
  $("zoom").value = 1;
  $("zoom-value").textContent = "100%";
  $("file-name").textContent = name;
  $("source-size").textContent = `${source.width} × ${source.height}`;
  $("start").max = $("end").max = source.frames.length;
  $("start").value = 1;
  $("end").value = source.frames.length;
  $("notice").hidden = true;
  prepare(0);
}
function demo() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const c = canvas.getContext("2d"),
    frames = [];
  for (let i = 0; i < 24; i++) {
    c.fillStyle = "#111b29";
    c.fillRect(0, 0, 256, 256);
    for (let j = 0; j < 35; j++) {
      c.fillStyle = j % 3 ? "#657587" : "#e5e1ce";
      c.fillRect(
        (j * 73 + 17) % 252,
        (j * 47 + 29) % 252,
        j % 3 ? 1 : 2,
        j % 3 ? 1 : 2,
      );
    }
    c.save();
    c.translate(128, 128);
    c.rotate(-0.4);
    c.strokeStyle = "#49566c";
    c.lineWidth = 2;
    c.beginPath();
    c.ellipse(0, 0, 95, 35, 0, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = "#ff4d00";
    c.beginPath();
    c.arc(0, 0, 50, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#e23b00";
    c.beginPath();
    c.ellipse(16, 8, 33, 48, 0.2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#ffb26b";
    c.fillRect(-25, -24, 10, 10);
    c.fillRect(-34, -12, 7, 7);
    const angle = (i / 24) * Math.PI * 2;
    c.fillStyle = "#e9e8e0";
    c.beginPath();
    c.arc(Math.cos(angle) * 95, Math.sin(angle) * 35, 7, 0, Math.PI * 2);
    c.fill();
    c.restore();
    frames.push({ rgba: c.getImageData(0, 0, 256, 256).data, delay: 100 });
  }
  setSource({ width: 256, height: 256, frames, demo: true }, "轨道 · 内置示例");
}
async function loadFile(file, savedSettings = null) {
  if (!file || state.busy) return;
  if (file.size > 20 * 1024 * 1024) {
    notice("素材最大 20 MB，请缩小后重试", true);
    return;
  }
  busy(true);
  worker?.terminate();
  try {
    notice("正在本地解析素材…");
    const data = await file.arrayBuffer(),
      magic = new Uint8Array(data, 0, Math.min(6, data.byteLength));
    let source;
    if (String.fromCharCode(...magic).startsWith("GIF8")) {
      source = await new Promise((resolve, reject) => {
        worker = new Worker(new URL("./gif-worker.js", import.meta.url), {
          type: "module",
        });
        const timeout = setTimeout(() => {
          worker.terminate();
          reject(Error("解析超时，请缩短或缩小 GIF"));
        }, 30000);
        worker.onmessage = ({ data }) => {
          clearTimeout(timeout);
          worker.terminate();
          data.error ? reject(Error(data.error)) : resolve(data);
        };
        worker.onerror = () => {
          clearTimeout(timeout);
          worker.terminate();
          reject(Error("GIF 解析失败，请检查文件"));
        };
        worker.postMessage(data, [data]);
      });
    } else {
      const image = await createImageBitmap(file);
      try {
        if (image.width > 4096 || image.height > 4096)
          throw Error("静态图片边长请保持在 4096 像素以内");
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0);
        source = {
          width: image.width,
          height: image.height,
          frames: [
            {
              rgba: ctx.getImageData(0, 0, image.width, image.height).data,
              delay: 1000,
            },
          ],
        };
      } finally {
        image.close();
      }
    }
    if (!source.frames.length) throw Error("文件中没有有效画面");
    setSource(source, file.name);
    if (savedSettings) {
      const valid = (value, fallback, min, max) => Number.isFinite(value) ? Math.max(min,Math.min(max,value)) : fallback;
      state.zoom=valid(savedSettings.zoom,1,1,4); state.x=valid(savedSettings.x,.5,0,1); state.y=valid(savedSettings.y,.5,0,1);
      $("zoom").value=state.zoom; $("zoom-value").textContent=`${Math.round(state.zoom*100)}%`;
      $("start").value=Math.round(valid(savedSettings.start,1,1,source.frames.length));
      $("end").value=Math.round(valid(savedSettings.end,source.frames.length,Number($("start").value),source.frames.length));
      $("fps").value=Math.round(valid(savedSettings.fps,15,1,30)); $("fps-value").textContent=`${$("fps").value} FPS`;
      prepare(0);
    }
    try {
      const thumbnail = await new Promise(resolve => $("crop").toBlob(resolve,"image/png"));
      const record = await saveSource(file,thumbnail,sourceSettings());
      sourceId = record.id;
      await sourceHistoryUI.refresh();
    } catch { sourceHistoryUI.report(); }
  } catch (e) {
    notice(`导入失败：${e.message}`, true);
  } finally {
    busy(false);
    $("file").value = "";
  }
}
function download(bytes, name) {
  const url = URL.createObjectURL(
      new Blob([bytes], { type: "application/octet-stream" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function showConnection() {
  if (!hasLiveConnection(state.boot)) return connectKeyboard();
  updateDevice();
  if (!$("connection-dialog").open) $("connection-dialog").showModal();
}
function updateSlot() {
  const s = slotAt(state.slot),
    h = state.headers?.[state.slot];
  $("slot-description").textContent = "独立图片位置 · 2 MB" + (h ? ` · ${h.empty ? "目前为空" : `已有 ${h.frames} 帧`}` : "");
  prepare();
}
async function performWrite(operation) {
  recordDiagnostic("image.write");
  if (state.busy || !state.boot?.capabilities?.screen) return;
  const p = state.boot,
    slot = operation.slot,
    s = slotAt(slot);
  busy(true);
  $("confirm-dialog").close();
  $("backup-dialog").close();
  let record;
  const backupBeforeWrite = operation.backupBeforeWrite === true;
  let writeStarted = false;
  transferStarted = performance.now();
  let backupSeconds = 0;
  $("notice").hidden = true;
  writeFeedback.start({ target: s.label, filename: operation.restore ? "恢复已保存的动画" : $("file-name").textContent, backup: backupBeforeWrite });
  try {
    progress(backupBeforeWrite ? "正在备份此位置的原始内容…" : "本次跳过备份，准备写入…", 0);
    const writeBase = backupBeforeWrite ? 22 : 0;
    await transferImage(p, operation, {
      saveBackup:(slot,data)=>saveBackup(slot,data,p.profile.id),
      onBackupProgress: (n) => progress(`正在读取原始动画备份… ${Math.round(n * 100)}%`, n * 20),
      onBackupSaved: (saved) => {
        record = saved;
        backupSeconds = (performance.now() - transferStarted) / 1000;
      },
      onWriteStart: () => {
        writeStarted = true;
        progress(backupBeforeWrite ? "原始备份已保存，正在写入动画" : "正在直接写入动画", writeBase, "write");
      },
      onWriteProgress: (n) => n >= 1
        ? progress("传输完成，正在核对键盘内的数据", 90, "verify")
        : progress(p.fastSupported ? "正在通过高速通道传输" : "正在传输动画数据", writeBase + n * (90 - writeBase), "write"),
    });
    if (!p.isRuntime) {
      progress("逐字节校验通过，正在重启键盘…", 95);
      await p.reboot();
      state.boot = null;
    }
    if (p.isRuntime) {
      state.headers ??= [];
      state.headers[slot] = inspectQgf(operation.bytes, slot);
    } else {
      state.headers = null;
    }
    updateSlot();
    let timing = `${backupBeforeWrite ? `备份 ${Math.round(backupSeconds)} 秒` : "本次跳过备份"} · 写入与校验 ${Math.round((performance.now()-transferStarted)/1000-backupSeconds)} 秒 · 共 ${Math.round((performance.now()-transferStarted)/1000)} 秒`;
    if (p.lastTransfer) {
      const t = p.lastTransfer;
      timing += ` · ${(t.bytes / 1024 / Math.max(t.dataMs / 1000, 0.001)).toFixed(1)} KB/s · 校验 ${(t.verifyMs / 1000).toFixed(1)} 秒`;
      if (t.flash) timing += ` · 设备擦除 ${(t.flash.eraseMs / 1000).toFixed(1)} 秒 · 编程 ${(t.flash.programMs / 1000).toFixed(1)} 秒`;
    }
    recordDiagnostic("image.complete");
    writeFeedback.complete({ title: `${s.label} · 写入完成`, description: "数据校验通过。切换到此图片即可播放。", seconds: (performance.now() - transferStarted) / 1000, details: timing });
  } catch (e) {
    recordDiagnostic("image.failed");
    writeFeedback.fail(
      `${e.message}${record ? " 原始动画已自动备份到此浏览器。" : writeStarted ? " 本次未创建备份，该图片位置可能已被覆盖，请重新写入。" : " 尚未开始擦除或写入。"}`,
    );
    await p.close();
    state.boot = null;
  } finally {
    busy(false);
  }
}
async function showBackups() {
  const dialog = $("backup-dialog");
  if (!dialog.open) dialog.showModal();
  const container = $("backup-list");
  container.replaceChildren();
  $("backup-error").textContent = "";
  try {
    const records = (await listBackups(state.boot?.profile?.id||"athena75")).filter((r)=>r.slot<3);
    if (!records.length) {
      container.textContent = "暂时没有备份。写入时勾选备份即可保存。";
      return;
    }
    for (const r of records) {
      const item = document.createElement("div");
      item.className = "backup-item";
      const title = document.createElement("strong");
      title.textContent = `${slotAt(r.slot).label} · ${slotAt(r.slot).name}`;
      const date = document.createElement("p");
      date.textContent = `${new Date(r.created).toLocaleString()} · 完整位置备份`;
      const save = document.createElement("button");
      save.textContent = "下载原始备份";
      save.onclick = () =>
        download(
          encodeUf2(r.data, r.slot),
          `athena-backup-gif${r.slot}-${r.id.slice(0, 8)}.uf2`,
        );
      const restore = document.createElement("button");
      restore.textContent = "恢复到键盘";
      restore.onclick = async () => {
        if (!state.boot) {
          dialog.close();
          showConnection();
          notice("请先连接键盘，再从备份列表恢复。");
          return;
        }
        try {
          const saved = await getBackup(r.id);
          if (!saved || (saved.model||"athena75")!==state.boot.profile.id || (await digest(saved.data)) !== saved.sha256)
            throw Error("备份校验失败");
          pendingWrite = { slot: saved.slot, bytes: saved.data, restore: true };
          dialog.close();
          $("confirm-details").replaceChildren();
          const heading = document.createElement("strong");
          heading.textContent = `恢复 ${slotAt(saved.slot).label} 的完整备份`;
          $("confirm-details").append(heading);
          $("confirm-screen").getContext("2d").clearRect(0, 0, 128, 128);
          openWriteConfirmation();
        } catch (e) {
          $("backup-error").textContent = e.message;
        }
      };
      item.append(title, date, save, restore);
      container.append(item);
    }
  } catch (e) {
    $("backup-error").textContent = "无法读取备份：" + e.message;
  }
}
SLOTS.forEach((s, i) => {
  const o = new Option(`${s.label} — ${s.name}`, i);
  $("slot").append(o);
});
$("slot").value = state.slot;
$("import").onclick = () => $("file").click();
$("file").onchange = (e) => loadFile(e.target.files[0]);
$("demo").onclick = demo;
$("dropzone").ondragover = (e) => {
  e.preventDefault();
  $("dropzone").classList.add("dragover");
};
$("dropzone").ondragleave = () => $("dropzone").classList.remove("dragover");
$("dropzone").ondrop = (e) => {
  e.preventDefault();
  $("dropzone").classList.remove("dragover");
  loadFile(e.dataTransfer.files[0]);
};
$("zoom").oninput = (e) => {
  state.zoom = Number(e.target.value);
  $("zoom-value").textContent = `${Math.round(state.zoom * 100)}%`;
  prepare();
};
$("reset-crop").onclick = () => {
  state.zoom = 1;
  state.x = state.y = 0.5;
  $("zoom").value = 1;
  $("zoom-value").textContent = "100%";
  prepare();
};
let drag;
const crop = $("crop");
crop.onpointerdown = (e) => {
  if (state.busy) return;
  crop.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, px: state.x, py: state.y };
};
crop.onpointermove = (e) => {
  if (!drag || state.busy) return;
  const box = cropBox(),
    rect = crop.getBoundingClientRect();
  state.x = Math.max(
    0,
    Math.min(
      1,
      drag.px -
        ((e.clientX - drag.x) * box.side) /
          rect.width /
          Math.max(1, state.source.width - box.side),
    ),
  );
  state.y = Math.max(
    0,
    Math.min(
      1,
      drag.py -
        ((e.clientY - drag.y) * box.side) /
          rect.height /
          Math.max(1, state.source.height - box.side),
    ),
  );
  prepare();
};
crop.onpointerup = crop.onpointercancel = () => {
  drag = null;
};
crop.onkeydown = (e) => {
  if (state.busy) return;
  const delta = {
    ArrowLeft: [-0.03, 0],
    ArrowRight: [0.03, 0],
    ArrowUp: [0, -0.03],
    ArrowDown: [0, 0.03],
  }[e.key];
  if (delta) {
    e.preventDefault();
    state.x = Math.max(0, Math.min(1, state.x + delta[0]));
    state.y = Math.max(0, Math.min(1, state.y + delta[1]));
    prepare();
  }
};
$("fps").oninput = (e) => {
  $("fps-value").textContent = `${e.target.value} FPS`;
  prepare();
};
$("start").onchange = $("end").onchange = () => prepare(0);
$("slot").onchange = (e) => {
  state.slot = Number(e.target.value);
  updateSlot();
};
$("optimize").onclick = () => {
  prepare(0);
  notice("已自动匹配该位置的容量：保留片段时长，减少冗余帧。");
};
$("play").onclick = () => {
  state.playing = !state.playing;
  render();
};
$("scrub").oninput = (e) => {
  state.playing = false;
  state.frame = Number(e.target.value);
  render();
};
$("download").onclick = () => {
  if (state.bytes)
    download(encodeUf2(state.bytes, state.slot), `athena-gif${state.slot}.uf2`);
};
$("connect").onclick = $("help").onclick = showConnection;
async function connectKeyboard() {
  recordDiagnostic("connection.request");
  if (state.busy) return;
  if (hasLiveConnection(state.boot)) {
    $("connection-dialog").close();
    updateDevice();
    return;
  }
  $("connection-error").textContent = "";
  $("gate-error").textContent = "";state.sessionReady=false;
  $("notice").hidden = true;
  busy(true);
  try {
    if (state.boot) await state.boot.close();
    state.boot = null;
    if($('connection-protocol').value==='zmk'){
      testerUI?.setVisible(false);
      let runtime;
      const rpc=await connectZmkSerial({onDisconnect:()=>{runtime?.disconnected();updateDevice();}});
      runtime=new ZmkRuntime(rpc,{onChange:()=>zmkUI?.refresh()});
      state.boot=runtime;
      await runtime.initialize();
      state.identity={profile:runtime.profile,protocol:'zmk',name:runtime.profile.name};state.demo=false;
      zmkUI.load();state.sessionReady=true;
      $('identity').textContent=`已识别 ${runtime.profile.name}`;
      $('connection-dialog').close();recordDiagnostic('connection.ready');updateDevice();return;
    }
    state.identity = await identifyAthena({ prompt: true, models:["athena75","athena1800"] });
    $("identity").textContent = `已识别 ${state.identity.profile.name}`;
    const runtime = await connectIdentifiedKeyboard(state.identity);
    state.identity.runtimeUpload = !!runtime;
    if (runtime) {
      state.boot = runtime;
      state.headers = runtime.capabilities?.screen ? await runtime.headers() : null;
      state.demo=false;
      await keymapUI.load();
      if(runtime.buildInfo)state.identity.buildInfo=await runtime.buildInfo();
      state.sessionReady=true;
      recordDiagnostic("connection.ready");
      $("connection-dialog").close();
      writeFeedback.dismiss();
      $("notice").hidden = true;
      updateSlot();
    } else {
      throw Error("这把键盘仍是旧版固件。请先完成 v2 固件升级与动画迁移，再使用此入口。");
    }
  } catch (e) {
    recordDiagnostic("connection.failed");
    await state.boot?.close().catch(()=>{});
    state.boot = null;
    state.identity = null;
    $("identity").textContent = "";
    state.sessionReady=false;
    if (e.name !== "NotFoundError") {$("gate-error").textContent=e.message;notice(e.message, true);}
  } finally {
    busy(false);
  }
}
$("identify").onclick = $("gate-connect").onclick = connectKeyboard;
for(const picker of document.querySelectorAll('[data-connection-protocol]'))picker.onchange=()=>{for(const other of document.querySelectorAll('[data-connection-protocol]'))other.value=picker.value;};
firmwareUI=setupFirmwareUpgrade({
  getIdentity:()=>state.identity,getSnapshot:()=>keymapUI.snapshot(),getBusy:()=>state.busy,
  releaseConnection:async()=>{testerUI?.setVisible(false);await state.boot?.close();state.boot=null;state.sessionReady=false;state.headers=null;updateDevice();},
  onFinished:()=>{state.identity=null;updateDevice();},
  onStateChange:()=>updateDevice(),
});
$("firmware-entry").onclick=$("firmware-nav").onclick=$("gate-firmware").onclick=()=>{$("connection-dialog").close();firmwareUI.open();};

function openWriteConfirmation() {
  writeFeedback.dismiss();
  $("backup-before-write").checked = true;
  updateWriteConfirmation();
  $("confirm-dialog").showModal();
}
function updateWriteConfirmation() {
  const backup = $("backup-before-write").checked;
  $("confirm-write").textContent = backup ? "备份并开始写入 ↗" : "直接写入 ↗";
  $("skip-backup-note").hidden = backup;
  $("backup-before-write").setAttribute("aria-describedby", backup ? "backup-choice-help" : "backup-choice-help skip-backup-note");
}
$("backup-before-write").onchange = updateWriteConfirmation;
$("write").onclick = () => {
  if (!state.bytes || state.busy || !hasLiveConnection(state.boot)) return;
  return performWrite({ slot: state.slot, bytes: state.bytes.slice(), backupBeforeWrite: false });
};
$("confirm-write").onclick = () => {
  if (pendingWrite) performWrite({ ...pendingWrite, backupBeforeWrite: $("backup-before-write").checked });
};
$("backups").onclick = showBackups;
$("connection-disconnect").onclick = $("disconnect").onclick = async () => {
  recordDiagnostic("connection.closed");
  if (state.busy) return;
  const runtime = state.boot?.isRuntime;
  try{await state.boot?.close();}catch(e){notice(e.message,true);return;}
  state.boot = null;
  state.identity = null;
  $("identity").textContent = "";
  $("connection-dialog").close();
  state.headers = null;
  updateSlot();
  updateDevice();
  notice(
    runtime
      ? "网页连接已断开，键盘保持正常模式。"
      : "网页连接已断开。键盘仍在升级模式，拔插 USB 线可恢复正常使用。",
  );
};
$("recover-screen").onclick = async () => {
  if (!state.boot?.capabilities?.screen || state.busy) return;
  busy(true);
  try {
    await state.boot.recoverScreen();
    notice(
      "已请求重新初始化屏幕，请观察键盘显示。此操作不覆盖动画，也不重刷固件。",
    );
  } catch (e) {
    notice(e.message, true);
  } finally {
    busy(false);
  }
};
navigator.hid?.addEventListener("disconnect", (e) => {
  if (state.boot?.device === e.device) {
    state.boot.broken = true;
    updateDevice();
  }
});
document
  .querySelectorAll("[data-close]")
  .forEach((b) => (b.onclick = () => b.closest("dialog").close()));
document.querySelectorAll("dialog").forEach((d) =>
  d.addEventListener("cancel", (e) => {
    if (state.busy) e.preventDefault();
  }),
);
window.addEventListener("beforeunload", (e) => {
  if (state.busy) {
    e.preventDefault();
    e.returnValue = "";
  }
});
navigator.usb?.addEventListener("disconnect", (e) => {
  if (state.boot?.device === e.device) {
    state.boot.broken = true;
    updateDevice();
  }
});
document.querySelectorAll("[data-modal-connect]").forEach(b => { b.onclick = () => $("connect").click(); });
zmkUI=setupZmkUI({getDevice:()=>state.boot,notice});
testerUI=setupKeyboardTester({getProfile:()=>keymapUI?.getProfile(),getDevice:()=>state.boot?.protocol==='zmk'?null:state.boot,getBusy:()=>state.busy,getLayoutOptions:()=>keymapUI?.getLayoutOptions() ?? 10});
keymapUI=setupKeymap({getDemo:()=>state.demo,getDevice:()=>state.boot,getBusy:()=>state.busy,setBusy:busy,notice,onView:(view)=>testerUI.setVisible(view === "test")});
$("gate-demo").onclick=async()=>{
  if(state.busy)return;
  try{await state.boot?.close();state.boot=null;state.identity=null;state.sessionReady=false;state.headers=null;state.demo=true;keymapUI.previewModel($("demo-model").value);updateDevice();}catch(e){notice(e.message,true);}
};
$("demo-model").onchange=()=>{if(state.demo){testerUI.setVisible(false);keymapUI.previewModel($("demo-model").value);updateDevice();}};
$("demo-exit").onclick=()=>{if(state.busy)return;state.demo=false;testerUI.setVisible(false);keymapUI.viewPage("keymap");updateDevice();};
sourceHistoryUI=setupSourceHistory({load:loadFile,getBusy:()=>state.busy,notice});
void sourceHistoryUI.refresh();
petUI=setupPet({getDevice:()=>state.boot?.capabilities?.screen?state.boot:null,getBusy:()=>state.busy,setBusy:busy,notice,getImage:()=>state.slot,feedback:writeFeedback});
demo();
requestAnimationFrame(animate);

setupFeedback({getModel:()=>state.identity?.profile?.id||state.boot?.profile?.id});
setupLanguages();
updateDevice();
