# Project Structure Map

> [!IMPORTANT]
> **開發規範**：這份檔案用來快速對照每個檔案負責什麼。後續若有新增、刪除、拆分或搬移檔案，**請務必先更新這裡**。
> **AI 代理指令**：之後來接手此專案的 AI 代理人均應**優先閱讀此檔案以理解專案全局結構，嚴禁直接開啟大規模盲目檔案掃描**。

---

## 根目錄

- README.md：專案摘要。
- config/issue-categories.config.json：提案分類與細部權限設定唯一編輯入口，定義分類 id、顯示名稱、讀取權限、附議限制與回覆期限等詳細配置。
- config/rate-limits.config.json：限流閾值、各內容圖片數量與圖片壓縮設定編輯入口，定義提案／公告／留言上傳張數，以及圖片寬高與 WebP 品質等參數。
- structure.md：本檔案，維護全站模組結構地圖。
- AGENTS.md：給 AI 代理人的開發規範與維護要求。
- package.json：專案名稱、依賴與 npm scripts 入口，包含前端型別 / lint / build、Edge Functions Deno check、架構測試、Supabase 本機啟動／重置／lint 與僅供部署使用的快速 Vite build。
- package-lock.json：套件版本鎖定檔。
- index.html：Vite 入口 HTML，掛載 Vue App，載入 favicon / PWA meta，並由 Vite env 注入標題。
- eslint.config.js：ESLint 規則與 Vue / TypeScript 的 lint 設定。
- vercel.json：Vercel 前端部署設定，包含靜態資源快取規則（assets 長快取、sw.js 不快取）與 SPA fallback rewrite。
- supabase/config.toml：Supabase 本機與部署設定，暴露 Supabase 預設 schema、`app_api` 與供 service role Edge Functions 使用的 `app_private` schema，並設定登入同步、Cloudinary webhook、outbox worker、刪除工作與維護清理 Edge Functions 的 JWT 驗證模式。
- .env.example：本機與部署環境變數範本，包含 App 名稱、短名稱、Firebase Auth / FCM public config、Supabase public config 與選配 App Check 開關 / site key。
- .gitignore：Git 忽略規則。
- postcss.config.cjs：PostCSS 設定，啟用 Tailwind 與 Autoprefixer。
- tailwind.config.cjs：Tailwind 主題、色彩與字型設定。
- tsconfig.json：TypeScript 專案引用總配置。
- tsconfig.app.json：前端 App 程式碼的 TypeScript 設定，包含 Vite 與 PWA client 型別。
- tsconfig.node.json：Node / Vite 設定檔的 TypeScript 設定。
- vite.config.ts：Vite 主設定，包含 Vue plugin、PWA manifest / service worker、HTML env 注入與 @ 路徑別名。
- skills-lock.json：Copilot skills 相關鎖定檔，讓技能載入保持一致。

---

## Supabase 後端服務 (supabase/)

