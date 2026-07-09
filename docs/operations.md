# 維運指南

這份文件說明平台上線後如何檢查、監控、排錯與維護。目標是讓管理員不必每次都翻 Supabase、Cloudinary 或 GitHub Actions 才知道平台狀態。

## 上線後檢查清單

每次正式部署後請檢查：

1. Vercel 正式網址可以開啟。
2. 校內 Google 帳號可以登入。
3. 非允許網域帳號會被拒絕。
4. `ADMIN_EMAILS` 內的帳號能進 Dashboard。
5. 可以建立測試提案。
6. 若分類需要審核，審核流程正常。
7. 附議、取消附議與留言正常。
8. 圖片可以上傳並在詳情頁顯示。
9. Notion database 有同步資料。
10. 推播權限與 App 內通知正常。
11. Dashboard 沒有新的部署後異常。

## 日常監控

| 項目 | 看哪裡 | 處理 |
| --- | --- | --- |
| 前端部署 | GitHub Actions、Vercel Deployments | 部署失敗時先看 GitHub Actions log。 |
| 後端部署 | GitHub Actions、Supabase Functions | deployment secrets 或 migration 失敗會在 workflow 顯示。 |
| 平台異常 | 管理員 Dashboard | 優先看錯誤追蹤碼、來源、時間與最近維護結果。 |
| Notion 同步 | Dashboard、Notion database | 檢查 integration 權限與 token。 |
| 圖片處理 | Dashboard、Cloudinary usage | 檢查 webhook、圖片限制與 deletion jobs。 |
| 推播 | Dashboard、Firebase / FCM | 檢查 VAPID key、token 寫入與使用者權限。 |
| 限流 | Dashboard、Upstash usage | 檢查是否有異常高頻操作。 |

## Dashboard 判讀

Dashboard 應優先用於回答：

- 最近有沒有同步、通知、推播或清理異常？
- 錯誤是否有追蹤碼可以回報？
- 哪些外部服務可能失敗？
- 維護排程是否正常完成？
- 各分類提案與留言量是否異常？
- 是否有累積的待處理工作？

使用者遇到錯誤時，應提供畫面上的追蹤碼、發生時間與操作情境。管理員可用追蹤碼在 Dashboard 近期異常中定位，不一定要直接進 Supabase 查詢。

## 錯誤處理流程

1. 收到使用者回報，先記錄追蹤碼、時間、帳號網域、操作頁面與動作。
2. 到 Dashboard 查看近期異常。
3. 判斷來源：前端讀取、後端 action、圖片、通知、Notion、推播、維護清理。
4. 若 Dashboard 有足夠資訊，先處理設定或外部服務問題。
5. 若 Dashboard 資訊不足，再查 GitHub Actions、Supabase Function logs、Cloudinary、Notion 或 Upstash。
6. 修復後重試原操作，確認 Dashboard 不再新增同類錯誤。

## 資料保留

正式內容與短期維運資料採不同保留策略。提案、公告、留言與狀態是平台正式資料，不因日常維護自動清除；通知、即時事件、背景工作紀錄與暫存資料只保留近期操作需要的範圍。

| 資料類型 | 保留策略 |
| --- | --- |
| 提案、公告、留言與附議 | 正式內容資料，不設定日常 TTL。 |
| Notion 對應資料 | 作為備份與同步定位使用，不因日常維護自動清除。 |
| App 內通知 | 保留 7 天。 |
| Realtime 內容事件 | 保留 1 天。 |
| Outbox 成功事件 | 完成後保留 1 天。 |
| Outbox 失敗事件 | 失敗後保留 3 天。 |
| Web Push 發送成功紀錄 | 保留 1 天。 |
| Web Push 發送失敗紀錄 | 保留 3 天。 |
| 冪等操作紀錄 | 保留 24 小時。 |
| 未附加圖片暫存 | pending 保留 24 小時；ready 未附加保留 48 小時；failed 保留 24 小時。 |
| 私密圖片簽名網址快取 | 最長重用 7 天；過期後由維護清理移除快取網址。 |
| 維護清理紀錄 | 保留 7 天。 |
| 外部資源刪除工作 | completed 保留 1 天；failed 保留 3 天；pending / processing 不因 TTL 清除。 |

這樣可以降低資料庫中短期事件與診斷資料長期累積，也讓 Dashboard 聚焦近期需要處理的問題。

正式維運時請分清楚：

