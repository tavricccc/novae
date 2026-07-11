import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

function collectHtmlInputs() {
  const inputs = {
    main: path.resolve(root, 'index.html')
  };

  const docsRoot = path.resolve(root, 'docs-site');
  if (!fs.existsSync(docsRoot)) return inputs;

  function walk(dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(abs, rel);
      else if (entry.isFile() && entry.name.endsWith('.html')) {
        const key = `docs-${rel.replace(/[\\/]/g, '-').replace(/\.html$/, '')}`;
        inputs[key] = abs;
      }
    }
  }
  walk(docsRoot);
  return inputs;
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function rmDir(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

export default defineConfig({
  base: './',
  publicDir: 'public',
  plugins: [
    {
      name: 'novae-docs-pages',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url?.split('?')[0] || '';
          if (!url.startsWith('/docs')) return next();
          let rel = url.replace(/^\/docs\/?/, '');
          if (!rel || rel.endsWith('/')) rel += 'index.html';
          if (!rel.endsWith('.html')) {
            const asIndex = path.join(root, 'docs-site', rel, 'index.html');
            if (fs.existsSync(asIndex)) {
              res.statusCode = 302;
              res.setHeader('Location', url.endsWith('/') ? `${url}` : `${url}/`);
              res.end();
              return;
            }
            rel = `${rel}.html`;
          }
          const file = path.join(root, 'docs-site', rel);
          if (fs.existsSync(file)) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(fs.readFileSync(file, 'utf8'));
            return;
          }
          next();
        });
      },
      closeBundle() {
        const dist = path.join(root, 'dist');
        const builtDocs = path.join(dist, 'docs-site');
        const target = path.join(dist, 'docs');
        if (!fs.existsSync(builtDocs)) return;

        rmDir(target);
        copyDir(builtDocs, target);
        rmDir(builtDocs);
      }
    }
  ],
  build: {
    rollupOptions: {
      input: collectHtmlInputs()
    }
  }
});