- supabase/config.toml：Supabase 本機與部署設定，暴露 Supabase 預設 schema、`app_api` 與供 service role Edge Functions 使用的 `app_private` schema，並設定登入同步、受控 action、Cloudinary webhook、outbox worker、刪除工作與維護清理 Edge Functions 的 JWT 驗證模式。
- supabase/migrations/202607050001_supabase_baseline.sql：單一 Supabase 基線 migration，完整建立 schema、RLS、資料表、RPC、trigger、Realtime publication、索引、冪等、清理排程、圖片時效網址與維護重試設定。
- supabase/migrations/202607050002_fix_notification_realtime_rls.sql：讓通知 Realtime 的 RLS 依部署 healthcheck 保存的 Firebase project ID 驗證 token audience，確保重置後仍可正常訂閱。
- supabase/migrations/202607050003_complete_platform_workflows.sql：完善附議達標與到期狀態、工作租約回收、永久統計計數及圖片刪除即時喚醒機制。
- supabase/migrations/202607050004_dashboard_and_read_efficiency.sql：以資料庫聚合快照提供管理統計、維護狀態與分類成果，避免大量資料傳輸。
- supabase/functions/backendAction/index.ts：前端受控 action HTTP 入口，集中 CORS、Firebase 驗證、使用者角色查詢、healthcheck、action 分派與冪等保護，不直接承載各領域資料流程。
- supabase/functions/backendAction/types.ts：受控 action 共用 Supabase client、身份與 JSON record 型別。
- supabase/functions/backendAction/utils.ts：受控 action 共用 cursor、時間、數值、布林與台北日界限工具。
- supabase/functions/backendAction/validation.ts：受控 action 共用標題、正文、留言、搜尋與審核原因長度驗證。
- supabase/functions/backendAction/auth.ts：管理員權限檢查與目前使用者角色回應。
- supabase/functions/backendAction/users.ts：使用者登入紀錄、Cloudinary 頭像快取、舊版頭像清理排程與批次讀取 action。
- supabase/functions/backendAction/uploads.ts：Cloudinary 上傳 session、上傳完成確認、Markdown 圖片附加標記、圖片 URL 解析與外部圖片清理 action。
- supabase/functions/backendAction/issue-shared.ts：提案讀取權限、作者欄位清洗、提案/留言回應正規化與單筆提案查詢 helper。
- supabase/functions/backendAction/issues.ts：提案 action 分派器，依 read / write / comments 子模組處理。
- supabase/functions/backendAction/issue-read.ts：提案列表、搜尋、我的提案、已附議 id 與私密作者資料讀取；審核類別在查詢階段合併公開狀態與本人可讀私密狀態，避免分頁後過濾漏資料。
- supabase/functions/backendAction/issue-create.ts：新增提案、分類審核狀態、作者私密保存、限流與建立通知/同步事件。
- supabase/functions/backendAction/issue-moderation.ts：管理員提案狀態調整、審核退回原因、期限更新與狀態通知事件。
- supabase/functions/backendAction/issue-support.ts：提案附議/取消附議、附議數同步事件與達標通知事件。
- supabase/functions/backendAction/issue-delete.ts：提案硬刪除與刪除通知/同步事件。
- supabase/functions/backendAction/issue-comments.ts：提案留言分頁、新增、刪除、留言權限與留言通知事件。
- supabase/functions/backendAction/announcements.ts：公告 action 分派器，依 read / write / comments 子模組處理。
- supabase/functions/backendAction/announcement-shared.ts：公告回應正規化與 cursor helper。
- supabase/functions/backendAction/announcement-read.ts：公告列表、排序 cursor 與單筆公告讀取。
- supabase/functions/backendAction/announcement-write.ts：管理員公告新增、編輯、硬刪除與公告按讚 action。
- supabase/functions/backendAction/announcement-comments.ts：公告留言分頁、新增、刪除與管理員通知事件。
- supabase/functions/backendAction/notifications.ts：App 內通知分頁、閱讀游標、Web Push token 與分類推播偏好 action。
- supabase/functions/backendAction/dashboard.ts：管理員統計資料、同步/通知/推播/清理異常、最近維護排程結果彙整與分類使用概況。
- supabase/functions/syncUser/index.ts：Firebase 登入後同步使用者 custom claim 與 Supabase app role 的 Edge Function，依 ADMIN_EMAILS 將使用者角色寫入 user_roles，與受控 action 共用登入資格驗證。
- supabase/functions/cloudinaryWebhook/index.ts：Cloudinary 上傳完成 webhook，限制 POST、驗證簽章並安全解析 payload 後將 pending upload 轉為 ready。
- supabase/functions/outboxWorker/index.ts：Outbox worker wake-up endpoint，限制 POST 並驗證 secret 後批次 claim pending events，依固定事件規格建立廣播、管理員或作者通知，依收件人與推播偏好送出 FCM 並記錄送達結果，同步 Notion 狀態、留言、附議數與刪除標記。
- supabase/functions/processDeletionJobs/index.ts：外部資源刪除工作入口，限制 POST 並驗證 secret 後處理 Cloudinary / Notion 清理，保留失敗的可重試 metadata。
- supabase/functions/maintenanceCleanup/index.ts：維護清理手動入口，限制 POST 並驗證 secret 後呼叫資料庫清理 RPC；日常清理由 Supabase cron 直接執行同一 RPC。
- supabase/functions/_shared/env.ts：Edge Functions 環境變數讀取 helper。
- supabase/functions/_shared/http.ts：Edge Functions 共用 CORS、POST method guard、JSON / text response、JSON body 解析與錯誤狀態對應 helper。
- supabase/functions/_shared/firebase-auth.ts：Edge Functions 共用 Firebase ID token lookup、校內網域、email verified 與使用者身份正規化 helper。
- supabase/functions/_shared/cloudinary.ts：Cloudinary signed authenticated upload、signed delivery URL、遠端圖片匯入、雜湊與 asset 刪除 helper。
- supabase/functions/_shared/database.ts：Edge Functions 共用的 Supabase schema 型別，明確列出目前使用的 app_api / app_private table、row 與 RPC 欄位供 Deno 檢查。
- supabase/functions/_shared/google-oauth.ts：Edge Functions 使用 `npm:google-auth-library` 取得並快取 Google OAuth access token，供 Firebase custom claims 與 FCM HTTP v1 使用。
- supabase/functions/_shared/issue-categories.ts：由提案分類 config 產生的 Edge Functions 分類權限與行為常數，供受控 action 套用審核、私密讀取、作者隱藏與留言規則。
- supabase/functions/_shared/fcm.ts：FCM HTTP v1 發送 helper，不依賴 Node Firebase Admin SDK。
- supabase/functions/_shared/notion.ts：Notion 同步 helper，以中文欄位寫入提案與公告資料、管理受控正文區塊、將 Cloudinary 圖片上傳為 Notion 檔案，並在刪除時只標記頁面狀態。
- supabase/functions/_shared/rate-limits.ts：由 rate limit config 產生的 Edge Functions 限流常數，供受控 action 套用提案、留言與圖片上傳頻率限制。
- supabase/functions/_shared/upstash-rate-limit.ts：Upstash Redis REST 固定時間窗限流 helper，集中計數 key、TTL 與服務不可用錯誤處理。
- supabase/functions/_shared/webhook.ts：Supabase / Cloudinary webhook shared secret 與簽章驗證 helper。

---
## src 入口與路由