- 內容資料：提案、公告、留言與狀態，是平台正式資料。
- 備份資料：Notion 同步內容，供人工查閱與備援。
- 短期維運資料：通知、事件、錯誤、追蹤碼、維護紀錄與暫存資料，主要用於近期操作與排錯。

## 背景工作

| 工作 | 責任 |
| --- | --- |
| Outbox worker | 發送 App 內通知、Web Push、Notion 同步與外部副作用 |
| Deletion jobs | 清理 Cloudinary / Notion 相關外部資源 |
| Maintenance cleanup | 清理過期診斷資料、維護紀錄與可過期暫存資料 |
| Cloudinary webhook | 接收圖片上傳完成通知 |

如果背景工作失敗，通常不代表使用者主操作一定失敗；但通知、同步或清理可能延遲，需要 Dashboard 追蹤。

## 分類移除清理

分類從 `config/issue-categories.config.json` 移除後，後端部署會觸發一次維護清理。清理會：

- 刪除資料庫中已不屬於有效分類的提案。
- 連帶刪除該提案的留言、附議與私密作者資料。
- 將該提案與留言綁定的 Cloudinary 圖片排入刪除工作。
- 保留 Notion 備份頁面，並透過背景同步標記為已刪除。

若只修改 config 但沒有部署後端，資料庫中的舊分類資料不會自動清理。

## 部署操作

正式部署順序：

1. `Deploy Supabase Backend`
2. `Deploy Frontend to Vercel`

原因：

- 後端 migration 與 Edge Functions 先更新，前端才不會呼叫不存在的新 action。
- 前端部署後若 service worker 更新，使用者會拿到新版介面。

若只修改文件，不需要部署前端或後端；若修改 `src/`、`public/`、`vite.config.ts` 或前端設定，會觸發前端部署；若修改 `supabase/` 或 `config/`，會影響後端部署。

## 版本更新提示

前端會檢查 `version.json`。當遠端版本較新時，使用者會看到更新提示並重新整理。這避免舊前端繼續呼叫新版後端時出現不一致。

維運建議：

- 前後端有相依變更時先部署後端。
- 部署完成後開一次正式網址，確認更新提示與重新整理流程正常。
- 若使用者回報更新後仍異常，請請他提供追蹤碼與發生時間。

## 常見事故與處理

| 狀況 | 優先檢查 |
| --- | --- |
| 全站無法登入 | Firebase Authorized domains、Firebase API key、`ALLOWED_DOMAIN` |
| 管理員權限消失 | `ADMIN_EMAILS`、`syncUser` logs、重新登入 |
| 提案送出失敗 | Dashboard 追蹤碼、Upstash 限流、backendAction logs |
| 圖片一直 pending | Cloudinary webhook URL、`CLOUDINARY_WEBHOOK_SECRET`、Cloudinary usage |
| Notion 不同步 | `NOTION_TOKEN`、database 是否分享給 integration、Notion API 狀態 |
| 推播收不到 | 使用者瀏覽器權限、`VITE_FIREBASE_VAPID_KEY`、FCM token 寫入 |
| Dashboard 沒資料 | 管理員角色、backendAction healthcheck、Supabase migration 是否完成 |
| 部署失敗 | GitHub Environment secrets 是否填在 `production`，名稱是否完全一致 |

## Reset workflow

| Workflow | 風險 |
| --- | --- |
| `Reset Supabase Database` | 會重置資料庫架構與資料，正式環境不可隨意執行。 |
| `Reset Cloudinary Assets` | 會刪除 Cloudinary 資源，可能造成圖片無法顯示。 |

執行 reset 前請至少確認：

1. 這是測試環境或已完成備份。
2. 管理員與使用者已被通知。
3. 知道如何重新部署後端與前端。
4. 知道如何重新建立必要設定。

## 本機維護指令

```bash
npm run typecheck
npm run lint
npm run build
npm run check:edge
npm run test:architecture
```

完整本機驗證：

```bash
npm run verify:local
```

Supabase 本機資料庫：

```bash
npm run db:start
npm run db:reset:local
npm run db:lint:local
```

## 維運角色建議

| 角色 | 建議權限 |
| --- | --- |
| 專案維護者 | GitHub repo、Vercel、Supabase、Cloudinary、Firebase、Upstash |
| 內容管理員 | App 管理員權限、Notion database 權限 |
| 財務 / 帳務負責人 | 各雲端服務 billing read access |
| 備援管理員 | 至少一位可更新 secrets 與重新部署的人 |

不要讓只有一個人掌握所有雲端帳號與 secrets。正式上線後，帳號交接比程式碼更容易成為風險。
