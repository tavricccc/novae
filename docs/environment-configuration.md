# 環境與憑證

[English](en/environment-configuration.md) · [文件首頁](README.md) · [產品規則設定](configuration.md)

本頁區分會進入瀏覽器的公開環境變數，以及只存在部署平台的後端憑證。逐項取得方式見[從零部署指南](deployment-guide.md)。

## 放置位置

| 類型 | 本機 | 正式與開發環境 | 可見性 |
| --- | --- | --- | --- |
| `VITE_*` | 未追蹤的 `.env` | GitHub Environment secrets | 瀏覽器使用者可見 |
| 後端與部署憑證 | 不提交到 Git | GitHub／Supabase／供應商 secret 設定 | 只限受控後端與部署流程 |

正式與開發環境必須使用不同資源與憑證。不要把 service role key、資料庫密碼或第三方 secret 放入任何 `VITE_*` 欄位。

## 前端環境變數

| 名稱 | 必要 | 用途 |
| --- | --- | --- |
| `VITE_SCHOOL_NAME` | 否 | 啟動畫面與「我的」頁面顯示的學校名稱；留空時不顯示 |
| `VITE_ALLOWED_DOMAIN` | 是 | 前端登入提示與預檢 |
| `VITE_FIREBASE_API_KEY` | 是 | Firebase Web config |
| `VITE_FIREBASE_AUTH_DOMAIN` | 是 | Firebase Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | 是 | Firebase project ID |
| `VITE_FIREBASE_APP_ID` | 是 | Firebase Web App ID |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | 是 | FCM sender ID |
| `VITE_FIREBASE_VAPID_KEY` | 是 | Web Push public key |
| `VITE_FIREBASE_APP_CHECK_ENABLED` | 否 | `true` 時啟用 App Check |
| `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` | 條件式 | 啟用 App Check 時必要 |
| `VITE_SUPABASE_URL` | 是 | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 是 | Supabase publishable key |

## 後端與部署憑證

| 群組 | 名稱 |
| --- | --- |
| Supabase 部署 | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_SERVICE_ROLE_KEY` |
| Firebase 驗證 | `FIREBASE_PROJECT_ID`, `FIREBASE_WEB_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_JSON` |
| 存取控制 | `ALLOWED_DOMAIN`, `ADMIN_EMAILS` |
| Cloudinary | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_WEBHOOK_SECRET` |
| 內部觸發 | `WEBHOOK_SECRET` |
| Notion | `NOTION_TOKEN`, `NOTION_DATABASE_ID`, `NOTION_VERSION`（選用，預設 `2022-06-28`） |
| Upstash | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| Vercel 部署 | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` |

## 相依欄位

`ADMIN_EMAILS` 是必填的完整信箱清單，以半形逗號分隔。`VITE_ALLOWED_DOMAIN` 與 `ALLOWED_DOMAIN` 必須完全相同，只填 `@` 後面的網域；管理員帳號也必須屬於該網域。

`FIREBASE_PROJECT_ID` 與 `FIREBASE_WEB_API_KEY` 通常重用前端對應值。`CLOUDINARY_WEBHOOK_SECRET` 在目前標準 HMAC 驗證中重用 `CLOUDINARY_API_SECRET`；`WEBHOOK_SECRET` 必須另外產生隨機值。`GOOGLE_SERVICE_ACCOUNT_JSON` 填完整 JSON，不是檔案路徑。

Supabase 託管的 Edge Functions 自動提供 `SUPABASE_URL`，不需建立 GitHub secret。發布流程會把 `SUPABASE_SERVICE_ROLE_KEY` 以 `APP_SUPABASE_SERVICE_ROLE_KEY` 名稱寫入 Edge secrets。

## 完成檢查

- `.env` 與憑證沒有被提交到 Git。
- `VITE_ALLOWED_DOMAIN` 與 `ALLOWED_DOMAIN` 完全一致。
- 正式與開發環境沒有共用資料庫、專案或憑證。
- 依[快速開始](quick-start.md)或[部署指南](deployment-guide.md)完成對應驗證。
