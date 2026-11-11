import { celebrateWrite } from './write-celebration.js';
const PHASES = {
  backup: ['备份原内容', '正在保存原内容'],
  write: ['写入动画', '正在写入键盘'],
  verify: ['校验数据', '正在校验写入结果'],
  activate: ['启用宠物', '正在切换屏幕模式'],
};

export function setupWriteFeedback(root = document, clock = {}) {
  const $ = id => root.getElementById(id);
  const now = clock.now || (() => performance.now());
  const every = clock.every || ((fn) => setInterval(fn, 1000));
  const stop = clock.stop || clearInterval;
  const panel = $('progress-area'), dialog = $('transfer-dialog');
  let stopCelebration = () => {};
  const celebrate = clock.celebrate || (() => celebrateWrite(root));
  let active = false, started = 0, timer, button, originalLabel, stage, target;
  function elapsed(seconds = (now() - started) / 1000) {
    $('transfer-elapsed').textContent = `${Math.max(0, seconds).toFixed(1)} 秒`;
  }
  function buttonState(state, text) {
    if (!button) return;
    button.dataset.writeState = state;
    button.textContent = text;
  }
  function restoreButton() {
    if (!button) return;
    button.textContent = originalLabel;
    delete button.dataset.writeState;
    button.style.removeProperty('--write-progress');
  }
  function stageState(next) {
    stage = next;
    panel.dataset.state = next;
    panel.setAttribute('aria-busy', String(active));
    const order = ['backup', 'write', 'verify'];
    for (const [i, name] of order.entries()) {
      const el = $(`transfer-step-${name}`);
      el.dataset.state = next === 'success' || i < order.indexOf(next) ? 'done' : name === next ? 'active' : 'waiting';
    }
  }
  function phase(next, description) {
    if (!active || !PHASES[next]) return;
    stageState(next);
    $('transfer-phase').textContent = PHASES[next][0];
    $('progress-text').textContent = description || PHASES[next][1];
    buttonState(next, next === 'verify' ? '正在校验…' : next === 'backup' ? '正在备份…' : next === 'activate' ? '正在启用…' : '正在写入…');
    if (next === 'verify' || next === 'activate') $('transfer-percent').textContent = '···';
  }
  function progress(pct, description, next) {
    if (!active) return;
    if (next && stage !== next) phase(next, description);
    if (description) $('progress-text').textContent = description;
    const value = Math.max(0, Math.min(99, pct));
    $('progress').value = value;
    panel.style.setProperty('--write-progress', `${value}%`);
    button?.style.setProperty('--write-progress', `${value}%`);
    if (stage !== 'verify' && stage !== 'activate') $('transfer-percent').textContent = `${Math.round(value)}%`;
    elapsed();
  }
  function start({ target: nextTarget, filename = '', buttonId = 'write', backup = false, kind = 'image' }) {
    if (timer) stop(timer);
    stopCelebration();
    restoreButton();
    button = $(buttonId); originalLabel = button.textContent;
    active = true; target = nextTarget; started = now();
    panel.hidden = false; panel.dataset.kind = kind;
    $('transfer-title').textContent = target;
    $('transfer-file').textContent = filename;
    $('transfer-dismiss').disabled = true;
    $('transfer-dismiss').hidden = true;
    $('transfer-details').hidden = true;
    $('transfer-details').open = false;
    $('transfer-timing').textContent = '';
    $('transfer-error').textContent = '';
    $('transfer-step-backup').hidden = !backup;
    $('transfer-steps').hidden = kind === 'activation';
    $('transfer-footnote').textContent = '请保持 USB 连接';
    phase(kind === 'activation' ? 'activate' : backup ? 'backup' : 'write');
    progress(0);
    timer = every(() => elapsed());
    if (dialog && !dialog.open) dialog.showModal();
    dialog?.focus();
  }
  function complete({ title, description = '数据已写入并通过校验', seconds, details = '', buttonLabel } = {}) {
    if (!active) return;
    active = false; if (timer) stop(timer); timer = null;
    stageState('success');
    $('transfer-title').textContent = title || `${target} · 写入完成`;
    $('transfer-phase').textContent = '已完成';
    $('progress-text').textContent = description;
    $('transfer-percent').textContent = '100%';
    $('progress').value = 100;
    panel.style.setProperty('--write-progress', '100%');
    $('transfer-footnote').textContent = '可以继续使用键盘了';
    $('transfer-dismiss').hidden = false; $('transfer-dismiss').disabled = false;
    $('transfer-timing').textContent = details;
    $('transfer-details').hidden = !details;
    buttonState('success', buttonLabel || (button.id === 'write' ? '再次写入 ↗' : '已完成'));
    elapsed(seconds);
    if (panel.dataset.kind !== "activation") stopCelebration = celebrate();
  }
  function fail(message) {
    if (!active) return;
    active = false; if (timer) stop(timer); timer = null;
    stageState('error');
    $('transfer-title').textContent = `${target} · 未完成`;
    $('transfer-phase').textContent = '需要处理';
    $('progress-text').textContent = '本次操作未完成';
    $('transfer-error').textContent = message;
    $('transfer-percent').textContent = '!';
    $('transfer-footnote').textContent = '请按提示处理后再操作';
    $('transfer-dismiss').hidden = false; $('transfer-dismiss').disabled = false;
    buttonState('error', originalLabel); elapsed();
  }
  function dismiss() {
    if (active) return false;
    stopCelebration();
    dialog?.close();
    panel.hidden = true; restoreButton(); button = null;
    return true;
  }
  $('transfer-dismiss').onclick = dismiss;
  dialog?.addEventListener('cancel', e => { e.preventDefault(); dismiss(); });
  if (typeof ResizeObserver !== 'undefined') {
    const dialog = $('screen-dialog'), heading = dialog?.querySelector('.modal-heading');
    if (heading) new ResizeObserver(() => {
      const height = heading.getBoundingClientRect().height;
      if (height) dialog.style.setProperty('--screen-heading-height', `${height}px`);
    }).observe(heading);
  }
  return { start, phase, progress, complete, fail, dismiss, get active() { return active; } };
}
