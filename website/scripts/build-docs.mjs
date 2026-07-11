/**
 * Build static docs HTML pages from content/docs markdown sources.
 * Output: docs-site/ (consumed as Vite multi-page inputs)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';
import markdownItAnchor from 'markdown-it-anchor';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const contentDir = path.join(root, 'content', 'docs');
const outDir = path.join(root, 'docs-site');

const DOC_ORDER = [
  'README',
  'project-overview',
  'quick-start',
  'user-guide',
  'architecture',
  'configuration',
  'deployment-guide',
  'operations',
  'troubleshooting',
  'security',
  'costs',
  'contributing'
];

const NAV_ZH = [
  { id: 'README', title: '文件首頁', file: 'index.html' },
  { id: 'project-overview', title: '專案總覽', file: 'project-overview.html' },
  { id: 'quick-start', title: '快速開始', file: 'quick-start.html' },
  { id: 'user-guide', title: '使用手冊', file: 'user-guide.html' },
  { id: 'architecture', title: '系統架構', file: 'architecture.html' },
  { id: 'configuration', title: '設定參考', file: 'configuration.html' },
  { id: 'deployment-guide', title: '部署指南', file: 'deployment-guide.html' },
  { id: 'operations', title: '維運手冊', file: 'operations.html' },
  { id: 'troubleshooting', title: '故障排除', file: 'troubleshooting.html' },
  { id: 'security', title: '安全模型', file: 'security.html' },
  { id: 'costs', title: '成本指南', file: 'costs.html' },
  { id: 'contributing', title: '貢獻指南', file: 'contributing.html' }
];

const NAV_EN = [
  { id: 'README', title: 'Docs home', file: 'index.html' },
  { id: 'project-overview', title: 'Project overview', file: 'project-overview.html' },
  { id: 'quick-start', title: 'Quick start', file: 'quick-start.html' },
  { id: 'user-guide', title: 'User guide', file: 'user-guide.html' },
  { id: 'architecture', title: 'Architecture', file: 'architecture.html' },
  { id: 'configuration', title: 'Configuration', file: 'configuration.html' },
  { id: 'deployment-guide', title: 'Deployment', file: 'deployment-guide.html' },
  { id: 'operations', title: 'Operations', file: 'operations.html' },
  { id: 'troubleshooting', title: 'Troubleshooting', file: 'troubleshooting.html' },
  { id: 'security', title: 'Security', file: 'security.html' },
  { id: 'costs', title: 'Costs', file: 'costs.html' },
  { id: 'contributing', title: 'Contributing', file: 'contributing.html' }
];

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
}).use(markdownItAnchor, {
  slugify: (s) =>
    String(s)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w一-鿿-]/g, '')
});

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function listMarkdownFiles(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = path.posix.join(base, entry.name);
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listMarkdownFiles(abs, rel));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(rel);
    }
  }
  return files;
}

function rewriteMarkdownLinks(html, { lang }) {
  // foo.md / ./foo.md / ../structure.md / en/foo.md → html counterparts
  return html.replace(
    /href="([^"]+\.md)(#[^"]*)?"/g,
    (full, href, hash = '') => {
      let next = href;
      // strip leading ./
      next = next.replace(/^\.\//, '');

      // Language switcher patterns from original docs
      if (next.startsWith('en/')) {
        next = next.replace(/^en\//, '');
        next = next.replace(/\.md$/, '.html');
        if (next === 'README.html') next = 'index.html';
        return `href="../en/${next}${hash || ''}"`;
      }
      if (next.startsWith('../en/')) {
        next = next.replace(/^\.\.\/en\//, '');
        next = next.replace(/\.md$/, '.html');
        if (next === 'README.html') next = 'index.html';
        return `href="../en/${next}${hash || ''}"`;
      }
      if (next.startsWith('../') && lang === 'en') {
        // e.g. ../project-overview.md or ../README.md from en/
        next = next.replace(/^\.\.\//, '');
        next = next.replace(/\.md$/, '.html');
        if (next === 'README.html') next = 'index.html';
        // structure.md lives only in main repo — link to GitHub
        if (next === 'structure.html') {
          return `href="https://github.com/tavricccc/novae/blob/main/structure.md${hash || ''}"`;
        }
        return `href="../${next}${hash || ''}"`;
      }
      if (next === 'README.md' || next.endsWith('/README.md')) {
        const target = lang === 'en' ? '../index.html' : 'index.html';
        // from en page linking to root README
        if (lang === 'en' && !href.startsWith('en')) {
          return `href="../index.html${hash || ''}"`;
        }
        return `href="${lang === 'en' ? 'index.html' : 'index.html'}${hash || ''}"`;
      }

      next = next.replace(/\.md$/, '.html');
      if (next === 'README.html') next = 'index.html';
      if (next === 'structure.html' || next.endsWith('/structure.html')) {
        return `href="https://github.com/tavricccc/novae/blob/main/structure.md${hash || ''}"`;
      }
      return `href="${next}${hash || ''}"`;
    }
  );
}

function stripTopLanguageSwitcher(html) {
  // Remove the first paragraph if it only contains language / home links (we provide chrome).
  return html.replace(
    /^<p>(?:<a[^>]*>.*?<\/a>\s*[·•|]\s*)+<a[^>]*>.*?<\/a><\/p>\s*/i,
    ''
  );
}