- src/main.ts：Vue App 入口，初始化全域 resume、PWA 更新與 session 後掛載 router。
- src/App.vue：最上層殼，啟動期間先顯示 AppStartupScreen，準備完成後將頁面內容包進 AppShell，並掛載 App 安裝 / 瀏覽器引導對話框。
- src/sw.ts：PWA service worker，navigation 使用五秒 NetworkFirst 並在離線時 fallback precached index.html；Auth、版本檢查使用 NetworkOnly，哈希 JS/CSS、WebP encoder WASM、圖示與 Cloudinary 圖片使用一年期 CacheFirst，外部字型 CSS 使用 StaleWhileRevalidate、字型檔使用一年期 CacheFirst，並保留 FCM Web Push 背景通知與通知點擊導回頁面。
- src/router/index.ts：Vue Router 組合入口，掛載登入、提案、公告與管理員 route modules，切換路由前 abort 上一頁 request scope，並等待 session ready 後處理登入 / 管理員 redirect。
- src/router/authRoutes.ts：登入頁路由設定，支援 `/login` 與受保護頁面 redirect 回跳。
- src/router/issueRoutes.ts：提案看板路由設定，將 `/` 與 `/issues` 導向預設提案分類，並驗證 `/issues/:filter` 與 `/issues/:filter/:issueId`；頁面元件以 lazy import 載入以降低初始 bundle。
- src/router/announcementRoutes.ts：公告頁與公告詳情路由設定，支援 `/announcements` 與 `/announcements/:announcementId`，頁面元件 lazy import。
- src/router/changelogRoutes.ts：更新紀錄頁路由設定，支援 `/changelog` 並以 route name `changelog` lazy import ChangelogView。
- src/router/adminRoutes.ts：管理員統計頁路由設定，Dashboard 頁面 lazy import。
- src/views/LoginView.vue：登入頁視圖，沿用平台登入面板並交由 router redirect 在登入後回到原目標頁。
- src/views/IssueBoardView.vue：提案看板路由視圖；session 恢復期間先顯示提案骨架，已登入則以滿高容器掛載看板，讓列表區獨立捲動。
- src/views/DashboardView.vue：管理員維運工作台，使用 `usePlatformDashboard` 與 `useDashboardMetrics` 呈現系統狀態、Notion 待同步、同步異常、維護排程、平台成果與分類使用概況；成功畫面不提供手動重新整理，空狀態與錯誤狀態使用共用 EmptyStatePanel。
- src/views/AnnouncementsView.vue：公告頁視圖，使用 `useAnnouncementManagement` 與 AnnouncementControls 組合公告列表排序、手動重新整理、底部自動載入更多、空狀態、公告骨架載入、管理員編輯對話框、詳情對話框與刪除確認。
- src/views/ChangelogView.vue：更新紀錄時間軸視圖，讀取靜態 changelog entries，於頁首顯示累計更新次數，並呈現左側串接圓點與垂直線、右側標題、版本號、日期時間與純文字 bullet；未登入與無資料使用共用 EmptyStatePanel。
- src/style.css：全域樣式與目前實際使用的共用 UI class 定義，包含避免低於 12px 的輔助文字、14–16px 正文排版層級、所有 button / link 與共用 pressable / content-trigger / nav-item 的手機按壓回饋、focus-ring、按鈕/欄位/選單/分段控制樣式、行動裝置 tap highlight 禁用，以及依 micro / panel 節奏統一的 popover、notification 與 dialog 轉場。

---

## src/components (UI 呈現元件層)

### 通用 UI 元件 (src/components/ui/)
共用、無業務邏輯、純展示元件，可被任何場景複用：

- LoadingSpinner.vue：可設定尺寸的 loading spinner SVG 元件（雙層環 + 自訂縮放脈動動畫）。
- AppIcon.vue：共用線性圖示元件，集中 chart、comment、close、edit、image、lock、send、warning、inbox 等常用 UI icon，降低元件內嵌 SVG 重複。
- EmptyStatePanel.vue：通用空狀態 / 錯誤狀態面板，統一 icon（支援 chart、comment、lock、warning、inbox）、標題、描述與可選重試按鈕，用於看板分頁、公告、留言與 Dashboard。
- MarkdownImageEditor.vue：Markdown 文字 + 圖片預覽編輯器展示元件，只處理 toolbar、縮圖、預覽與輸入事件；內建 slash 指令選單與 Markdown 表格 block 邊界控制，上傳與儲存流程仍由各自 composable / parent 控制。
- MarkdownToolbar.vue：Markdown 編輯器專用格式化工具列，集中粗體、斜體、標題、清單、表格、水平線等功能按鈕。
- MarkdownImagePreviews.vue：Markdown 編輯器專用圖片縮圖預覽面板，配合響應式佈局調整縮圖顯示大小。
- TableGridPicker.vue：Word 式表格尺寸選取元件，提供 5x5 的格狀維度選取視覺反饋。
- VisualTableEditor.vue：Markdown 表格視覺化編輯元件，提供直覺的儲存格文字編輯與實時 Markdown 雙向同步。
- PageLoadFailure.vue：頁面載入超過五秒或離線時顯示顏文字、網路問題訊息與重新整理按鈕的共用 fallback。
- SkeletonTable.vue：表格載入時的 animate-pulse 佔位列，動態匹配 grid 欄位配置。
- SkeletonAnnouncementList.vue：公告列表載入骨架，比對作者、標題、摘要與互動按鈕排列，降低初次載入版面跳動。
- SkeletonCommentList.vue：提案與公告留言區共用載入骨架，比對頭像、作者、時間與留言文字排列。
- SkeletonDashboard.vue：管理員 Dashboard 載入骨架，比對維運狀態卡、維運清單、分類表與成果摘要。
- TrashIcon.vue：共用無填色垃圾桶圖示。
- ShareIcon.vue：分享節點圖示，供詳情對話框 action row 與 footer 按鈕共用。
- DetailActionButton.vue：詳情頁底部共用文字動作按鈕，統一分享、讚、編輯與刪除等 action 的 icon + label 呈現。
- UserAvatar.vue：大頭貼顯示（圖片 / 匿名首字 fallback，支援 sm / md / lg 三種尺寸）。
- DecorativeGlow.vue：背景裝飾性雙色模糊光暈（emerald + indigo）。
- GoogleLoginButton.vue：Google 登入按鈕（含 loading spinner 狀態）。
- DialogOverlay.vue：Modal 共用背景遮罩（含 backdrop-blur、點擊關閉、Teleport），以動態 viewport 扣除 edge-to-edge safe-area 後提供正確可用高度，並支援一般響應式、四周留白、無留白與自訂 z-index 層級。
- DetailDialogShell.vue：提案與公告詳情共用的全螢幕對話框骨架，集中焦點管理、捲動鎖定、獨立分層進出場、桌機雙欄、手機內容/留言分頁與欄位間隔，並只掛載目前 viewport 對應的內容區避免重複讀取。
- SearchHighlight.vue：搜尋結果文字高亮元件，依關鍵字標示標題命中片段。

