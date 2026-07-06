# 成本估算

本文件用來協助開源採用者評估正式環境成本。雲端服務價格會調整，以下內容以 **2026-07-06** 查詢到的官方資訊為基準；正式採用前請重新查看各服務定價頁。

## 成本來源

| 服務 | 用途 | 成本驅動因素 | 官方價格頁 |
| --- | --- | --- | --- |
| Vercel | 前端 Hosting、CDN、部署 | 流量、build、團隊協作、商業使用需求 | [Vercel Pricing](https://vercel.com/pricing) |
| Supabase | Postgres、RLS、Realtime、Edge Functions、Cron | 資料庫大小、流量、MAU、Edge Function 使用量、備份需求 | [Supabase Pricing](https://supabase.com/pricing) |
| Firebase | Google 登入、FCM、App Check | Auth 用量、App Check / reCAPTCHA 評估量、是否升級 Blaze | [Firebase Pricing](https://firebase.google.com/pricing) |
| reCAPTCHA Enterprise | App Check 防濫用 | 每月 assessments 數量 | [reCAPTCHA tiers](https://docs.cloud.google.com/recaptcha/docs/compare-tiers) |
| Cloudinary | 圖片儲存、轉檔、authenticated delivery | 圖片數量、轉換量、儲存、頻寬 | [Cloudinary Pricing](https://cloudinary.com/pricing) |
| Notion | 備份資料庫與人工查閱 | 工作區方案、成員數、API / automation 使用 | [Notion Pricing](https://www.notion.com/pricing) |
| Upstash Redis | 限流與短期計數 | Redis commands 數量、資料量、是否需要固定方案 | [Upstash Redis](https://upstash.com/redis) |
| GitHub | 原始碼、Actions | 私有 repo、Actions minutes、團隊管理 | [GitHub Pricing](https://github.com/pricing) |

## 小型校內部署估算

以下是假設每月活躍使用者數百到數千、圖片量有限、管理員人數少的初期部署。

| 服務 | 建議起步方案 | 何時再評估升級 |
| --- | --- | --- |
| Vercel | Hobby / 免費額度 | 流量、協作人數、組織治理或 Vercel 條款要求超出免費方案時。 |
| Supabase | Free | 資料量、流量、備份需求或正式治理需求超出 Free 限制時。 |
| Firebase | Spark / 免費額度 | 啟用需要付費的 Google Cloud 功能或超出免費額度時。 |
| reCAPTCHA | 免費額度內 | App Check 流量大到 assessments 超出免費額度時。 |
| Cloudinary | Free | 圖片儲存、轉換量或頻寬接近免費額度時。 |
| Notion | Free 或既有工作區 | 成員、權限與團隊管理需求超出免費方案時。 |
| Upstash Redis | Free | Redis commands 或資料量接近免費額度時。 |
| GitHub Actions | Free 額度 | 頻繁部署、私有 repo 或大型團隊超出免費額度時。 |

## 以服務分解的成本判斷

### Vercel

前端是靜態 Vite build，主要成本來自流量、部署與團隊協作。開源展示、學生專案與小型校內部署可優先使用 Vercel Hobby / 免費額度；是否需要升級，應依 Vercel 條款、組織治理與實際用量判斷。

建議：

- 預設先用 Hobby / 免費額度。
- 若流量大，定期看 Vercel usage。
- 只有在免費額度、協作模式或服務條款不符合需求時再升級。

### Supabase

Supabase 是本專案最重要的後端服務，但小型校內部署可以優先使用 Free。資料庫、RLS、Realtime、Edge Functions、Cron 與 migration 都依賴 Supabase；是否升級不取決於「正式上線」本身，而是取決於資料量、流量、備份需求、專案暫停限制與維運責任。

建議：

- 預設從 Free 開始。
- 正式上線前確認 Free 方案的資料庫容量、流量、備份與專案暫停政策。
- 只有在用量接近限制、需要更完整備份或組織要求更高維運保障時，再評估付費方案。

### Firebase 與 reCAPTCHA

本專案使用 Firebase Auth、FCM、App Check。Firebase 官方文件說明有 no-cost Spark 與 pay-as-you-go Blaze 方案；FCM 官方頁面標示 Cloud Messaging 沒有使用成本。reCAPTCHA Enterprise / Google Cloud pricing 另有免費 assessments 額度，超過後可能計費。

建議：

- 只使用 Google 登入與 FCM 時成本通常較低。
- 啟用 App Check 前，請確認 reCAPTCHA key 的 assessments 用量與帳務設定。
- 不要開啟本專案未使用的 Firebase paid products。

### Cloudinary

圖片是第二個容易成長的成本來源。提案、公告與留言圖片會使用 Cloudinary authenticated resource。小型部署可優先使用 Cloudinary Free；實際成本取決於圖片量、轉換量、儲存與傳輸。

建議：

- 控制每篇內容圖片數量與上傳大小。
- 定期執行清理與檢查 deletion jobs。
- 若圖片流量高，先看 Cloudinary usage dashboard，再調整圖片上限；接近免費額度時再升級。

### Notion

Notion 在本專案是備份與人工查閱用途，不是主資料庫。成本多半取決於工作區方案、成員數與組織權限需求。

建議：

- 早期可使用既有 Notion 工作區。
- 正式管理流程若多人共同維護，請確認權限與方案限制。
- Notion 同步失敗不應阻斷主平台，但需要在 Dashboard 追蹤。

### Upstash Redis

Upstash Redis 用於限流與短期計數。小型部署可優先使用 Free；成本跟操作次數高度相關，濫用或大量互動會推高 commands。

建議：

- 預設先使用 Free。
- 若遇到惡意請求，先調整 rate limit config 與登入限制。
- 觀察 Upstash commands 趨勢，接近免費額度時再決定是否升級。

## 控制成本的專案設計

- 圖片在前端壓縮為 WebP，限制最大尺寸與檔案大小。
- 提案、留言、附議、登入同步、推播 token 寫入都有 rate limit。
- 列表採分頁、搜尋採候選限制與快取。
- Dashboard 使用聚合資料，避免大量掃描。
- 外部副作用走 outbox，失敗可重試，不需要人工重跑整批流程。
- 圖片 signed URL 可過期，刪除工作集中清理。

## 建議預算分級

| 階段 | 建議 |
| --- | --- |
| 開發 / Demo | 使用免費方案，資料可重建即可。 |
| 校內試辦 | 使用免費方案起步，開啟 usage alert，確認資料備份與重建方式。 |
| 正式上線 | 仍可使用免費方案；只在用量、備份、治理或服務條款需要時升級。 |
| 高流量活動 | 事前檢查圖片上限、Rate limit、Upstash commands、Supabase egress、Vercel bandwidth。 |

## 需要人工定期檢查的帳單項目

- Supabase database size、egress、Edge Function invocation。
- Vercel bandwidth、build usage、部署失敗重試次數。
- Cloudinary storage、transformations、bandwidth。
- Upstash Redis commands。
- reCAPTCHA assessments。
- Notion workspace members 與方案。
