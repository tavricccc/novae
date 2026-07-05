# 學生權益提案平台

一個給校內學生提出公共議題、設備需求、學生權益維護與其他校內提案的平台。  
專案重點是讓提案流程可追蹤、分類可設定、附議狀態透明，同時依分類權限設定保護作者與私密案件資訊。

## 核心功能

- **校內 Google 登入**：使用 Firebase Authentication，只允許已驗證的指定校內網域帳號使用。
- **Config 驅動提案分類**：分類設定由 `config/issue-categories.config.json` 管理，可調整顯示名稱、讀取範圍、作者具名狀態、附議門檻與回覆期限。
- **公共議題審核**：需要審核的分類送出後先由管理員審核，核准後才公開與開放附議。
- **作者隱私保護**：支援匿名保護分類，作者資訊與公開內容分離，一般使用者顯示為「匿名使用者」。
- **提案與公告互動**：提案支援留言、附議、狀態審核與刪除；公告支援發布、編輯、刪除、按讚與留言。
- **通知系統**：站內通知與 FCM Web Push 由 Supabase outbox worker 背景處理。
- **圖片上傳**：前端壓縮為 WebP 後直傳 Cloudinary，內容使用 `srp-upload://<id>`，顯示時由後端批次解析。
- **Notion 備份**：刪除同步保留 Notion page，並把狀態標記為「已刪除」。

## 架構

- Vue 3、Vite、TypeScript、Vue Router
- Firebase Authentication、Firebase Cloud Messaging、Firebase App Check
- Vercel 前端 Hosting
- Supabase Postgres、RLS、Edge Functions、Database Webhooks / Cron
- Cloudinary 圖片儲存與 delivery
- Notion API

Firebase 在此專案只保留登入、App Check 與推播。前端由 Vercel 部署；業務資料、後端行為、圖片 metadata、通知狀態與維護工作都由 Supabase / Cloudinary 承接。

## 本機開發

```bash
npm install
npm run typecheck
npm run lint
npm run build
npm run check:edge
npm run test:architecture
```

必要前端環境變數請參考 `.env.example`：

- `VITE_ALLOWED_DOMAIN`
- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_VAPID_KEY`
- `VITE_FIREBASE_APP_CHECK_ENABLED`
- `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

## 分類與設定

提案分類與限流閾值由以下檔案管理：

- `config/issue-categories.config.json`
- `config/rate-limits.config.json`

修改後執行：

```bash
npm run generate:all
```

## 部署

GitHub Actions 使用 `production` 與 `development` 兩個 GitHub Environment。

前端 Vercel workflow 需要：

- Firebase web config：`VITE_FIREBASE_*`
- 選配 App Check：`VITE_FIREBASE_APP_CHECK_ENABLED`、`VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Supabase 後端 workflow 需要：

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_SERVICE_ROLE_KEY`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_WEBHOOK_SECRET`
- `WEBHOOK_SECRET`
- `NOTION_TOKEN`
- `NOTION_VERSION`

後端部署 workflow 會執行 Supabase migrations、設定 Edge Function secrets，並部署 `syncUser`、`backendAction`、`cloudinaryWebhook`、`outboxWorker`、`processDeletionJobs`。