### 應用元件 (src/components/)

- src/components/AppShell.vue：全站外框與 edge-to-edge 頁首，使用 top safe-area inset 延伸到 PWA 狀態列；桌機放置品牌圖示、固定主導航（提案／公告／我的提案）與通知/設定，手機頁首改顯示目前主區塊標題，底部導覽固定為提案、公告、我的提案、通知與設定。
- src/components/AppStartupScreen.vue：App 啟動時的全螢幕 Loading Gate，使用品牌標誌、App 名稱、安全區 padding 與柔和載入動畫，覆蓋 auth 恢復與必要 session 初始化。
- src/components/AuthorAvatar.vue：作者頭像 wrapper，依 author uid 查詢最新快取頭像，並以內容上的舊頭像 URL 作為 fallback。
- src/components/LoginPanel.vue：校內 Google 帳號登入面板，供登入頁使用並維持原本未登入視覺。
- src/components/AppInstallPromptDialog.vue：App 安裝與瀏覽器引導對話框，沿用共用 DialogOverlay 與提示型對話框排版，依 mode 呈現 in-app browser 提醒、Android 原生安裝按鈕或 iOS Safari 手動步驟。
- src/components/AppUpdatePromptDialog.vue：偵測到遠端 build 版本較新時顯示不可略過的更新提示；視覺、焦點與捲動行為對齊其他提示型對話框，並阻止舊前端繼續呼叫可能已變更的後端介面。
- src/components/SettingsPanel.vue：登入 / 設定面板 UI；session 恢復或登入進行中時在頭像位置顯示小型進度，完成後以頭像開啟「設定」面板，集中顯示目前帳號、切換帳號入口、單裝置推播通知狀態、通知類型開關與登出操作。
- src/components/SettingsPanelContent.vue：設定面板共用內容區，供桌機頭像 popover 與手機全螢幕 Dialog 共用，統一帳號切換、推播通知、通知類型開關、更新紀錄與管理員統計入口呈現。
- src/components/PushPermissionPromptDialog.vue：登入後首次詢問推播權限的提示對話框；以本機 localStorage 記錄每個帳號在目前裝置是否已詢問過，允許使用者稍後再到設定開啟。
- src/components/ConfirmDialog.vue：通用確認對話框，沿用共用 DialogOverlay、提示型文字層級、焦點管理與捲動鎖定，固定顯示於一般詳情對話框之上。
- src/components/ToastViewport.vue：全域 toast 顯示容器，統一呈現成功、資訊與錯誤提示，層級高於 modal dialog。
- src/components/SegmentedControl.vue：共用分段選項元件，用於分類、狀態與留言模式切換。
- src/components/ListUpdatePrompt.vue：列表更新提示列，供提案與公告頁在偵測到新內容時提示使用者手動刷新並沿用既有分頁讀取流程。
- src/components/VoteButtons.vue：附議 / 取消附議按鈕展示層，實際 optimistic UI 與附議流程委派給 `useVoteSupport`。
- src/components/MarkdownRenderer.vue：將 Markdown 渲染為經 DOMPurify 過濾的安全 HTML，圖片支援尺寸屬性、lazy loading 與預留顯示空間以降低 layout shift。
- src/components/NotificationBell.vue：頁首右上角 App 內通知中心，使用手機全螢幕面板／桌機右側 popover 呈現未讀數、通知類型圖示、載入與空狀態、分段載入及打開即已讀行為，並依通知目標路由至提案或公告詳情；推播設定統一由頭像設定面板管理。
- src/components/MarkdownMediaContent.vue：Markdown 圖文分離共用內容元件，圖片置頂以兩欄寬度水平捲動、文字置於下方，支援點圖全螢幕預覽。
- src/components/CommentThreadPanel.vue：提案與公告共用留言面板，統一留言列表、載入 / 錯誤 / 空狀態、重新整理、底部自動載入更多、浮動輸入面板與刪除確認。
- src/components/CompactActionMenu.vue：可設定文字與項目的精簡三點操作選單，供公告列表與留言刪除等管理入口共用。
- src/components/AnnouncementControls.vue：公告列表頂部控制列，對齊提案看板的工具按鈕樣式，提供排序選單、手動重新整理與管理員新增公告操作。
- src/components/AnnouncementTable.vue：公告表格列表容器，比照提案看板設計表格結構，負責渲染公告列表行並轉發開啟詳情、編輯與刪除事件。
- src/components/AnnouncementTableRow.vue：單則公告表格列表項目，呈現公告標籤、發布者、標題、發布日期、按讚與留言互動按鈕以及管理員選單。
- src/components/AnnouncementDetailsDialog.vue：公告全文全螢幕對話框，對齊提案詳情的桌機左右欄與手機分段切換結構，組合公告內容、icon 操作列與留言區。
- src/components/AnnouncementDetailContent.vue：公告詳情內容區，對齊提案詳情的內容欄，呈現標題、meta 與 Markdown 圖文分離內容。
- src/components/AnnouncementDetailActions.vue：公告詳情操作列，使用共用 DetailActionButton 以文字按鈕呈現讚、分享、編輯與刪除。
- src/components/AnnouncementEditorDialog.vue：管理員公告新增/編輯對話框，沿用 Markdown 圖片延遲上傳流程，內容輸入與圖片預覽使用共用 MarkdownImageEditor。
- src/components/AnnouncementComments.vue：公告留言區資料 wrapper，串接公告留言 composable 與共用 CommentThreadPanel。
- src/components/CommentItem.vue：單則留言呈現元件，負責作者、官方回覆標籤、三點刪除選單與 Markdown 內容顯示。
- src/components/CommentComposer.vue：留言浮動輸入面板，負責留言撰寫、預覽、圖片本機壓縮預覽與送出時上傳事件。
- src/components/IssueDetailContent.vue：提案詳情內容區共用元件，統一桌機與手機的標題、作者與 Markdown 圖文分離內容呈現。
- src/components/IssueDetailSupportFooter.vue：提案詳情附議進度與日期資訊 footer，統一桌機與手機的分享、附議、管理員刪除按鈕、進度條與期限資訊。

