import { recordDiagnostic } from './diagnostics.js';

export function setupInlineKeyboardTest({ tester, getDevice, getBusy }) {
  const toggle = document.getElementById('keyboard-test-switch');
  const surface = document.getElementById('tester-surface');
  const panel = document.getElementById('keyboard-tester');
  const background = document.querySelectorAll(
    'body > header, .site-credit, #demo-banner, .console-heading, .keymap-workspace .layer-bar, .key-inspector, #keymap-sync, .zmk-warning, .zmk-sync, #studio-main > footer'
  );
  let active = false;
  let previousDevice;

  function setActive(value) {
    if (value === active) return;
    active = value;
    if (value) {
      const device = getDevice();
      const workspace = toggle.closest('.keymap-workspace');
      const stage = workspace.querySelector('.keyboard-stage');
      const editorCase = stage.querySelector('.keyboard-case');
      surface.querySelector('.keyboard-case').style.cssText = editorCase.style.cssText;
      stage.append(surface, panel);
      if (device !== previousDevice) {
        document.getElementById('tester-input-mode').value = device && device.protocol !== 'zmk' ? 'matrix' : 'browser';
        previousDevice = device;
      }
      recordDiagnostic('view.tester');
    }
    document.body.classList.toggle('tester-open', value);
    toggle.setAttribute('aria-checked', String(value));
    surface.hidden = panel.hidden = !value;
    for (const element of background) {
      element.inert = value;
      element.classList.toggle('test-obscured', value);
    }
    tester.setVisible(value);
  }

  toggle.onclick = () => {
    if (!getBusy()) setActive(!active);
  };
  return {
    close: () => setActive(false),
    useWorkspace(id) {
      const toolbar = document.getElementById(id).querySelector('.keymap-toolbar');
      if (toggle.parentElement === toolbar) return;
      setActive(false);
      toolbar.append(toggle);
    },
  };
}
