import './styles/index.css';
import { initializeLanguage } from './modules/i18n.js';
import { initializeLandingRender } from './modules/landing-render.js';
import { initializeReveal } from './modules/reveal.js';
import { initializeInterfaceDemos } from './modules/mock-interface.js';

// Language first so list render + demos read the preferred locale.
initializeLanguage();
initializeLandingRender();
initializeInterfaceDemos();
initializeReveal();

// Reveal body after first paint of preferred language (see index.html boot script).
requestAnimationFrame(() => {
  document.documentElement.classList.add('is-ready');
  document.documentElement.classList.remove('lang-boot-hide');
});
