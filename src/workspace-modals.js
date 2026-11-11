export function setupWorkspaceModals({ getBusy, onClose }) {
  const dialogs = { screen: document.getElementById('screen-dialog'), test: document.getElementById('tester-dialog') };
  const notice = document.getElementById('notice');
  const noticeHome = notice.parentElement;
  let active = null;
  for (const [page, dialog] of Object.entries(dialogs)) {
    dialog.querySelector('[data-workspace-close]').onclick = () => { if (!getBusy()) onClose(); };
    dialog.addEventListener('cancel', event => {
      // Esc is a testable key in the tester; the close button remains accessible.
      event.preventDefault();
      if (page !== 'test' && !getBusy()) onClose();
    });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog || getBusy()) return;
      const r = dialog.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) onClose();
    });
    dialog.addEventListener('close', () => {
      if (active === page && !dialog.open) onClose();
    });
  }
  return {
    show(page) {
      active = dialogs[page] ? page : null;
      for (const [name, dialog] of Object.entries(dialogs)) {
        if (name !== active && dialog.open) dialog.close();
      }
      const dialog = dialogs[active];
      (dialog ? dialog.querySelector('.modal-notices') : noticeHome).append(notice);
      document.body.classList.toggle('workspace-modal-open', !!dialog);
      if (dialog && !dialog.open) dialog.showModal();
    },
  };
}