function pageNameFromRel(rel) {
  const base = rel.replace(/\\/g, '/');
  if (base === 'README.md') return { lang: 'zh', out: 'index.html', id: 'README' };
  if (base === 'en/README.md') return { lang: 'en', out: path.posix.join('en', 'index.html'), id: 'README' };
  const m = base.match(/^(en\/)?(.+)\.md$/);
  if (!m) return null;
  const lang = m[1] ? 'en' : 'zh';
  const id = m[2];
  const out = lang === 'en' ? path.posix.join('en', `${id}.html`) : `${id}.html`;
  return { lang, out, id };
}

function sibling(lang, id) {
  const nav = lang === 'en' ? NAV_EN : NAV_ZH;
  const idx = nav.findIndex((item) => item.id === id);
  if (idx < 0) return { prev: null, next: null };
  return {
    prev: idx > 0 ? nav[idx - 1] : null,
    next: idx < nav.length - 1 ? nav[idx + 1] : null
  };
}

function languageAlternate(lang, id) {
  if (id === 'README') {
    return lang === 'zh' ? './en/' : '../';
  }
  return lang === 'zh' ? `./en/${id}.html` : `../${id}.html`;
}

function renderShell({ lang, id, title, bodyHtml, outRel }) {
  const nav = lang === 'en' ? NAV_EN : NAV_ZH;
  const { prev, next } = sibling(lang, id);
  const homeHref = lang === 'en' ? '../..' : '..';
  // docs-site is served as /docs/ so assets go up one more for en
  const depth = outRel.includes('/') ? 2 : 1;
  const assetPrefix = '../'.repeat(depth);
  const altLangHref = languageAlternate(lang, id);
  const isEn = lang === 'en';

  const sidebar = nav
    .map((item) => {
      const href = item.file;
      const active = item.id === id ? ' is-active' : '';
      return `<a class="docs-nav-link${active}" href="${href}">${item.title}</a>`;
    })
    .join('');

  const prevNext = `
    <nav class="docs-pager">
      ${
        prev
          ? `<a class="docs-pager-link" href="${prev.file}"><span>${isEn ? 'Previous' : '上一篇'}</span><strong>${prev.title}</strong></a>`
          : '<span></span>'
      }
      ${
        next
          ? `<a class="docs-pager-link docs-pager-link--next" href="${next.file}"><span>${isEn ? 'Next' : '下一篇'}</span><strong>${next.title}</strong></a>`
          : '<span></span>'
      }
    </nav>`;

  const pageTitle = title
    ? `${title} · Novae Docs`
    : isEn
      ? 'Novae documentation'
      : 'Novae 文件';

  return `<!doctype html>
<html lang="${isEn ? 'en' : 'zh-Hant'}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#ffffff" />
    <title>${escapeAttr(pageTitle)}</title>
    <style>
      html{background:#fff;color:#171715}
      @media(prefers-color-scheme:dark){html{background:#0c0c0a;color:#f7f7f5}}
      body{margin:0;min-height:100vh}
      @view-transition{navigation:auto}
      ::view-transition-old(root),
      ::view-transition-new(root){animation-duration:.16s;animation-timing-function:ease}
      @media(prefers-reduced-motion:reduce){@view-transition{navigation:none}}
    </style>
    <script type="module" src="${assetPrefix}src/main-docs.js"></script>
  </head>
  <body class="docs-body">
    <a class="skip-link" href="#docs-main">${isEn ? 'Skip to content' : '跳到主要內容'}</a>
    <header class="site-header">
      <a class="brand" href="${assetPrefix}" aria-label="Novae">
        <span class="brand-mark" aria-hidden="true"><img src="${assetPrefix}logo.svg" alt="" /></span>
        <span><strong>Novae</strong><small>Novae</small></span>
      </a>
      <nav aria-label="primary">
        <a href="${assetPrefix}">${isEn ? 'Home' : '首頁'}</a>
        <a class="is-active" href="${isEn ? './' : './'}">${isEn ? 'Docs' : '文件'}</a>
      </nav>
      <div class="header-actions">
        <a class="language-toggle" href="${altLangHref}" aria-label="${isEn ? 'Switch to Chinese' : 'Switch to English'}">${isEn ? '中' : 'EN'}</a>
        <a class="button button-small button-dark" href="https://github.com/tavricccc/novae" target="_blank" rel="noreferrer">GitHub</a>
      </div>
    </header>
    <div class="docs-layout">
      <aside class="docs-sidebar" aria-label="docs">
        <p class="docs-sidebar-label">${isEn ? 'Documentation' : '文件目錄'}</p>
        ${sidebar}
      </aside>
      <main id="docs-main" class="docs-main">
        <article class="docs-prose">
          ${bodyHtml}
        </article>
        ${prevNext}
      </main>
    </div>
    <footer class="site-footer">
      <a class="brand" href="${assetPrefix}" aria-label="Novae">
        <span class="brand-mark" aria-hidden="true"><img src="${assetPrefix}logo.svg" alt="" /></span>
        <span><strong>Novae</strong><small>Novae</small></span>
      </a>
      <p>${isEn ? 'Open source for transparent campus participation.' : '為更透明、可追蹤的校園參與而開源。'}</p>
      <div>
        <a href="${assetPrefix}">${isEn ? 'Home' : '首頁'}</a>
        <a href="https://github.com/tavricccc/novae" target="_blank" rel="noreferrer">GitHub</a>
        <a href="https://github.com/tavricccc/novae/blob/main/LICENSE" target="_blank" rel="noreferrer">MIT License</a>
      </div>
    </footer>
  </body>
</html>
`;
}