### 看板與列表元件

- src/components/IssueBoard.vue：提案看板主體。調用 `useIssueBoardData` 與 `useIssueRouteDialog`，以固定控制列與隱藏捲軸的獨立捲動列表組合看板狀態，支援排序、手動重新整理與底部自動載入更多，並在更新詳情路由前先用列表資料立即開啟對話框。
- src/components/BoardControls.vue：提案看板頂部控制列，包含頁內提案分類 segmented control、搜尋工具面板、整合狀態與排序之篩選工具選單、低層級重新整理按鈕與新增提案按鈕。
- src/components/IssueAdminMenu.vue：管理員狀態調整下拉選單展示層，供列表列與詳情操作使用；狀態更新流程委派給 `useIssueAdminStatus`。
- src/components/IssueTableRow.vue：列表視圖單筆提案列展示層，桌面動態 grid、手機收折為單行精簡列；共用 `useIssueItemController` 處理提案互動狀態與開啟詳情事件。
- src/components/IssueBoardTable.vue：列表視圖容器，含欄位標題列與提案列渲染；載入與分頁切換期間顯示 SkeletonTable。
- src/components/IssueDetailsDialog.vue：提案全文詳細對話框。採用 `useIssueDisplay` 呈現附議進度與期限，公共議題對一般人隱藏作者，自己提案則顯示作者，作者或管理員可從詳情 footer 刪除提案。
- src/components/IssueComments.vue：提案留言區資料 wrapper，串接提案留言 composable 與共用 CommentThreadPanel。
- src/components/IssueComposer.vue：新增提案表單對話框展示層，表單驗證、圖片上傳與送出流程委派給 `useIssueComposerForm`，內容輸入與圖片預覽使用共用 MarkdownImageEditor。

---

## src/composables (狀態與控制邏輯層)

