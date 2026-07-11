# 安全與隱私模型

[English](en/security.md) · [文件首頁](README.md)

本文件描述目前的信任邊界、威脅控制與採用者責任。它不是獨立安全稽核或法規認證。

## 回報安全問題

請勿建立公開 GitHub issue、discussion 或 pull request。請透過 repository 擁有者 GitHub 個人檔案所列的私人聯絡方式，提供受影響版本／commit、重現條件、影響、概念驗證與建議緩解方式。不要存取非你擁有的資料、不要中斷正式服務，也不要在報告中附上真實個資或有效 secret。

目前沒有承諾回覆時限或漏洞獎勵計畫。維護者會盡力確認、修正並協調揭露；在修正可用前請保持私密。

## 保護目標

- 私密提案與作者身分只提供給具權限的作者與管理員。
- 一般使用者不能以 UI、直接請求或 Realtime 取得管理能力。
- service role、資料庫密碼、service account、API secret 與 webhook secret 不進入瀏覽器或 Git。
- 外部 webhook、worker 與維護入口只能由可驗證來源觸發。
- 圖片引用、通知與刪除工作不能跨使用者或跨內容越權。
- 外部副作用可追蹤、可重試且盡量具冪等性。

## 信任邊界

| 區域 | 信任假設 | 控制 |
| --- | --- | --- |
| 瀏覽器 | 完全不可信 | 公開設定、輸入驗證只作體驗、後端重驗 |
| Firebase | 身分簽發者 | token signature、audience/project、email verified、網域 |
| Edge Functions | 受信任運算邊界 | action allowlist、角色、限流、冪等、schema 驗證 |
| Postgres | 主要資料與最終授權 | RLS、私有 schema、RPC、constraints、交易 |
| 第三方服務 | 有限信任的資料處理者 | 最小權限 token、簽章、專用資源、失敗隔離 |
| GitHub Actions | 部署控制面 | Environment secrets、review、固定工具版本 |

## 身分驗證與授權

Firebase ID token 證明登入身分，但不是操作權限。後端仍會檢查 email 已驗證、允許網域、使用者狀態與 server-side 管理員角色。前端的角色或顯示條件不可作為授權依據。

敏感讀寫經 `backendAction` 或專用 Function；Postgres RLS 與私有 schema 提供第二層保護。私密作者資料與公開內容分離。Realtime 事件也必須符合收件者、作者、公開狀態或管理員規則。

## 輸入、內容與圖片

- Edge action 以明確 schema 驗證未知輸入，並限制 action metadata。
- Markdown 顯示前經 sanitization；上傳引用在寫入前驗證擁有權與狀態。
- 圖片使用 authenticated upload 與 signed delivery URL；API secret 只在後端。
- 瀏覽器的壓縮與數量檢查不是安全控制，後端仍限制配額與引用。
- Webhook 驗證簽章／secret、時間與速率；失敗資源由受控工作清理。

## Secret 管理

- `VITE_*`、Firebase Web API key 與 Supabase publishable key 是公開設定，不具有管理權限。
- `SUPABASE_SERVICE_ROLE_KEY`、database password、service account JSON、Cloudinary API secret、Notion token、Redis token 與 webhook secrets 必須只在 GitHub Environment／供應商 secret store。
- 正式與開發環境使用不同 secret，權限以最小 scope 建立。
- 不在 log、issue、截圖、Notion 或前端錯誤訊息輸出 token。
- 人員異動、疑似外洩或定期檢查時輪替；輪替後驗證所有 worker 與 webhook。

## 瀏覽器與部署防護

Vercel 設定 CSP、Permissions Policy、Referrer Policy、`nosniff` 與 `frame-ancestors 'none'`。PWA service worker 與 version metadata 禁止長期快取；帶 hash 的 assets 使用 immutable cache。CSP 允許必要的 Firebase、reCAPTCHA、網路與圖片來源，新增第三方來源前要評估資料流，而非直接放寬為萬用規則。

## 隱私與資料治理

採用者是自身部署資料的管理者，必須建立隱私告知、合法依據、保留期限、資料主體請求與事故通知流程。Notion、Cloudinary、Firebase、Supabase、Vercel 與 Upstash 都可能處理 metadata 或內容；應依所在地、合約與服務區域評估跨境傳輸。

匿名顯示不是匿名收集：系統仍保存作者關聯供權限、通知與管理使用。不要將本平台描述為無法追溯的匿名系統。

## 已知限制

- 專案依賴多個第三方控制面，單一供應商錯誤可能造成部分功能降級。
- 管理員帳號具有廣泛權限，應使用強健的 Google 帳號安全與最小名單。
- Notion 副本增加資料處理面，且不是加密備份或稽核系統。
- CSP 目前允許廣泛的 HTTPS 圖片、連線與 frame 來源以支援整合，採用者可依實際網域進一步收斂。
- Repository 自動檢查不能取代滲透測試、依賴監控、雲端設定稽核與事件演練。

## 上線安全清單

- [ ] branch protection 與 Environment reviewer 已設定。
- [ ] 正式／開發資源、token 與資料完全分離。
- [ ] Firebase authorized domains、允許網域與管理員名單最小化。
- [ ] 所有 webhook 使用高熵、獨立且可輪替的 secret。
- [ ] Supabase RLS、Functions、migration 與 smoke test 已成功。
- [ ] Cloudinary 資源不是未授權公開寫入。
- [ ] log、Dashboard 與事故流程不外洩個資或 secret。
- [ ] 備份、還原、資料刪除與憑證輪替已演練。
