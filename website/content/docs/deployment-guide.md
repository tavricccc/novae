# 部署指南

[English](en/deployment-guide.md) · [文件首頁](README.md)

本指南建立一套正式環境：Vercel 前端、Supabase 資料與 Functions、Firebase 登入與推播、Cloudinary 圖片、Notion 副本及 Upstash 限流。請先完成[設定參考](configuration.md)與[安全模型](security.md)的檢查。

## 0. 決定環境策略

- `main` branch 使用 GitHub `production` Environment。
- `dev` branch 使用 GitHub `development` Environment。
- 兩者應使用不同的 Firebase、Supabase、Cloudinary、Notion、Upstash 與 Vercel 資源。
- 至少指定一位服務擁有者與一位備援管理員。

## 1. Fork 與保護 repository

1. Fork `tavricccc/novae`。
2. 啟用 branch protection，要求 `Verify PR` 成功再合併。
3. 在 **Settings → Environments** 建立 `production` 與 `development`。
4. 正式環境建議啟用 required reviewers。

## 2. 建立 Firebase

1. 建立 project 與 Web App。
2. 在 Authentication 啟用 Google provider，設定授權網域。
3. 建立 Cloud Messaging Web Push certificate，取得 VAPID public key。
4. 如需 App Check，建立 reCAPTCHA Enterprise site key 並註冊 Web App。
5. 建立供 Edge Functions 驗證 token 與傳送 FCM 的 service account JSON。

記錄 Web config、project ID、Web API key、VAPID key 與 service account JSON。Web config 可公開，service account JSON 絕不可進入 Git 或前端。

## 3. 建立 Supabase

1. 建立 project 並保存 project ref、database password、publishable key 與 service role key。
2. 確認專案區域與資料治理需求相符。
3. 暫時不要手動建立 app tables；workflow 會依 migrations 建立。
4. 準備 personal access token 給 Supabase CLI。

## 4. 建立 Cloudinary、Notion 與 Upstash

### Cloudinary

建立專用 cloud，取得 cloud name、API key 與 API secret。產生高熵 webhook secret；部署後再將 notification URL 指向：

```text
https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/cloudinaryWebhook
```

### Notion

建立 internal integration 與專用 database，把 database 分享給 integration，保存 token 與 database ID。Notion 是營運副本，不應當成災難復原備份。

### Upstash

建立 Redis database，保存 REST URL 與 REST token。正式與開發環境不要共用同一個限流資料庫。

## 5. 連結 Vercel

1. 建立 Vercel project 並連結 fork。
2. 取得 project ID 與 team/user org ID。
3. 建立 deployment token；權限只給需要的 scope。
4. 發布由 GitHub Actions 執行，避免與 Vercel Git auto-deploy 重複。

## 6. 填入 GitHub Environment secrets

完整名稱與公開／私密邊界見[設定參考](configuration.md#前端環境變數)。兩個 Environment 都要填自己的值。

前端與 Vercel：

```text
VITE_SCHOOL_NAME
VITE_ALLOWED_DOMAIN
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_VAPID_KEY
VITE_FIREBASE_APP_CHECK_ENABLED
VITE_RECAPTCHA_ENTERPRISE_SITE_KEY
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
```

後端：

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_PROJECT_REF
SUPABASE_DB_PASSWORD
SUPABASE_SERVICE_ROLE_KEY
FIREBASE_PROJECT_ID
FIREBASE_WEB_API_KEY
GOOGLE_SERVICE_ACCOUNT_JSON
ALLOWED_DOMAIN
ADMIN_EMAILS
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
CLOUDINARY_WEBHOOK_SECRET
WEBHOOK_SECRET
NOTION_TOKEN
NOTION_DATABASE_ID
NOTION_VERSION
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

## 7. 第一次發布

1. 從 Actions 手動執行 **Deploy Supabase Backend**，選擇 `main`。
2. 確認 migrations、Function deploy、`backendAction` healthcheck 與 maintenance cleanup 全部成功。
3. 設定 Cloudinary webhook URL，並確認 secret 與 GitHub 中相同。
4. 手動執行 **Deploy Frontend to Vercel**。
5. 將正式網域加入 Firebase authorized domains、reCAPTCHA/App Check 與 Vercel domain 設定。

後續 push 到 `main` 或 `dev` 會依路徑觸發相應 workflow。

## 8. 上線驗收

- 未登入使用者無法讀取校內內容。
- 非允許網域與未驗證 email 無法完成同步。
- 一般使用者、作者與管理員看到的私密分類範圍正確。
- 可新增、審核、留言、附議與變更狀態。
- 圖片可上傳、重新整理後仍可顯示，原始 secret 不在網路回應中。
- 站內通知、Web Push、Notion 同步與 Dashboard 有結果。
- Edge logs 沒有持續失敗，Vercel response headers 包含 CSP 與其他安全標頭。

## 9. 回復與危險操作

前端可重新部署上一個已知良好的 commit。後端 migration 採向前修正：不要修改或回滾已部署 migration，應新增相容 migration。Functions 可部署上一個相容版本，但必須確認它支援目前資料庫 schema。

`Reset Supabase Database` 與 `Reset Cloudinary` workflows 會破壞資料。正式環境只在已驗證備份、明確核准與維護時段下執行。日常事故處理請先依[維運手冊](operations.md)隔離問題。
