import zh from '../../content/landing/zh.json';
import en from '../../content/landing/en.json';

const LANGUAGE_KEY = 'novae-site-language';
const catalogs = { zh, en };

/** @type {'zh' | 'en'} */
let currentLanguage = 'zh';

export function preferredLanguage() {
  const stored = localStorage.getItem(LANGUAGE_KEY);
  if (stored === 'zh' || stored === 'en') return stored;
  return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function getLanguage() {
  return currentLanguage;
}

export function getCatalog(language = currentLanguage) {
  return catalogs[language] || catalogs.zh;
}

/** Resolve dotted path like `hero.title` or `demo.ui.proposals`. */
export function t(path, language = currentLanguage) {
  const parts = String(path).split('.');
  let node = getCatalog(language);
  for (const part of parts) {
    if (node == null || typeof node !== 'object') return '';
    node = node[part];
  }
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return '';
}

function applyTextNodes(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((node) => {
    const value = t(node.dataset.i18n);
    if (value === '' && !node.dataset.i18nAllowEmpty) return;
    node.innerHTML = value;
  });
}

function applyAttrs(root = document) {
  root.querySelectorAll('[data-i18n-href]').forEach((node) => {
    const value = t(node.dataset.i18nHref);
    if (value) node.setAttribute('href', value);
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((node) => {
    const value = t(node.dataset.i18nAria);
    if (value) node.setAttribute('aria-label', value);
  });
  root.querySelectorAll('[data-i18n-content]').forEach((node) => {
    const value = t(node.dataset.i18nContent);
    if (value) node.setAttribute('content', value);
  });
}

export function applyI18n(root = document) {
  applyTextNodes(root);
  applyAttrs(root);
}

export function setLanguage(language, options = {}) {
  const next = language === 'en' ? 'en' : 'zh';
  const prev = currentLanguage;
  currentLanguage = next;
  document.documentElement.lang = next === 'zh' ? 'zh-Hant' : 'en';
  document.title = t('meta.title');
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute('content', t('meta.description'));
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle) ogTitle.setAttribute('content', t('meta.title'));
  const ogDesc = document.querySelector('meta[property="og:description"]');
  if (ogDesc) ogDesc.setAttribute('content', t('meta.description'));
  localStorage.setItem(LANGUAGE_KEY, next);

  // Suppress transition flicker while swapping many nodes at once.
  const switching = prev !== next && options.skipDom !== true;
  if (switching) {
    document.documentElement.classList.add('is-i18n-switching');
  }

  if (options.skipDom !== true) {
    applyI18n(document);
  }

  const toggle = document.querySelector('.language-toggle');
  if (toggle) {
    toggle.textContent = next === 'zh' ? 'EN' : '中';
    toggle.setAttribute(
      'aria-label',
      next === 'zh' ? 'Switch to English' : '切換為繁體中文'
    );
  }

  document.dispatchEvent(
    new CustomEvent('novae:language', { detail: { language: next } })
  );

  if (switching) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.classList.remove('is-i18n-switching');
      });
    });
  }
}

export function initializeLanguage() {
  const toggle = document.querySelector('.language-toggle');
  currentLanguage = preferredLanguage();
  if (toggle) {
    toggle.addEventListener('click', () => {
      setLanguage(currentLanguage === 'zh' ? 'en' : 'zh');
    });
  }
  setLanguage(currentLanguage);
}
