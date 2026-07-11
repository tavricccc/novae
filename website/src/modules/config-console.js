export function initializeConfigConsole() {
  document.querySelectorAll('[data-config-console]').forEach((root) => {
    if (root.dataset.configBound === '1') {
      // Tabs may have been rebuilt; rewire without stacking listeners.
      root.dataset.configBound = '0';
    }

    const onClick = (event) => {
      const tab = event.target.closest('[data-config-tab]');
      if (!tab || !root.contains(tab)) return;
      const key = tab.dataset.configTab;
      const tabs = [...root.querySelectorAll('[data-config-tab]')];
      const codes = [...root.querySelectorAll('[data-config-code]')];
      const results = [...root.querySelectorAll('[data-config-result]')];
      tabs.forEach((node) => {
        const on = node.dataset.configTab === key;
        node.classList.toggle('active', on);
        node.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      codes.forEach((block) => {
        block.hidden = block.dataset.configCode !== key;
      });
      results.forEach((block) => {
        block.hidden = block.dataset.configResult !== key;
      });
    };

    if (root._configClick) {
      root.removeEventListener('click', root._configClick);
    }
    root._configClick = onClick;
    root.addEventListener('click', onClick);
    root.dataset.configBound = '1';
  });
}
