export function setupWorkspaceModals({ getBusy, onClose }) {
  const dialog = document.getElementById('screen-dialog');
  const notice = document.getElementById('notice');
  const noticeHome = notice.parentElement;
  const modalNotices = dialog.querySelector('.modal-notices');
  let active = false;

  dialog.querySelector('[data-workspace-close]').onclick = () => { if (!getBusy()) onClose(); };
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (!getBusy()) onClose();
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog || getBusy()) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
  });
  dialog.addEventListener('close', () => {
    if (active && !dialog.open) onClose();
  });

  return {
    show(page) {
      active = page === 'screen';
      if (!active && dialog.open) dialog.close();
      (active ? modalNotices : noticeHome).append(notice);
      document.body.classList.toggle('workspace-modal-open', active);
      if (active && !dialog.open) dialog.showModal();
    },
  };
}