function escapeAttr(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');
}

function extractTitle(markdown, html) {
  const m = markdown.match(/^#\s+(.+)$/m);
  if (m) return m[1].replace(/<[^>]+>/g, '').trim();
  const h = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
  if (h) return h[1].replace(/<[^>]+>/g, '').trim();
  return '';
}

function enhanceMermaid(html) {
  // Convert ```mermaid fences that markdown-it rendered as code.lang-mermaid
  return html.replace(
    /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g,
    (_, code) => {
      const decoded = code
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&amp;', '&');
      return `<pre class="mermaid">${decoded}</pre>`;
    }
  );
}

function build() {
  rmDir(outDir);
  ensureDir(outDir);
  ensureDir(path.join(outDir, 'en'));

  // English has no README.md — generate index from a short stub pointing at zh home table content via nav
  const files = listMarkdownFiles(contentDir);
  let count = 0;

  for (const rel of files) {
    const meta = pageNameFromRel(rel);
    if (!meta) continue;
    const abs = path.join(contentDir, rel);
    let source = fs.readFileSync(abs, 'utf8');

    // Drop the first language-switcher line(s) that look like markdown links to the other language
    source = source.replace(
      /^(\[[^\]]+\]\([^)]+\)\s*[·•|]\s*)+\[[^\]]+\]\([^)]+\)\s*\n+/m,
      ''
    );

    let body = md.render(source);
    body = rewriteMarkdownLinks(body, { lang: meta.lang });
    body = stripTopLanguageSwitcher(body);
    body = enhanceMermaid(body);
    const title = extractTitle(source, body);
    const html = renderShell({
      lang: meta.lang,
      id: meta.id,
      title,
      bodyHtml: body,
      outRel: meta.out
    });
    const outPath = path.join(outDir, meta.out);
    ensureDir(path.dirname(outPath));
    fs.writeFileSync(outPath, html, 'utf8');
    count += 1;
  }

  // English docs index (no en/README in source) — build from NAV_EN
  const enIndexPath = path.join(outDir, 'en', 'index.html');
  if (!fs.existsSync(enIndexPath)) {
    const list = NAV_EN.filter((item) => item.id !== 'README')
      .map((item) => `<li><a href="${item.file}">${item.title}</a></li>`)
      .join('');
    const body = `<h1>Novae documentation</h1>
<p>Start with the <a href="quick-start.html">quick start</a>. Before a production launch, follow the <a href="configuration.html">configuration reference</a> and <a href="deployment-guide.html">deployment guide</a>.</p>
<ul>${list}</ul>`;
    fs.writeFileSync(
      enIndexPath,
      renderShell({
        lang: 'en',
        id: 'README',
        title: 'Documentation',
        bodyHtml: body,
        outRel: 'en/index.html'
      }),
      'utf8'
    );
    count += 1;
  }

  console.log(`Built ${count} docs pages → docs-site/`);
}

build();
