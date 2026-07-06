# 正式環境部署教學

這份教學給第一次部署專案的管理員或學生使用。請照順序完成：先 fork 專案、建立各項雲端服務、在 GitHub `production` Environment 填入 secrets，最後用 GitHub Actions 部署。

> [!IMPORTANT]
> `VITE_` 開頭的項目會被包進前端網頁，使用者可以在瀏覽器看到。只能放 Firebase Web 設定、Supabase publishable key、站台名稱這類公開設定。不要把 service role key、資料庫密碼、API secret、token、service account JSON 或 webhook secret 改名成 `VITE_`。

## 1. Fork 專案

1. 登入 GitHub。
2. 打開原始專案頁面。
3. 點右上角 **Fork**。
4. Owner 選自己的 GitHub 帳號或組織。
5. Repository name 可保留原名。
6. 點 **Create fork**。

後續所有設定都要在你 fork 出來的專案裡完成，不要改到原始專案。

## 2. 建立 GitHub production Environment

1. 進入 fork 後的 GitHub 專案。
2. 點 **Settings**。
3. 左側點 **Environments**。
4. 點 **New environment**。
5. 名稱輸入 `production`，大小寫要完全相同。
6. 點 **Configure environment**。
7. 在 **Environment secrets** 區塊點 **Add secret**。
8. 依下方表格逐一新增 secret。

GitHub secret 儲存後會隱藏內容，之後看不到原值。請先把每個服務後台開著，逐項複製貼上，避免貼錯。

## 3. 先準備這些服務

正式部署會用到：

- Firebase：登入、推播、App Check。
- Supabase：資料庫、權限、後端函式。
- Vercel：前端網站部署。
- Cloudinary：圖片上傳與顯示。
- Notion：提案與公告備份。
- Upstash Redis：限流與防止短時間重複操作。
- GitHub Actions：自動部署。

## 4. GitHub secrets 對照表

### App 基本設定

| Secret | 哪裡取得 | 說明 |
| --- | --- | --- |
| `VITE_APP_TITLE` | 自行決定 | 網頁完整名稱，例如 `學生權益提案平台`。會出現在前端。 |
| `VITE_APP_SHORT_NAME` | 自行決定 | PWA 短名稱，例如 `SRP`。會出現在前端。 |
| `ADMIN_EMAILS` | 自行決定 | 管理員 Google 信箱，若有多個用英文逗號分隔，例如 `a@school.edu.tw,b@school.edu.tw`。只放後端。 |
| `ALLOWED_DOMAIN` | 學校 Google 帳號網域 | 允許登入的 email 網域，例如 `school.edu.tw`。只放後端。 |
| `VITE_ALLOWED_DOMAIN` | 同 `ALLOWED_DOMAIN` | 前端登入提示與初步檢查使用，請和 `ALLOWED_DOMAIN` 填同一個網域。會出現在前端。 |

### Firebase

