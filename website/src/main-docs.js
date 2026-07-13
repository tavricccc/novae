import './styles/index.css';
import './styles/docs.css';

// Docs pages intentionally do NOT register the service worker.
// Nested URLs under /docs/ would resolve PWA assets/manifest relative to
// that path (e.g. /novae-site/docs/manifest.webmanifest → 404).

async function initMermaid() {
  const nodes = document.querySelectorAll('pre.mermaid');
  if (!nodes.length) return;
  try {
    const mermaid = (await import('mermaid')).default;
    mermaid.initialize({
      startOnLoad: false,
      theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'neutral',
      securityLevel: 'strict'
    });
    await mermaid.run({ nodes: [...nodes] });
  } catch (error) {
    console.warn('Mermaid failed to load', error);
  }
}

function initializeDocumentNavigation() {
  const jump = document.querySelector('[data-docs-jump]');
  jump?.addEventListener('change', () => {
    if (jump.value) window.location.assign(jump.value);
  });

  const currentDocument = document.querySelector('.docs-sidebar [aria-current="page"]');
  currentDocument?.scrollIntoView({ block: 'center' });

  const links = [...document.querySelectorAll('.docs-toc-link')];
  if (!links.length) return;
  const headings = links
    .map((link) => document.getElementById(decodeURIComponent(link.hash.slice(1))))
    .filter(Boolean);
  const linkById = new Map(links.map((link) => [decodeURIComponent(link.hash.slice(1)), link]));

  const markCurrent = (id) => {
    links.forEach((link) => link.classList.toggle('is-active', link === linkById.get(id)));
  };

  const observer = new IntersectionObserver((entries) => {
    const visible = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible[0]) markCurrent(visible[0].target.id);
  }, { rootMargin: '-88px 0px -70% 0px' });

  headings.forEach((heading) => observer.observe(heading));
  markCurrent(headings[0]?.id);
}

initializeDocumentNavigation();
initMermaid();
