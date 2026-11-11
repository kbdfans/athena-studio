import test from 'node:test';
import assert from 'node:assert/strict';
import { setupWorkspaceModals } from '../src/workspace-modals.js';

test('workspace dialogs replace one another, move notices, and guard busy/tester dismissal', () => {
  const saved = globalThis.document;
  const home = { append(node) { node.parentElement = this; } };
  const notice = { parentElement: home };
  function dialog() {
    const events = {}, closeButton = {}, notices = { append: home.append };
    return { open: false, events, closeButton, notices,
      querySelector: s => s === '[data-workspace-close]' ? closeButton : notices,
      addEventListener: (name, fn) => events[name] = fn,
      showModal() { this.open = true; }, close() { this.open = false; this.events.close(); },
      getBoundingClientRect: () => ({ left: 10, right: 100, top: 10, bottom: 100 }),
    };
  }
  const screen = dialog(), tester = dialog();
  let busy = false, closes = 0, locked = false;
  globalThis.document = { getElementById: id => ({'screen-dialog': screen, 'tester-dialog': tester, notice})[id], body: { classList: { toggle: (_,value) => locked = value } } };
  try {
    const modals = setupWorkspaceModals({ getBusy: () => busy, onClose() { closes++; modals.show('keymap'); } });
    modals.show('screen'); assert.equal(screen.open, true); assert.equal(notice.parentElement, screen.notices); assert.equal(locked,true);
    busy = true; screen.closeButton.onclick(); assert.equal(closes,0);
    busy = false; modals.show('test'); assert.equal(screen.open,false); assert.equal(tester.open,true); assert.equal(closes,0);
    let prevented = false; tester.events.cancel({preventDefault(){prevented=true;}}); assert.equal(prevented,true); assert.equal(tester.open,true);
    tester.events.click({ target:tester, clientX:50, clientY:50 }); assert.equal(closes,0);
    tester.closeButton.onclick(); assert.equal(closes,1); assert.equal(tester.open,false); assert.equal(notice.parentElement,home); assert.equal(locked,false);
    modals.show('screen'); screen.events.cancel({preventDefault(){}}); assert.equal(closes,2); assert.equal(screen.open,false);
  } finally { globalThis.document = saved; }
});