先到 [Firebase Console](https://console.firebase.google.com/) 建立專案，然後新增 Web App。

| Secret | 哪裡取得 | 說明 |
| --- | --- | --- |
| `FIREBASE_PROJECT_ID` | Firebase 專案設定 → 一般 → 專案 ID | 後端驗證 Firebase token 使用。建議與 `VITE_FIREBASE_PROJECT_ID` 相同。 |
| `FIREBASE_WEB_API_KEY` | Firebase 專案設定 → 一般 → Web API Key | 後端需要的 Firebase Web API Key。這不是管理員密鑰，但仍放在 GitHub secret 管理。 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Firebase 專案設定 → 服務帳戶 → 產生新的私密金鑰 | 下載 JSON 後，打開檔案並複製整份 JSON 內容貼入 secret。不要貼檔案路徑。 |
| `VITE_FIREBASE_API_KEY` | Firebase 專案設定 → 一般 → 你的 Web App → SDK 設定 | Firebase web config 的 `apiKey`。會出現在前端。 |
| `VITE_FIREBASE_AUTH_DOMAIN` | 同上 | Firebase web config 的 `authDomain`。會出現在前端。 |
| `VITE_FIREBASE_PROJECT_ID` | 同上 | Firebase web config 的 `projectId`。會出現在前端。 |
| `VITE_FIREBASE_APP_ID` | 同上 | Firebase web config 的 `appId`。會出現在前端。 |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | 同上 | Firebase web config 的 `messagingSenderId`。會出現在前端。 |
| `VITE_FIREBASE_VAPID_KEY` | Firebase 專案設定 → Cloud Messaging → Web Push certificates → Generate key pair | Web Push 推播用公開金鑰。會出現在前端。 |
| `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` | Google Cloud Console → reCAPTCHA Enterprise → Keys | App Check 使用的 site key。會出現在前端。 |

Firebase 另外要設定：

1. Firebase Authentication → Sign-in method → 啟用 Google。
2. Firebase Authentication → Settings → Authorized domains → 加入 Vercel 正式網域。
3. 如果啟用 App Check，請確認 reCAPTCHA Enterprise key 的網域包含正式網域。

選配 secret：

| Secret | 哪裡取得 | 說明 |
| --- | --- | --- |
| `VITE_FIREBASE_APP_CHECK_ENABLED` | 自行決定 | 要啟用 App Check 時填 `true`；未準備好時可先不填。會出現在前端。 |

### Supabase

到 [Supabase Dashboard](https://supabase.com/dashboard) 建立專案。建立時會設定資料庫密碼，請妥善保存。

| Secret | 哪裡取得 | 說明 |
| --- | --- | --- |
| `SUPABASE_ACCESS_TOKEN` | Supabase → Account → Access Tokens → Generate new token | GitHub Actions 部署 Supabase 使用。只放 workflow。 |
| `SUPABASE_PROJECT_REF` | Supabase 專案網址 `https://supabase.com/dashboard/project/<project-ref>`，或 Project Settings → General → Reference ID | 專案代號。 |
| `SUPABASE_DB_PASSWORD` | 建立 Supabase 專案時設定；忘記可到 Project Settings → Database 重設 | 資料庫密碼。只放 workflow。 |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → service_role key | 最高權限後端密鑰。只放後端，絕對不要放進 `VITE_`。 |
| `SUPABASE_URL` | Project Settings → API → Project URL | 後端 Supabase URL。 |
| `VITE_SUPABASE_URL` | 同 `SUPABASE_URL` | 前端連線用 Supabase URL。會出現在前端。 |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Project Settings → API → publishable key 或 anon public key | 前端公開 key，受 RLS 與後端流程保護。會出現在前端。 |

部署後端時，workflow 會把 `SUPABASE_SERVICE_ROLE_KEY` 改用 `APP_SUPABASE_SERVICE_ROLE_KEY` 設到 Supabase Edge Function secrets，避免使用 Supabase 保留名稱。

### Vercel

到 [Vercel](https://vercel.com/) 建立帳號與專案。可以先建立空專案，或用 Vercel 匯入 GitHub fork 後的專案。

| Secret | 哪裡取得 | 說明 |
| --- | --- | --- |
| `VERCEL_TOKEN` | Vercel → Account Settings → Tokens → Create | GitHub Actions 部署前端使用。 |
| `VERCEL_ORG_ID` | Vercel 專案 → Settings → General → Project ID 區塊附近的 Team ID / Org ID，或執行 `vercel link` 後查看 `.vercel/project.json` | Vercel 帳號或團隊 ID。 |
| `VERCEL_PROJECT_ID` | Vercel 專案 → Settings → General → Project ID，或執行 `vercel link` 後查看 `.vercel/project.json` | Vercel 專案 ID。 |

如果介面找不到 `VERCEL_ORG_ID`，可在本機安裝 Vercel CLI 後執行 `vercel link`，再查看產生的 `.vercel/project.json`。不要把 `.vercel` 資料夾提交到 GitHub。

### Cloudinary

到 [Cloudinary Console](https://console.cloudinary.com/) 建立帳號。

| Secret | 哪裡取得 | 說明 |
| --- | --- | --- |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary Dashboard → API Keys | Cloud name。 |
| `CLOUDINARY_API_KEY` | Cloudinary Dashboard → API Keys | API key。只放後端。 |
| `CLOUDINARY_API_SECRET` | Cloudinary Dashboard → API Keys | API secret。只放後端，絕對不要放進 `VITE_`。 |
| `CLOUDINARY_WEBHOOK_SECRET` | 自行建立一組長密碼，並同步填到 Cloudinary webhook 簽章設定 | Cloudinary 上傳完成通知的簽章密鑰。建議用密碼產生器產生至少 32 字元。 |

後端部署完成後，Cloudinary webhook URL 會是：

```text
https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/cloudinaryWebhook
```

請把 `<SUPABASE_PROJECT_REF>` 換成你的 Supabase 專案代號，並在 Cloudinary 的 webhook / notification 設定中使用同一組 `CLOUDINARY_WEBHOOK_SECRET`。

### Notion

到 [Notion Integrations](https://www.notion.so/my-integrations) 建立 Internal Integration。

| Secret | 哪裡取得 | 說明 |
| --- | --- | --- |
| `NOTION_TOKEN` | Notion integration → Internal Integration Secret | Notion API token。只放後端。 |
| `NOTION_DATABASE_ID` | Notion database 頁面網址 | 複製 database URL，中間那段 32 字元 ID 即為 database id。 |

Notion database 建好後，請按右上角分享，把剛建立的 integration 加進 database，否則後端會沒有權限寫入。

選配 secret：

| Secret | 哪裡取得 | 說明 |
| --- | --- | --- |
| `NOTION_VERSION` | 通常不用填 | 未填時 workflow 會使用 `2022-06-28`。 |

### Upstash Redis

到 [Upstash Console](https://console.upstash.com/) 建立 Redis database。

| Secret | 哪裡取得 | 說明 |
| --- | --- | --- |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis database → REST API | REST URL。只放後端。 |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis database → REST API | REST token。只放後端。 |

### Webhook 與維護入口

| Secret | 哪裡取得 | 說明 |
| --- | --- | --- |
| `WEBHOOK_SECRET` | 自行建立一組長密碼 | 後端健康檢查、背景工作與維護入口驗證使用。建議用密碼產生器產生至少 32 字元。 |

## 5. 哪些設定可以公開？

可以出現在前端的只有：

- 所有 `VITE_` 開頭的設定。
- Firebase Web App config。
- Supabase URL。
- Supabase publishable key。
- App 名稱、短名稱、允許登入網域。

不可以出現在前端，也不要改名成 `VITE_` 的有：

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_ACCESS_TOKEN`
- `GOOGLE_SERVICE_ACCOUNT_JSON`
- `CLOUDINARY_API_SECRET`
- `CLOUDINARY_WEBHOOK_SECRET`
- `WEBHOOK_SECRET`
- `NOTION_TOKEN`
- `UPSTASH_REDIS_REST_TOKEN`
- `VERCEL_TOKEN`

目前程式碼的前端只讀取 `VITE_*` 設定；後端私密值由 GitHub Actions 寫入 Supabase Edge Function secrets，不會被打包進瀏覽器。

## 6. 執行部署

請先部署後端，再部署前端。

### 部署 Supabase 後端

1. 進入 GitHub fork 專案。
2. 點 **Actions**。
3. 左側選 **Deploy Supabase Backend**。
4. 點 **Run workflow**。
5. Branch 選 `main`。
6. 點綠色 **Run workflow**。
7. 等到 workflow 顯示綠色打勾。

這個 workflow 會推送資料庫結構、設定後端 secrets、部署 Supabase Edge Functions，最後做一次健康檢查。

### 部署 Vercel 前端

1. 在 GitHub Actions 左側選 **Deploy Frontend to Vercel**。
2. 點 **Run workflow**。
3. Branch 選 `main`。
4. 點綠色 **Run workflow**。
5. 等到 workflow 顯示綠色打勾。
6. 到 Vercel 專案頁面查看正式網址。

`main` 分支會使用 GitHub `production` Environment 並部署到 Vercel production。`dev` 分支會使用 `development` Environment 並部署 preview。

## 7. 部署後檢查

1. 打開 Vercel 正式網址。
2. 使用校內 Google 帳號登入。
3. 用 `ADMIN_EMAILS` 裡的帳號登入，確認可以進入管理員頁面。
4. 建立一筆測試提案，確認提案列表能顯示。
5. 上傳一張圖片，確認圖片可以正常顯示。
6. 到 Notion database 確認資料有同步。
7. 開啟推播權限，確認瀏覽器沒有阻擋通知。

## 8. 常見問題

| 狀況 | 檢查方式 |
| --- | --- |
| GitHub Actions 顯示 missing secrets | 回到 Settings → Environments → `production`，確認 secret 名稱完全一致，沒有多空格或大小寫錯誤。 |
| Google 登入後被拒絕 | 確認 `ALLOWED_DOMAIN` 與 `VITE_ALLOWED_DOMAIN` 是同一個學校網域。 |
| Google 登入彈出 unauthorized domain | 到 Firebase Authentication → Settings → Authorized domains，加入 Vercel 正式網域。 |
| 後端部署時 Supabase link 失敗 | 確認 `SUPABASE_ACCESS_TOKEN`、`SUPABASE_PROJECT_REF`、`SUPABASE_DB_PASSWORD` 正確。 |
| 前端部署到錯誤專案 | 確認 `VERCEL_ORG_ID` 與 `VERCEL_PROJECT_ID` 來自同一個 Vercel 專案。 |
| 圖片上傳後一直無法顯示 | 確認 Cloudinary webhook URL、`CLOUDINARY_WEBHOOK_SECRET` 與 Cloudinary API 設定。 |
| Notion 沒有資料 | 確認 database 已分享給 integration，且 `NOTION_DATABASE_ID` 是 database id，不是頁面標題。 |
| 推播沒有出現 | 確認 `VITE_FIREBASE_VAPID_KEY` 正確、網站使用 HTTPS，且瀏覽器允許通知。 |

## 9. 危險操作提醒

GitHub Actions 內還有維護用 workflow：

- **Reset Supabase Database**：會重置資料庫，正式環境不要隨意執行。
- **Reset Cloudinary Assets**：會刪除 Cloudinary 內的資源，正式環境不要隨意執行。

只有在非常確定要清空環境時才執行這類 reset workflow。
