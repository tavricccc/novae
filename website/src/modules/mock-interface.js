import { getCatalog, getLanguage } from './i18n.js';

const icon = (name, label = '') =>
  `<i class="ti ti-${name}" aria-hidden="true"></i>${label ? `<span class="sr-only">${label}</span>` : ''}`;

function ui(key) {
  const catalog = getCatalog(getLanguage());
  return catalog.demo?.ui?.[key] ?? key;
}

function issues() {
  return getCatalog(getLanguage()).demo?.issues ?? [];
}

function status(issue) {
  return `<span class="demo-status demo-status--${issue.status}">${issue.statusLabel}</span>`;
}

/** Mirrors VoteButtons compact: thumbs-up + total support count (not 0/1). */
function supportButton(issue) {
  return `<button class="demo-support${issue.supported ? ' is-supported' : ''}" type="button" aria-label="support" data-support-count="${issue.count}" data-supported="${issue.supported ? '1' : '0'}">${icon('thumb-up')}<b>${issue.count}</b></button>`;
}

function remainingLabel(issue) {
  if (issue.days) {
    return `<small>${ui('daysLeft').replace('{n}', String(issue.days))}</small>`;
  }
  return `<small>${ui('goalReached')}</small>`;
}

function desktopRow(issue) {
  const progress = Math.min(100, Math.round((issue.count / issue.goal) * 100));
  return `<div class="novae-table-row" role="row">
    <div role="cell">${status(issue)}</div>
    <div class="novae-author" role="cell"><span class="novae-avatar">${issue.avatar}</span><small>${issue.author}</small></div>
    <strong class="novae-title" role="cell">${issue.title}</strong>
    <time role="cell">${issue.time}</time>
    <div class="novae-progress" role="cell"><div><span>${issue.count} / ${issue.goal}</span>${remainingLabel(issue)}</div><i><b style="width:${progress}%"></b></i></div>
    <div class="novae-actions" role="cell">${supportButton(issue)}<button type="button" aria-label="comments">${icon('message')}</button></div>
    <div role="cell"><button class="novae-more" type="button" aria-label="more">${icon('dots')}</button></div>
  </div>`;
}

function mobileRow(issue) {
  return `<article class="novae-mobile-row">
    <div class="novae-mobile-primary">${status(issue)}<span class="novae-avatar">${issue.avatar}</span><strong>${issue.title}</strong></div>
    <div class="novae-mobile-secondary"><time>${issue.time}</time><span class="novae-count">${issue.count}/${issue.goal} ${ui('support')}</span><span class="novae-mobile-actions"><button type="button" aria-label="comments">${icon('message')}</button>${supportButton(issue)}<button type="button" aria-label="more">${icon('dots')}</button></span></div>
  </article>`;
}

function controls(includeAdd = true) {
  const add = includeAdd
    ? `<button class="novae-add" type="button" aria-label="add">${icon('plus')}</button>`
    : '';
  return `<div class="novae-controls">
    <div class="novae-segmented"><button class="is-active" type="button">${icon('list-details')}<span>${ui('active')}</span></button><button type="button">${icon('archive')}<span>${ui('closed')}</span></button></div>
    <button type="button" aria-label="sort">${icon('sort-descending')}</button>
    <button type="button" aria-label="search">${icon('search')}</button>
    ${add}
  </div>`;
}

function desktopDemo() {
  return `<section class="novae-demo novae-demo--desktop" aria-label="Novae desktop">
    <header class="novae-demo-header"><img src="./logo.svg" alt="Novae"/><nav><a class="is-active">${ui('proposals')}</a><a>${ui('announcements')}</a><a>${ui('myProposals')}</a></nav><div><button type="button" aria-label="notifications">${icon('bell')}</button><span class="novae-avatar novae-user-avatar">N</span></div></header>
    <main class="novae-demo-main">
      <div class="novae-demo-toolbar"><div><h3>${ui('proposals')}</h3><button class="novae-category" type="button">${ui('publicIssues')}${icon('chevron-down')}</button></div>${controls(true)}</div>
      <div class="novae-table" role="table" aria-label="issues">
        <div class="novae-table-head" role="row">
          <span role="columnheader">${ui('status')}</span>
          <span role="columnheader">${ui('author')}</span>
          <span role="columnheader">${ui('title')}</span>
          <span role="columnheader">${ui('time')}</span>
          <span role="columnheader">${ui('progress')}</span>
          <span role="columnheader">${ui('actions')}</span>
          <span role="columnheader">${ui('admin')}</span>
        </div>
        ${issues().map(desktopRow).join('')}
      </div>
    </main>
  </section>`;
}

