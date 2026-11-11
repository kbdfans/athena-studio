export function hasLiveConnection(runtime) {
  return !!(runtime && !runtime.broken && runtime.device?.opened);
}

// Every workspace presents the same page-owned connection; opening a dialog
// must never create or replace an HID session.
export function renderConnectionControls(runtime, busy, root = document) {
  const connected = hasLiveConnection(runtime);
  const model = runtime?.profile?.name || 'Athena';
  for (const button of root.querySelectorAll('#connect, [data-modal-connect]')) {
    button.textContent = connected ? `已连接 · ${model}` : '连接键盘';
    button.classList.toggle('device-connected', connected);
    button.title = connected ? '键位、屏幕和检测共用此连接 · 点击管理' : '连接一次，即可使用全部功能';
    button.disabled = busy;
  }
  for (const el of root.querySelectorAll('[data-connected-only]')) el.hidden = !connected;
  for (const el of root.querySelectorAll('[data-disconnected-only]')) el.hidden = connected;
  root.getElementById('connection-title').textContent = connected ? `已连接 · ${model}` : '让键盘准备好。';
  root.getElementById('identify').disabled = busy || connected;
  root.getElementById('connection-disconnect').disabled = busy || !connected;
}
