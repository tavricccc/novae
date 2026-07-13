# Novae

[繁體中文](#繁體中文) · [English](#english)

## 繁體中文

Novae 是一套供校內社群提出、審核、附議與追蹤公共議題的開源 PWA，也支援私密權益案件、公告、留言、站內通知、Web Push、圖片與管理 Dashboard。

### 主要特色

- 限定校內 Google 帳號的 Firebase Authentication。
- 可設定公開、審核後公開或僅作者／管理員可見的提案分類。
- 可按分類設定匿名顯示、附議門檻、附議期限與回覆期限。
- Supabase RLS、Edge Functions、outbox、Realtime 與維護排程。
- Cloudinary 簽名圖片流程、Notion 營運副本與 Upstash 限流。
- 分離的前端／後端 GitHub Actions 部署與完整本機驗證。

### 快速開始

```bash
git clone https://github.com/tavricccc/novae.git
cd novae
npm ci
Copy-Item .env.example .env
npm run dev
```

完整環境與驗證步驟見[快速開始](docs/quick-start.md)。平台操作方式分為[使用者操作](docs/user-guide.md)與[管理員操作](docs/admin-guide.md)，正式上線請從[部署指南](docs/deployment-guide.md)開始。

### 文件與社群

- [完整文件索引](docs/README.md)
- [產品規則設定](docs/configuration.md)與[環境憑證參考](docs/environment-configuration.md)
- [系統架構](docs/architecture.md)
- [安全政策](SECURITY.md)
- [貢獻指南](CONTRIBUTING.md)
- [社群行為準則](CODE_OF_CONDUCT.md)

## English

Novae is an open-source PWA for school communities to submit, review, support, and track public issues. It also supports private rights cases, announcements, discussions, in-app notifications, Web Push, images, and an operations dashboard.

### Highlights

- Firebase Google Authentication restricted to a school domain.
- Configurable school-wide, reviewed, or author-and-admin-only categories.
- Per-category author display, support thresholds, support windows, and response deadlines.
- Supabase RLS, Edge Functions, outbox, Realtime, and maintenance schedules.
- Signed Cloudinary media, a Notion operational copy, and Upstash rate limiting.
- Separate frontend/backend GitHub Actions delivery with full local verification.

### Quick start

```bash
git clone https://github.com/tavricccc/novae.git
cd novae
npm ci
cp .env.example .env
npm run dev
```

Follow the [quick start](docs/en/quick-start.md) for setup and verification, the [user guide](docs/en/user-guide.md) and [administrator guide](docs/en/admin-guide.md) for product workflows, and the [deployment guide](docs/en/deployment-guide.md) for production.

### Documentation and community

- [Documentation index](docs/README.md#english)
- [Product rules](docs/en/configuration.md) and [environment credentials](docs/en/environment-configuration.md)
- [Architecture](docs/en/architecture.md)
- [Security policy](SECURITY.md#english)
- [Contributing](CONTRIBUTING.md#english)
- [Code of conduct](CODE_OF_CONDUCT.md#english)

## License

Released under the [MIT License](LICENSE).