- src/composables/useIssueBoardData.ts：看板 orchestrator，組合目前狀態 bucket、搜尋、使用者提案、全域分頁、文件標題與手動重新整理等專責 composable，依目前螢幕高度決定列表讀取批量。
- src/composables/useIssueBoardPagination.ts：看板全域模式分頁 helper，處理搜尋與我的提案在前端分頁時的目前頁、總頁數與顯示清單。
- src/composables/useUserIssuesData.ts：我的提案讀取 helper，以一次性讀取封裝私有公共提案與一般提案合併、依螢幕高度分段顯示、載入狀態與支援狀態更新。
- src/composables/useIssueRouteFilter.ts：提案路由分類同步 helper，將 `/issues/:filter` 與 `/issues/:filter/:issueId` 轉成全域 activeFilter。
- src/composables/useIssueRouteDialog.ts：提案 id 路由詳情 helper，支援列表資料預填後讀取單筆提案，並處理無權限/不存在 toast 與返回列表。
- src/composables/useDocumentTitle.ts：文件標題同步 helper，依目前看板分類更新並在卸載時還原。
- src/composables/useAppInstallPrompt.ts：PWA 安裝提示狀態管理，處理 standalone 判斷、beforeinstallprompt、iOS Safari 手動引導、in-app browser 優先權與 sessionStorage 關閉記錄。
- src/composables/useAppUpdate.ts：手動註冊無快取 service worker，啟動時檢查一次 `version.json`，並管理強制更新提示狀態。
- src/composables/useTimedMessage.ts：短效訊息 helper，負責 toast 觸發訊息的逾時清空。
- src/composables/useMinimumLoading.ts：將真實載入狀態與至少 150ms 的切換回饋合併，供快取命中的提案分頁、公告與留言 skeleton 共用。
- src/composables/useLoadingTimeout.ts：監看頁面 loading，超過指定時間後切換到可重試的網路異常 fallback。
- src/composables/useNetworkStatus.ts：共用瀏覽器線上 / 離線狀態監聽，供載入逾時與讀取錯誤提示判斷目前連線狀態。
- src/composables/useAppResume.ts：集中監聽 pageshow 與 visibilitychange；iOS PWA 從背景或 bfcache 恢復時 abort 舊 request scope，供通知等即時狀態重新連線使用。
- src/composables/useAppStartupGate.ts：合併最短啟動畫面時間、router readiness、authChecking、userLoading、appInitializing 與 appReady，控制 AppStartupScreen 顯示時機。
- src/composables/useIssueBuckets.ts：依使用者、權限、分類、狀態、排序與頁面大小快取提案分段列表；使用一次性讀取、手動重新整理與底部自動載入更多，並以版本 token 忽略快速切換後晚到的結果。
- src/composables/useInfiniteScroll.ts：共用 IntersectionObserver 底部哨兵 helper，供提案、公告與留言列表接近底部時自動載入更多。
- src/composables/useIssueSearch.ts：提案搜尋狀態管理，包含 700ms debounce、最短 3 字門檻、最多 50 筆 n-gram 候選與 5 分鐘結果快取。
- src/composables/useIssueDisplay.ts：單筆提案視覺運算（作者實名僅對 admin 顯示、剩餘天數運算、過期自動駁回）。
- src/composables/useIssueSupport.ts：附議相關運算（supportProgressStyle、supportRemainingLabel、handleSupport 切換邏輯）。
- src/composables/useIssueItemController.ts：列表列共用的提案項目控制器，組合顯示、附議、刪除、開啟詳情事件與管理員狀態 toast。
- src/composables/useIssueComposerForm.ts：新增提案表單流程，負責驗證、Markdown 圖片上傳、送出後端 action、失敗清理與表單重置。
- src/composables/useVoteSupport.ts：附議按鈕流程，負責登入檢查、optimistic UI、附議/取消附議 action 與錯誤回復。
- src/composables/useIssueAdminStatus.ts：管理員提案狀態更新流程，負責下拉開關、狀態限制、審核 action 與結果事件。
- src/composables/useStatusStyling.ts：提案狀態對應 Tailwind class（支援 table-row / dialog / dot / button-text 四種變體）。
- src/composables/useDeleteIssue.ts：刪除提案的確認對話框流程（isDeleteDialogOpen / confirmDelete / performDelete）。
- src/composables/useBodyScrollLock.ts：對話框開啟時鎖定 body 捲動，並避開 iOS PWA 固定定位偏移造成的全螢幕 Dialog 截斷。
- src/composables/useDialogThemeColor.ts：追蹤手機全螢幕 Dialog 疊加狀態，開啟期間同步 iOS PWA theme-color 為 Dialog surface，最後一層關閉後恢復頁面色。
- src/composables/useDialogFocus.ts：對話框焦點管理與 Esc 關閉處理。
- src/composables/useDropdownPosition.ts：彈窗與下拉選單的 fixed 定位與視窗滾動/縮放事件處理邏輯元件。
- src/composables/useFilter.ts：跨元件共享目前提案篩選狀態，實際值由提案路由同步。
- src/composables/useSession.ts：Firebase Auth session 公開 API 與初始化入口，明確使用 local persistence 保存登入，組合登入、驗證、必要使用者資料初始化、appReady 狀態與 router guard 等待入口。
- src/composables/sessionTypes.ts：Session state、啟動 readiness 與驗證結果型別。
- src/composables/sessionDebug.ts：開發模式 auth debug logging helper。
- src/composables/sessionValidation.ts：校內網域、email verified、Google provider 與 token claims 驗證 helper；優先使用 Firebase 有效快取 token，避免每次開啟都強制刷新。
- src/composables/sessionAuthActions.ts：Google popup/redirect 登入與登出流程，登入時優先在點擊當下開啟 popup，遇到 PWA 或瀏覽器不支援時改用 redirect。
- src/composables/sessionEffects.ts：登入後副作用，包含 `user_supported_issues` 附議索引一次性讀取、平台拜訪紀錄與 Google 頭像快取。
- src/composables/useAuthorAvatar.ts：作者頭像解析與一年期本機快取 composable，批次將畫面上拿得到的 author uid 轉為 Cloudinary 快取頭像 URL。
- src/composables/useToast.ts：全域 toast 狀態與顯示/關閉控制。
- src/composables/useShareUrl.ts：分享 URL 複製 helper，優先使用 Clipboard API 並在失敗時 fallback 到 textarea copy。
- src/composables/useMarkdown.ts：Markdown 解析與 DOMPurify 消毒，支援 `![alt|寬x高](url)` 圖片尺寸語法、清單續行顯示修正，並輸出 lazy/decode 屬性。
- src/composables/useResolvedMarkdown.ts：解析 Markdown 中的 `srp-upload://` 圖片，透過 Cloud Function 換取 preview/full signed URL 後供渲染元件使用。
- src/composables/useNotifications.ts：以共享通知資料源合併 broadcast/admin/user 三來源通知、分來源 cursor 載入更多、閱讀游標與紅點狀態；集中管理 realtime 訂閱並將新通知增量合併到本地分頁，避免覆蓋已載入內容。
- src/composables/useNotificationNavigation.ts：通知目標導航流程，先經受控讀取確認公告或提案仍存在且目前使用者可讀，再使用後端回傳的真實分類開啟詳情。
- src/composables/useContentUpdatePrompt.ts：監聽通知 realtime 中的新增提案與公告事件，只維護列表有新內容提示狀態，資料本體仍交由既有 backendAction 分頁刷新。
- src/composables/usePushNotifications.ts：Web Push 推播偏好管理，負責瀏覽器支援與權限狀態、目前裝置 service worker token 註冊 / 關閉、通知分類偏好、跨裝置狀態校正與前景訊息 toast。
- src/composables/useAnnouncements.ts：公告列表依排序快取分段讀取、依螢幕高度決定讀取批量、手動重新整理、底部自動載入更多與載入 / 錯誤狀態管理。
- src/composables/useAnnouncementManagement.ts：公告頁管理流程，整合公告列表讀取、id 路由選取、單筆讀取、分享、編輯、新增、背景刪除與明確讚狀態。
- src/composables/useAnnouncementComments.ts：公告留言分頁讀取、載入更多、重新整理、新增、局部刪除與權限判斷狀態管理，使用留言區自己的請求 scope 避免路由切換誤判空狀態。
- src/composables/useImageUpload.ts：圖片處理 composable，協調本機選圖預覽與上傳狀態，並將前端 WebP 輸出尺寸送入上傳 session。
- src/composables/useMarkdownImageUpload.ts：Markdown 編輯器圖片流程，選圖時立即完成壓縮與 preview URL 建立，送出時並行上傳已處理圖片，並負責失敗清理與 `![alt|寬x高]()` 語法組合。
- src/composables/useIssueComments.ts：提案留言分頁讀取、載入更多、重新整理、送出、局部刪除、權限判斷與錯誤狀態，使用留言區自己的請求 scope 避免路由切換誤判空狀態。
- src/composables/usePlatformDashboard.ts：管理員 Dashboard 資料載入狀態與錯誤管理，保留 stats 與 operations computed 給畫面使用。
- src/composables/useDashboardMetrics.ts：管理員 Dashboard 資料轉換 helper，計算成果摘要、維運狀態卡、維運清單、最近異常與分類提案/留言對照。

