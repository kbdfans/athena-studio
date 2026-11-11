(() => {
  const storageKey = 'kbd-studio-theme';
  const root = document.documentElement;
  function preference() {
    try {
      const value = localStorage.getItem(storageKey);
      return value === 'dark' || value === 'light' ? value : null;
    } catch {
      return null;
    }
  }
  function apply(theme) {
    root.dataset.theme = theme;
    for (const button of document.querySelectorAll('[data-theme-toggle]')) {
      button.setAttribute('aria-pressed', String(theme === 'dark'));
    }
  }
  function sync() {
    apply(preference() ?? 'dark');
  }
  sync();
  document.addEventListener('pointerdown', () => root.removeAttribute('data-keyboard-navigation'), true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Tab') root.setAttribute('data-keyboard-navigation', '');
  }, true);
  document.addEventListener('DOMContentLoaded', sync, {once: true});
  document.addEventListener('click', event => {
    if (!event.target.closest?.('[data-theme-toggle]')) return;
    const theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(storageKey, theme); } catch {}
    apply(theme);
  });
  window.addEventListener('storage', event => { if (event.key === storageKey) sync(); });
})();