function mobileDemo() {
  return `<section class="novae-demo novae-demo--mobile" aria-label="Novae mobile">
    <div class="novae-mobile-header"><strong>${ui('proposals')}</strong></div>
    <main class="novae-mobile-main">
      <div class="novae-mobile-tools"><button class="novae-category" type="button">${ui('publicIssues')}${icon('chevron-down')}</button>${controls(false)}</div>
      <div class="novae-mobile-list">${issues().map(mobileRow).join('')}</div>
    </main>
    <nav class="novae-bottom-nav" aria-label="mobile nav">
      <button class="is-active" type="button">${icon('message')}<small>${ui('proposals')}</small></button>
      <button type="button">${icon('speakerphone')}<small>${ui('news')}</small></button>
      <button class="novae-nav-add" type="button" aria-label="add">${icon('plus')}</button>
      <button type="button">${icon('bell')}<small>${ui('alerts')}</small></button>
      <button type="button"><span class="novae-avatar">N</span><small>${ui('mine')}</small></button>
    </nav>
  </section>`;
}

function bindInteractions(root) {
  root.querySelectorAll('.novae-segmented button').forEach((button) => {
    button.addEventListener('click', () => {
      button.parentElement.querySelectorAll('button').forEach((item) => {
        item.classList.toggle('is-active', item === button);
      });
    });
  });

  root.querySelectorAll('.demo-support').forEach((button) => {
    button.addEventListener('click', () => {
      const wasSupported = button.classList.contains('is-supported');
      let count = Number(button.dataset.supportCount || '0');
      if (wasSupported) {
        count = Math.max(0, count - 1);
        button.classList.remove('is-supported');
        button.dataset.supported = '0';
      } else {
        count += 1;
        button.classList.add('is-supported');
        button.dataset.supported = '1';
      }
      button.dataset.supportCount = String(count);
      button.querySelector('b').textContent = String(count);
    });
  });
}

/**
 * Fit a full-size product surface into its marketing frame with uniform scale.
 * Keeps typography / spacing proportions instead of re-speccing tiny fonts.
 */
function fitDemoScale(root, selector, designWidth, options = {}) {
  const demo = root.querySelector(selector);
  if (!demo || !root.isConnected) return;

  const pad = options.pad ?? 0.96;
  const setHeight = options.setHeight !== false;

  demo.style.width = designWidth + 'px';
  demo.style.transformOrigin = 'top left';
  demo.style.transform = 'scale(1)';
  if (selector.includes('mobile')) {
    demo.style.height = (options.designHeight || 720) + 'px';
  }

  const available = root.clientWidth;
  if (available <= 0) return;

  const scale = Math.min(1, (available / designWidth) * pad);
  demo.style.transform = 'scale(' + scale + ')';

  if (setHeight) {
    const natural = selector.includes('mobile')
      ? options.designHeight || 720
      : demo.scrollHeight;
    root.style.height = Math.ceil(natural * scale) + 'px';
  } else {
    const frameH = root.clientHeight;
    if (frameH > 0) {
      demo.style.height = Math.ceil(frameH / scale) + 'px';
    }
  }
}

function scheduleFit(root) {
  requestAnimationFrame(function () {
    const variant = root.dataset.novaeDemo;
    if (variant === 'mobile') {
      fitDemoScale(root, '.novae-demo--mobile', 360, {
        pad: 0.98,
        setHeight: false,
        designHeight: 720
      });
    } else {
      fitDemoScale(root, '.novae-demo--desktop', 1120, { pad: 0.96, setHeight: true });
    }
  });
}

function paintDemos(roots) {
  roots.forEach((root) => {
    const variant = root.dataset.novaeDemo;
    root.innerHTML = variant === 'mobile' ? mobileDemo() : desktopDemo();
    bindInteractions(root);
    scheduleFit(root);
  });
}

export function initializeInterfaceDemos() {
  const roots = [...document.querySelectorAll('[data-novae-demo]')];
  if (!roots.length) return;

  paintDemos(roots);

  document.addEventListener('novae:language', () => {
    paintDemos(roots);
  });

  if (typeof ResizeObserver === 'undefined') return;

  const observer = new ResizeObserver(function () {
    roots.forEach(scheduleFit);
  });
  roots.forEach(function (root) {
    observer.observe(root);
  });
  window.addEventListener(
    'resize',
    function () {
      roots.forEach(scheduleFit);
    },
    { passive: true }
  );
}