---

## src/generated / src/constants / src/lib / src/types

- src/generated/issue-categories.ts：由提案分類 config 產生的前端分類、權限模板 schema 與模板行為 helper。
- src/constants/categories.ts：提案分類 generated config 的前端薄包裝，提供路由分類選項、標籤與分類驗證。
- src/constants/statuses.ts：提案狀態選項、標籤與管理員可調整狀態。
- src/constants/changelog.ts：手動維護的更新紀錄靜態資料，使用含 version/date/time/items 的 ChangelogEntry / ChangelogBullet 格式，不接 Git history 或後端。
- src/lib/firebase.ts：Firebase 初始化、環境變數檢查與 Auth / FCM 匯出，並在明確啟用時初始化 reCAPTCHA Enterprise App Check。
- src/lib/supabase.ts：Supabase client 初始化，使用 Firebase ID token 作為 access token，Data API 預設指向 `app_api` schema。
- src/lib/request-id.ts：產生 operation request id，供建立與異動 action 在重試時維持冪等。
- src/lib/request.ts：統一 safeFetch、任意 Promise timeout、AbortController 串接、五秒讀取期限、長任務期限與錯誤格式化。
- src/lib/route-request.ts：維護目前路由的 AbortSignal，路由切換或 App resume 時取消上一批尚未完成的讀取。
- src/lib/reconnect.ts：重試 / 重新載入前的共用連線重置 helper，集中中斷目前路由請求並交還事件迴圈。
- src/lib/issue-status.ts：提案狀態推導與附議期限訊息。
- src/lib/route.ts：Vue Router 單值參數正規化工具，統一處理字串與字串陣列 route params。
- src/lib/page-size.ts：依目前 viewport 高度推導列表讀取批量，並提供載入更多的最低等待時間 helper。
- src/lib/in-app-browser.ts：依 user agent 辨識 LINE、Meta、TikTok 與 WeChat 等常見 App 內建瀏覽器的純函式。
- src/lib/pwa-install.ts：PWA 安裝引導純函式，判斷 standalone、touch-first 裝置與 iOS Safari 手動教學條件。
- src/lib/format.ts：共用格式化工具（formatDate、formatDateOnly、stripMarkdownImages 移除 ![]() 語法、getLeadingMarkdownImage 解析開頭圖片、truncatePreview 截斷前 N 字元）。
- src/lib/caret.ts：textarea 游標座標計算工具，供 Markdown 編輯器快捷指令選單定位使用。
- src/lib/markdown-images.ts：純函式 Markdown 圖片解析工具，支援一般圖片與 `![alt|寬x高](url)` 尺寸語法，供提案詳情圖文分離使用。
- src/lib/markdown-editor-commands.ts：Markdown 編輯器工具列與快捷指令共用的指令定義、圖示、標題與搜尋關鍵字。
- src/lib/markdown-tables.ts：純函式 Markdown 表格解析工具，統一編輯器的表格 block 偵測、游標限制與視覺化表格編輯邊界。
- src/lib/image-processing.ts：瀏覽器圖片處理純函式，驗證來源大小與像素，優先使用原生 canvas 以 0.85 品質輸出 WebP，Safari 等無原生 WebP encoder 的瀏覽器動態載入 WASM fallback；最長邊限制 2000px，並逐步縮小尺寸直到低於 800 KB。
- src/lib/search.ts：搜尋文字正規化工具，供搜尋 composable 與高亮 UI 共用。
- src/types/index.ts：專案核心型別定義，包含提案、Dashboard stats / operations、路由分類、留言、公告、公告留言、新通知模型、ChangelogEntry / ChangelogBullet 與 Markdown 圖片資料型別。
- src/types/pwa.d.ts：補充 BeforeInstallPromptEvent 型別，供 PWA 安裝提示 composable 使用。

