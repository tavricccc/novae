const SELECTOR = [
  '.section-heading',
  '.capability-card',
  '.feature-card',
  '.timeline li',
  '.status-strip > div',
  '.config-copy',
  '.config-console',
  '.access-grid article',
  '.knob-table-wrap',
  '.hero-interface',
  '.reference-desktop',
  '.reference-mobile',
  '.roles-grid article',
  '.more-features article',
  '.pwa-grid article',
  '.architecture-map',
  '.trust-map .arch-node',
  '.security-note',
  '.fit-grid article'
].join(',');

function isInViewport(node) {
  const rect = node.getBoundingClientRect();
  // Slightly generous so near-fold content does not start hidden.
  return rect.top < window.innerHeight * 0.92 && rect.bottom > 0;
}

/**
 * Scroll-in animation without the common FOUC:
 * never force opacity:0 on content already on screen (that flashes white/empty).
 */
export function initializeReveal() {
  const targets = [...document.querySelectorAll(SELECTOR)];
  if (!targets.length) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('reveal-visible');
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.08, rootMargin: '0px 0px -4% 0px' }
  );

  // Wait one frame so layout (and list render) is stable before measuring.
  requestAnimationFrame(() => {
    targets.forEach((node) => {
      if (isInViewport(node)) {
        // Keep as-is — already painted by the browser.
        return;
      }
      node.classList.add('reveal');
      observer.observe(node);
    });
  });
}

/** Observe newly injected nodes (e.g. after language switch) without flash. */
export function revealNewContent(root = document) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const targets = [...root.querySelectorAll(SELECTOR)].filter(
    (node) => !node.classList.contains('reveal') && !node.classList.contains('reveal-visible')
  );
  if (!targets.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('reveal-visible');
        observer.unobserve(entry.target);
      });
    },
    { threshold: 0.08 }
  );

  requestAnimationFrame(() => {
    targets.forEach((node) => {
      if (isInViewport(node)) return;
      node.classList.add('reveal');
      observer.observe(node);
    });
  });
}
