import "./style.css";
import {
  SLOTS,
  slotAt,
  encodeQgf,
  inspectQgf,
  encodeUf2,
  pixels565,
  rgba565,
  optimizeFrames,
} from "./format.js";
import { identifyAthena, Picoboot } from "./device.js";
import { RuntimeHid } from "./runtime-hid.js";
import { saveBackup, listBackups, getBackup, digest } from "./backup.js";
const $ = (id) => document.getElementById(id);
const state = {
  source: null,
  output: [],
  bytes: null,
  slot: 2,
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
function notice(text, error = false) {
  $("notice").hidden = false;
  $("notice").textContent = text;
  $("notice").classList.toggle("error", error);
}
function busy(value) {
  state.busy = value;
  document.body.classList.toggle("busy", value);
  document.querySelectorAll("button,input,select").forEach((e) => {
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
function progress(label, pct) {
  $("progress-area").hidden = false;
  $("progress").value = pct;
  $("progress-text").textContent = label;
}
function updateDevice() {
  const boot = state.boot && !state.boot.broken && state.boot.device.opened;
  $("connection-state").textContent = boot
    ? state.boot.isRuntime
      ? "正常模式已连接 · 无需升级模式"
      : "升级设备已连接"
    : state.identity
      ? state.identity.runtimeUpload
        ? "Athena75 已识别 · 请重新连接"
        : "Athena75 已识别 · 等待升级连接"
      : "尚未连接键盘";
  $("connection-dot").classList.toggle("connected", !!boot);
  $("connect").textContent = boot
    ? "已连接 · Athena75"
    : state.identity
      ? state.identity.runtimeUpload
        ? "重新连接键盘 ↗"
        : "连接升级设备 ↗"
      : "连接键盘 ↗";
  $("boot").disabled = !state.identity || state.busy;
  $("write").disabled =
    !boot || !state.bytes || state.busy || state.preparedEpoch !== state.epoch;
  $("download").disabled = !state.bytes || state.busy;
  $("disconnect").hidden = !boot;
  $("recover-screen").hidden = !boot || !state.boot.isRuntime;
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
function prepare(delay = 120) {
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
async function loadFile(file) {
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
  $("connection-dialog").showModal();
  updateDevice();
}
async function connectBoot() {
  if (!state.identity) return;
  $("connection-error").textContent = "";
  busy(true);
  try {
    await state.boot?.close();
    state.boot = await Picoboot.connect();
    state.headers = await state.boot.headers();
    $("connection-dialog").close();
    notice("升级设备已连接。选择动画位置，预览后点击写入。");
    updateSlot();
  } catch (e) {
    $("connection-error").textContent = e.message;
    if (state.boot) {
      await state.boot.close();
      state.boot = null;
    }
  } finally {
    busy(false);
  }
}
function updateSlot() {
  const s = slotAt(state.slot),
    h = state.headers?.[state.slot];
  $("slot-description").textContent =
    (state.slot === 0
      ? "大写锁定时显示"
      : state.slot === 1
        ? "打字时显示"
        : "日常循环播放的动画位置") +
    (h ? ` · ${h.empty ? "目前为空" : `已有 ${h.frames} 帧`}` : "");
  prepare();
}
async function performWrite(operation) {
  if (state.busy || !state.boot) return;
  const p = state.boot,
    slot = operation.slot,
    s = slotAt(slot);
  busy(true);
  $("confirm-dialog").close();
  $("backup-dialog").close();
  let record;
  try {
    progress("正在备份此位置的原始内容…", 0);
    const original = await p.read(slot, s.address, s.capacity, (n) =>
      progress(`正在读取原始动画备份… ${Math.round(n * 100)}%`, n * 20),
    );
    record = await saveBackup(slot, original);
    progress("原始备份已保存并校验，开始写入…", 22);
    await p.program(slot, operation.bytes, (n) =>
      progress(`正在写入并准备回读校验，请勿拔线… ${Math.round(n * 100)}%`, 22 + n * 68),
    );
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
    progress("传输与回读校验完成", 100);
    notice(
      `${s.label} 写入和回读校验成功，${p.isRuntime ? "动画已重新加载，未进入升级模式" : "键盘已重启"}。请在键盘上切换到该动画，确认播放效果。`,
    );
  } catch (e) {
    notice(
      `${e.message}${record ? " 原始动画已保存在“动画备份与恢复”中。" : " 未完成备份，不会开始擦除或写入。"}`,
      true,
    );
    progress("操作未完成，请查看提示", 0);
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
    const records = await listBackups();
    if (!records.length) {
      container.textContent = "暂时没有备份。首次写入前会自动保存。";
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
          if (!saved || (await digest(saved.data)) !== saved.sha256)
            throw Error("备份校验失败");
          pendingWrite = { slot: saved.slot, bytes: saved.data, restore: true };
          dialog.close();
          $("confirm-details").replaceChildren();
          const heading = document.createElement("strong");
          heading.textContent = `恢复 ${slotAt(saved.slot).label} 的完整备份`;
          $("confirm-details").append(heading);
          $("confirm-screen").getContext("2d").clearRect(0, 0, 128, 128);
          $("confirm-dialog").showModal();
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
$("identify").onclick = async () => {
  $("connection-error").textContent = "";
  busy(true);
  try {
    await state.boot?.close();
    state.boot = null;
    state.identity = await identifyAthena();
    $("identity").textContent = `已识别 ${state.identity.name}`;
    const runtime = await RuntimeHid.tryConnect(
      state.identity.device,
      state.identity.uid,
    );
    state.identity.runtimeUpload = !!runtime;
    if (runtime) {
      state.boot = runtime;
      state.headers = await runtime.headers();
      $("connection-dialog").close();
      $("progress-area").hidden = true;
      notice(
        "已连接正常模式，可直接上传。首次完整备份与传输需要一些时间，请保持 USB 连接。",
      );
      updateSlot();
    } else {
      $("identity").textContent += " · 此固件需使用下方升级模式";
    }
  } catch (e) {
    await state.boot?.close();
    state.boot = null;
    state.identity = null;
    $("identity").textContent = "";
    $("connection-error").textContent = e.message;
  } finally {
    busy(false);
  }
};
$("boot").onclick = connectBoot;
$("write").onclick = () => {
  if (!state.bytes || state.busy) return;
  pendingWrite = { slot: state.slot, bytes: state.bytes.slice() };
  $("confirm-screen").getContext("2d").drawImage($("screen"), 0, 0);
  $("confirm-details").replaceChildren();
  const strong = document.createElement("strong");
  strong.textContent = `${slotAt(state.slot).label} · ${slotAt(state.slot).name}`;
  const detail = document.createElement("p");
  detail.textContent = `${state.output.length} 帧 · ${(state.bytes.length / 1024).toFixed(0)} KB`;
  $("confirm-details").append(strong, detail);
  $("confirm-dialog").showModal();
};
$("confirm-write").onclick = () => {
  if (pendingWrite) performWrite(pendingWrite);
};
$("backups").onclick = showBackups;
$("disconnect").onclick = async () => {
  const runtime = state.boot?.isRuntime;
  await state.boot?.close();
  state.boot = null;
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
  if (!state.boot?.isRuntime || state.busy) return;
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
demo();
requestAnimationFrame(animate);
