# Novae Introduction Site

Bilingual product site + full documentation for [Novae](https://github.com/tavricccc/novae). Built with Vite for GitHub Pages.

Top nav is shared on landing and docs: **Home / Docs** only (plus language + GitHub).

## Where to edit content

| What you want to change | Edit this |
|-------------------------|-----------|
| Landing copy (Chinese) | [`content/landing/zh.json`](content/landing/zh.json) |
| Landing copy (English) | [`content/landing/en.json`](content/landing/en.json) |
| Docs body (Chinese) | [`content/docs/*.md`](content/docs) — e.g. `user-guide.md` |
| Docs body (English) | [`content/docs/en/*.md`](content/docs/en) |
| Docs sidebar titles / order | [`scripts/build-docs.mjs`](scripts/build-docs.mjs) → `NAV_ZH` / `NAV_EN` / `DOC_ORDER` |
| Landing section structure only | [`index.html`](index.html) — prefer JSON for text |
| Shared chrome / marketing styles | [`src/styles/site.css`](src/styles/site.css) |
| Docs prose / sidebar styles | [`src/styles/docs.css`](src/styles/docs.css) |

**Typical edits**

- Change a hero sentence → `content/landing/zh.json` → `hero.lede` (mirror key in `en.json`)
- Add a feature card → append to `features.cards` in **both** locale JSON files
- Fix a docs paragraph → matching `.md` under `content/docs/` or `content/docs/en/`
- Rename a page in the left docs nav → `NAV_ZH` / `NAV_EN` in `scripts/build-docs.mjs`

There is **no auto-sync** with the main `novae` repository docs. This site owns its own `content/docs` copy.

## Scripts

```bash
npm ci
npm run dev        # build docs HTML, then Vite dev server
npm run build      # production build → dist/
npm run preview    # preview dist/
npm run build:docs # markdown → docs-site/ only
```

## Publish to GitHub Pages

1. Push to `main`.
2. **Settings → Pages → Source: GitHub Actions**.
3. The workflow runs `npm ci` and `npm run build`, then deploys `dist`.

Relative `base: './'` works for user/org Pages and project Pages.

## Stack notes

- Landing i18n: `data-i18n` keys + JSON catalogs (`src/modules/i18n.js`)
- Dynamic lists: `src/modules/landing-render.js`
- Docs: `markdown-it` + shell in `scripts/build-docs.mjs`
- Architecture diagrams: Mermaid, loaded only on docs pages that need it

## License

MIT
