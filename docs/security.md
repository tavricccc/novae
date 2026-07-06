# 資安與隱私模型

本專案處理校內帳號、提案內容、私密作者資料、通知 token、圖片與管理員操作。安全設計的核心原則是：前端不是安全邊界，所有敏感判斷都要在後端與資料庫權限層完成。

## 安全邊界

| 邊界 | 防護 |
| --- | --- |
| 登入 | Firebase Google Auth、email verified、允許網域檢查 |
| 使用者角色 | `ADMIN_EMAILS` 後端判斷，登入同步後寫入角色 |
| 前端設定 | 只允許 `VITE_*` 公開設定 |
| 後端私密值 | GitHub secrets 寫入 Supabase Edge Function secrets |
| 資料讀寫 | Supabase RLS、受控 Edge Function action |
| 圖片 | Cloudinary signed upload、authenticated delivery、後端簽名 URL |
| Webhook | Bearer secret 或 Cloudinary signature 驗證 |
| 限流 | Upstash Redis REST，依操作類型限制 |
| 背景工作 | Outbox claim、租約、重試與維護清理 |

## 身份驗證

使用者登入流程：

1. 前端使用 Firebase Google Auth。
2. 前端取得 Firebase ID token。
3. 後端驗證 token、email verified、provider 與允許網域。
4. `syncUser` 依 `ADMIN_EMAILS` 同步管理員角色。
5. 前端呼叫 Supabase 時帶 Firebase token。
6. 後端與 RLS 依 token / role 判斷可讀寫範圍。

只在前端檢查 email 網域是不夠的；本專案在後端共用驗證邏輯中再次檢查。

## 授權模型

| 角色 | 能力 |
| --- | --- |
| 未登入 | 只能進入登入流程。 |
| 校內使用者 | 可讀校內公開內容、建立提案、留言、附議、管理自己的內容。 |
| 作者本人 | 可讀自己的審核中或私密提案。 |
| 管理員 | 可審核、調整狀態、發布公告、查看 Dashboard 與處理管理流程。 |
| Service role | 只在 Edge Functions 使用，用於受控後端流程。 |

管理員資格不放在前端，不使用 `VITE_ADMIN_EMAILS`。前端只根據後端回傳的角色調整畫面。

## 資料隱私

| 資料 | 保護方式 |
| --- | --- |
| 私密作者資訊 | 與公開內容分離，讀取需本人或管理員權限 |
| 權益維護案件 | 可設定為 `owner-admin`，避免校內公開 |
| 匿名公共議題 | 一般使用者看到匿名作者 |
| 通知 | 依 recipient / source 過濾，避免跨使用者讀取 |
| 推播 token | 寫入限流，與使用者裝置綁定 |
| 圖片 URL | 不直接公開永久原始 URL，顯示時由後端產生簽名 URL |

## Secret 管理

可以公開到前端：

- `VITE_APP_TITLE`
- `VITE_APP_SHORT_NAME`
- `VITE_ALLOWED_DOMAIN`
- `VITE_FIREBASE_*`
- `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

不可以公開到前端：

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

workflow 會把 `SUPABASE_SERVICE_ROLE_KEY` 以 `APP_SUPABASE_SERVICE_ROLE_KEY` 名稱寫入 Edge Function secrets，避免使用 Supabase 保留名稱，也避免前端接觸 service role。

## 前端安全

- Markdown 使用 DOMPurify 消毒。
- 圖片壓縮與格式限制在前端先做，後端與 webhook 再驗證。
- PWA 更新檢查避免舊前端繼續呼叫已變更的後端介面。
- 前端 service 只呼叫受控 Edge Function action。
- 搜尋與列表使用分頁與候選限制，避免大量資料一次拉到前端。

前端防護主要是降低風險與改善體驗；真正權限仍在後端。

## 後端安全

- Edge Functions 共用 CORS、method guard、JSON 解析與錯誤回應 helper。
- Firebase token 驗證集中在 shared helper。
- 管理員檢查集中在後端。
- 寫入 action 使用明確 payload 驗證。
- 冪等 request id 避免重試造成重複 mutation。
- Webhook 入口驗證簽章或 bearer secret。
- 外部副作用透過 outbox 處理，避免使用者請求直接長時間卡住。

## 資料庫安全

- RLS 是資料保護核心。
- 私有資料放在 `app_private` schema。
- 前端 Supabase client 預設使用 `app_api` schema。
- 高權限操作由 Edge Functions 使用 service role 執行。
- Realtime 訂閱依使用者與來源過濾。
- 架構測試防止舊資料路徑與未受控入口回歸。

## Webhook 與背景工作

| 入口 | 驗證 |
| --- | --- |
| `cloudinaryWebhook` | `x-cld-signature`、`x-cld-timestamp`、`CLOUDINARY_WEBHOOK_SECRET` |
| `outboxWorker` | `Authorization: Bearer <WEBHOOK_SECRET>` |
| `processDeletionJobs` | `Authorization: Bearer <WEBHOOK_SECRET>` |
| `maintenanceCleanup` | `Authorization: Bearer <WEBHOOK_SECRET>` |
| `backendAction` healthcheck | `x-healthcheck-secret` |

所有維護入口都應視為後端私密入口，不應提供給一般使用者或寫入前端。

## 開源部署安全清單

正式上線前請確認：

1. GitHub `production` Environment 已填完 secrets。
2. 沒有任何私密值使用 `VITE_` 前綴。
3. Firebase Authorized domains 只包含可信任網域。
4. `ALLOWED_DOMAIN` 與 `VITE_ALLOWED_DOMAIN` 一致。
5. `ADMIN_EMAILS` 只包含必要管理員。
6. Supabase service role key 沒有出現在 README、issue、screenshot 或前端部署設定。
7. Cloudinary webhook secret 與 GitHub secret 一致。
8. Notion database 只分享給必要 integration 與管理員。
9. Reset workflows 不會被非維護者誤觸。
10. Dashboard 能看到近期異常與維護狀態。

## 已知限制

- Notion 是備份與人工查閱，不是權限來源。
- 使用外部雲端服務時，資料所在地、帳務與供應商政策需由部署組織自行評估。
- 管理員帳號安全依賴 Google 帳號與組織管理，建議啟用強密碼與雙因素驗證。