---

## src/services (受控資料服務層)
## src/services (受控資料服務層)

- src/services/issues.ts：API Gateway 入口，統一 re-export 提案讀寫子服務。
- src/services/backend-action.ts：Supabase Edge Function `backendAction` 呼叫工具，統一 action/payload 格式、timeout 與 abort signal。
- src/services/supabase-function-error.ts：Supabase Edge Function 非 2xx 回應解析 helper，優先讀取後端 JSON / text 錯誤內容。
- src/services/session-role.ts：登入後向後端查詢目前使用者角色，避免前端保存管理員 email 清單。
- src/services/issues-core.ts：提案 read service 相容匯出入口與單筆提案讀取 helper，實際常數、錯誤、工具、正規化與查詢 builder 拆到子檔。
- src/services/issues-constants.ts：提案服務常數，包含分頁大小、期限天數與 bucket 狀態。
- src/services/issues-errors.ts：後端錯誤轉使用者可讀訊息 helper。
- src/services/issues-utils.ts：提案服務純工具，包含排序、分塊與日期運算 helper。
- src/services/issues-normalize.ts：提案資料正規化、預設值、bucket 判定、cursor、支援狀態與 page result helper。
- src/services/issues-query.ts：提案 bucket 查詢參數相容 helper。
- src/services/issues-read.ts：提案唯讀 service 匯出入口，只 re-export 分頁搜尋、使用者提案、私有作者與留言讀取子服務。
- src/services/issues-read-pages.ts：提案排序分頁讀取、載入更多與標題搜尋讀取，並在服務邊界正規化後端 cursor。
- src/services/issues-read-user.ts：使用者提案游標分頁與已附議提案 id 讀取。
- src/services/issues-read-private-author.ts：公共議題私有作者 metadata 讀取。
- src/services/issues-read-comments.ts：提案留言讀取、日期與 cursor 正規化。
- src/services/issues-read-shared.ts：提案 read service 共用 response 型別。
- src/services/issues-write.ts：所有寫入、附議、留言與審核異動，統一呼叫 Supabase 後端安全端點。
- src/services/notifications.ts：App 內通知來源訂閱、閱讀狀態、單裝置 Web Push token 與通知分類偏好服務；realtime channel 依 broadcast/admin/user 來源或 recipient 過濾 INSERT，並正規化通知與分頁 cursor。
- src/services/announcements.ts：公告排序分頁、單筆讀取、讚與留言異動服務，並在服務邊界正規化公告與留言分頁 cursor。
- src/services/dashboard.ts：平台 Dashboard 與登入使用紀錄服務，將後端 stats / operations response 正規化為前端 Date 型別。
- src/services/uploads.ts：Cloudinary authenticated 圖片直傳服務，向後端取得簽名 session 後直傳 Cloudinary，並提供 signed delivery URL 解析、快取與刪除 action。
- src/services/users-read.ts：作者頭像讀取服務，透過後端批次取得 uid 對應的最新快取頭像。
- src/services/users-write.ts：使用者相關寫入服務，目前負責登入後頭像快取。
- src/services/supabase-auth.ts：Supabase 登入初始化服務，登入後明確帶入 Firebase token 呼叫 `syncUser` Edge Function 補齊 custom claim 並強制刷新 token，避免半完成登入狀態。

---
## public & scripts & workflows

- public/favicon.ico：傳統瀏覽器 favicon，由目前 logo 產生。
- public/pwa-64x64.png、public/pwa-192x192.png、public/pwa-512x512.png：PWA manifest 一般圖示。
- public/maskable-icon-512x512.png：PWA maskable 圖示。
- public/apple-touch-icon-180x180.png：iOS 加入主畫面圖示。
- scripts/generate-issue-categories.mjs：從 `config/issue-categories.config.json` 產生前端、Functions 與 Supabase Edge Functions 共用的 typed 分類設定。
- scripts/generate-rate-limits.mjs：從 `config/rate-limits.config.json` 產生前端與 Edge Functions 共用的限流、圖片數量與圖片壓縮常數設定。
- scripts/issue-category-config.mjs：提案分類 config 讀取、驗證與 TypeScript 產生 helper。
- tests/architecture.test.mjs：防止舊 Firebase 資料路徑、舊部署目標、未受控後端 action、webhook 驗證與圖片解析流程回歸的靜態測試。
- .github/workflows/deploy-frontend.yml：前端相關檔案 merge 後，使用 GitHub Environment secrets 執行 Vite build 並以 Vercel CLI 部署（main → production，dev → preview）。
- .github/workflows/verify-pr.yml：PR 型別、lint、build、架構測試與 audit 驗證工作流；Edge Functions Deno 檢查保留為本機手動指令，不放入 PR workflow 以維持速度。
- .github/workflows/deploy-backend.yml：Supabase 後端部署工作流，使用 npm / node_modules 快取並先跑架構檢查，再推送 migrations、以非保留名稱設定 Edge Function secrets、部署 Supabase Edge Functions（含維護清理入口）並打正式 endpoint 做健康檢查。
- .github/workflows/reset-db.yml：手動觸發的 Supabase 資料庫重置工作流，重置資料庫架構並重新建立每日維護入口設定。
- .github/workflows/reset-cloudinary.yml：手動觸發的 Cloudinary 資源重置工作流，使用 Admin API 分批刪除目前 cloud 內 image / video / raw 的 upload、authenticated 與 private 資源。


---
