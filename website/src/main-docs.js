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

initMermaid();
