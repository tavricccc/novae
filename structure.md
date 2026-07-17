# Project Structure Map

變更檔案結構時同步更新本檔。先讀此地圖再搜程式，避免盲目掃全庫。

---

## 根目錄

- `README.md` — 中英文專案摘要與快速入口
- `LICENSE` / `CONTRIBUTING.md` / `SECURITY.md` / `CODE_OF_CONDUCT.md` — MIT 授權與社群政策入口
- 官方網站、完整文件、更新紀錄與分類設定產生器由 [`tavricccc/novae-website`](https://github.com/tavricccc/novae-website) 獨立維護與發布
- `config/issue-categories.config.json` — 提案分類、前端語系 `labelKey` 與分類管理權限選項的單一設定入口
- `config/api-errors.config.json` — 公開 API 錯誤碼、HTTP status 與前端 i18n key 的單一契約；由 `scripts/generate-api-errors.mjs` 產生三端型別
- `config/rate-limits.config.json` — Supabase 精確業務配額、對應 API error code 與圖片壓縮設定入口
- `config/backend-actions.config.json` — Cloudflare 原生防刷群組與 Supabase 細部業務配額映射
- `config/data-retention.config.json` — 已結案內容、通知、事件、log、暫存與維護紀錄保留期的單一設定入口
- `structure.md` / `AGENTS.md` / `design-qa.md` — 結構地圖 / 代理人規則 / 最近一次視覺比對紀錄
- `package.json` — scripts（typecheck、lint、build、check:edge、test:architecture、verify:local…）
- `index.html` / `vite.config.ts` / `vercel.json` / `eslint.config.js` / `tsconfig*.json` / `tailwind.config.cjs`
- `.env.example` / `.gitignore` / `skills-lock.json`

---

## Supabase

- `supabase/config.toml` — schema 暴露與 Functions JWT 模式
- `supabase/migrations/` — 基線 + 增量 SQL（schema／RLS／RPC／Realtime Broadcast／清理／成本限流硬化／設備與 RBAC／輸入長度、附件型別、圖片網址快取、統一 feed 分頁與集合式留言回覆讀取）；`202607150003_facilities_rbac.sql` 建立設備與 RBAC，`202607150004_backfill_legacy_platform_admins.sql` 承接既有管理員，`202607150005_clarify_role_scopes.sql` 固定平台最高權限，`202607150006_category_scoped_proposal_access.sql` 建立可複選的 config 分類管理權限，`202607150007_access_lookup_and_facility_status.sql` 加入精確帳號查找並修正設備狀態 RPC，`202607160001_configurable_retention_cleanup.sql` 由 config 控制已結案內容與營運資料保留期，`202607160002_content_revisions.sql` 建立提案／公告／設備的批次內容版本，`202607160003_harden_retention_deletion_flow.sql` 以批次 outbox 補齊保留期刪除同步並移除舊 maintenance overload，`202607160005_issue_supporter_notifications.sql` 在提案刪除前保存附議者通知名單，`202607160006_resource_efficiency_hardening.sql` 合併權限查詢、補搜尋／worker 索引、刪除工作去重、Notion 內容 hash 與舊 realtime 儲存清空，`202607160007_fix_expired_support_rejection.sql` 修復附議到期排程仍引用已移除時間欄位，`202607170001_unify_error_trace_storage.sql` 將維運失敗欄位統一為原生 UUID `error_trace_id` 並移除舊 RPC 參數，`202607180001_tune_hot_table_autovacuum.sql` 針對內容計數與平台熱點表降低 vacuum／analyze 觸發門檻，`202607180002_enforce_utc_database_timezone.sql` 固定資料庫新連線與 migration session 為 UTC，細節見 git
- `supabase/functions/backendAction/` — 受控 action 閘道
  - `index.ts` — origin 驗證、CORS、Firebase 驗證與分派；公開限流由 Cloudflare Worker 先處理
  - `execution.ts` — 正式入口與本地整合驗證共用的權限、request ID、冪等執行核心
  - `action-registry.ts` / `response.ts` / `rate-limit.ts`（Upstash 精確業務配額）/ `types.ts` / `utils.ts` / `validation.ts` / `auth.ts`
  - domains：`users`（session access／角色指派）、`uploads`、`issues`（read/create/moderation/support/delete/comments）、`facilities`（獨立 read/create/affected/status/delete）、`announcements`（read/write/comments）、`notifications`、`dashboard`
  - shared helpers：`issue-shared.ts`、`announcement-shared.ts`
- 獨立 Functions：`syncUser`、`cloudinaryWebhook`、`outboxWorker`、`processDeletionJobs`、`maintenanceCleanup`
- `_shared/` — `env`、`http`、`api-errors`（公開錯誤契約 codegen）、`origin`（Worker／內部 origin secret 與動態 Function URL）、`firebase-auth`、`cloudinary`、`database`、`database-client`（Edge 專用精簡 PostgREST client，避開不需要的 Auth／Realtime 與舊 Node runtime shim）、`google-oauth`、`issue-categories`、`fcm`、`notion`、`rate-limits`、`upstash-rate-limit`、`webhook`

---

## Cloudflare

- `cloudflare/wrangler.toml` — production/development `workers.dev` 部署與 observability
- `cloudflare/src/` — 公開 API gateway；CORS、Firebase JWT、Cloudinary 簽章、Cloudflare 原生 Rate Limiting bindings 與 Supabase origin 轉發
- `cloudflare/generated/` — API error 與 backend action policy codegen
- `scripts/prepare-edge-functions.mjs` — CI 依私密 namespace 暫時產生六個隨機 Supabase Function 部署目錄

---

## src 入口與路由

- `main.ts` — 掛載 app、resume、PWA、session
- `i18n/` — `messages/<locale>/<domain>.ts` 依語系與領域拆分的 catalog（含 API error code 對應文案）、系統語言首次偵測、localStorage 語言偏好、日期 locale 與共用 `t()`；所有前端可見字串只放語系目錄，key 使用短而穩定的語意命名
- `App.vue` — startup gate + AppShell；route 只切換內容，導覽列與 action bar 維持固定，由各內容面板自行處理局部狀態轉場
- `sw.ts` — PWA SW、快取策略、FCM 背景通知
- `style.css` — 全域樣式載入入口；依序載入 base、primitives 與領域樣式
- `styles/base.css` — design tokens、全域基礎與頁面骨架
- `styles/primitives.css` — viewport、control／card／floating 表面與陰影、list、dropdown、control frame 的單一可復用視覺契約
- `styles/components.css` / `controls.css` — 共用表面、互動狀態、按鈕與欄位
- `styles/navigation.css` — 桌面側欄與手機底部導覽
- `styles/content.css` / `responsive.css` — 列表、設定、統計、Dialog 與跨裝置覆寫
- `assets/fonts/` — JetBrains Mono 與 Material Symbols 子集
- `router/index.ts` / `router/route-components.ts` — 組合 modules、abort 上一頁、session guard 與主要頁面 chunk 預載
- `router/authRoutes.ts` / `issueRoutes.ts` / `facilityRoutes.ts` / `announcementRoutes.ts` / `adminRoutes.ts` / `notificationRoutes.ts` / `settingsRoutes.ts`
- `views/LoginView.vue` — 登入
- `views/IssueBoardView.vue` — 提案看板
- `views/IssueDetailView.vue` — 提案詳情
- `views/FacilitiesView.vue` / `views/FacilityDetailView.vue` — 設備列表、建立與詳情／狀態管理
- `views/AnnouncementsView.vue` — 公告列表
- `views/AnnouncementDetailView.vue` — 公告詳情
- `views/NotificationsView.vue` — 通知頁
- `views/SettingsView.vue` — 設定頁（手機）
- `views/DashboardView.vue` — 管理員統計
- `views/AccessManagementView.vue` — `role.manage` 角色指派、config 驅動的多分類權限、平台最高權限與最後一位平台管理員保護

---

## components/ui（無業務）

- `AppButton.vue` / `SurfacePanel.vue` / `DropdownPanel.vue` / `DropdownMenu.vue` / `ViewportFrame.vue` — 按鈕、表面／卡片、dropdown 與全域 viewport gutter 的規範入口；領域元件只用 props／slots 組合
- `LoadingSpinner.vue` / `BusyButtonContent.vue` / `FeedLoadMoreControl.vue` / `SelectionOptionButton.vue` — spinner、busy 按鈕內容、共用載入更多與一致的選取列控制
- `EntryComposerShell.vue` / `CountedTextField.vue` — 提案、公告、設備共用的發布骨架、字數欄位與 Markdown 圖片編輯器設定
- `ContentCardCollection.vue` / `ContentCardShell.vue` — 提案、公告、設備共用的列表狀態、卡片表面、作者／標題／時間／狀態與操作區；領域元件只填資料及差異 slots
- `DetailRouteState.vue` — 提案、公告、設備詳情共用的登入等待、loading、逾時、離線及讀取錯誤狀態
- `StatusTransitionDialog.vue` — 提案與設備共用的狀態選擇、結果填寫、字數、錯誤及 busy 流程；各領域只提供狀態與文案
- `AppIcon.vue` / `BrandMark.vue` / `UserAvatar.vue` / `DecorativeGlow.vue`
- `EmptyStatePanel.vue` / `PageLoadFailure.vue` / `ContentListState.vue` / `SearchHighlight.vue`（三領域共用載入失敗、不可用、錯誤、空內容與分頁狀態殼）
- `PillSegmentedControl.vue` / `SelectionMark.vue` / `DetailActionButton.vue` / `DetailActionGroup.vue` / `DetailPageShell.vue` / `OperationTimeList.vue`（詳情頁共用操作列、分享／刪除動作與狀態時間列）
- `DialogOverlay.vue` / `GoogleLoginButton.vue`
- Markdown：`MarkdownImageEditor.vue`、`MarkdownToolbar.vue`、`MarkdownImagePreviews.vue`、`MarkdownImageToolbarStatus.vue`、`MarkdownTableBlockCard.vue`、`TableGridPicker.vue`、`VisualTableEditor.vue`
- Skeleton：`SkeletonTable`、`SkeletonAnnouncementList`、`SkeletonCommentList`、`SkeletonDashboard`

---

## components（應用）

- Shell：`AppShell.vue`（共用導覽狀態、返回與捲動記憶）、`app-shell/AppDesktopSidebar.vue`、`app-shell/AppMobileHeader.vue`、`app-shell/AppMobileBottomNav.vue`、`app-shell/types.ts`、`AppStartupScreen.vue`、`LoginPanel.vue`、`ActionFeedbackBar.vue`
- 設定／通知：`SettingsPanelContent.vue`；通知與設定使用獨立路由頁
- Dialog：`ConfirmDialog`、`AppInstallPromptDialog`、`AppUpdatePromptDialog`、`PushPermissionPromptDialog`、`IssueComposer`、`FacilityComposer`、`FacilityStatusDialog`、`AnnouncementComposerDialog`、`IssueReviewDialog`、`IssueStatusDialog`
- 留言：`CommentThreadPanel`、`CommentItem`、`CommentComposer`、`IssueComments`、`AnnouncementComments`
- 內容：`MarkdownRenderer`、`MarkdownMediaContent`、`AuthorAvatar`、`VoteButtons`
- 詳情內容：`ContentDetailPagePanel` / `ContentDetailBody` — 提案、公告、設備共用完整 DetailPageShell、標題、作者、補充訊息與 Markdown 內容排版；留言、操作與領域標籤以 slots 注入
- 看板：`IssueBoard`、`BoardControls`、`IssueCategorySelector`、`IssueBoardTable`、`IssueTableRow`、`IssueAdminMenu`、`IssueDetailPagePanel`、`IssueDetailSupportFooter`
- 公告：`AnnouncementTable`、`AnnouncementTableRow`、`AnnouncementDetailPagePanel`、`AnnouncementDetailActions`、`CompactActionMenu`
- 設備：`FacilityComposer`、`FacilityStatusDialog`、`FacilityAdminMenu`、`FacilityTable`、`FacilityTableRow`、`FacilityDetailPagePanel`、`FacilityDetailActions`；三領域共用 Composer、詳情內容、loading／錯誤、Skeleton、操作列與確認 Dialog，僅保留地點及設備狀態等領域差異

---

## composables

- Session：`useSession` + `sessionTypes` / `sessionDebug` / `sessionValidation` / `sessionAuthActions` / `sessionEffects`
- 看板：`useIssueBoardData`、`useIssueBuckets`、`useIssueBoardPagination`、`useIssueSearch`、`useUserIssuesData`、`useIssueRouteFilter`、`useDocumentTitle`、`useFilter`
- 詳情／列：`useIssueRouteDetail`、`useIssueDisplay`、`useIssueSupport`、`useIssueItemController`、`useIssueComposerForm`、`useVoteSupport`、`useDeleteIssue`、`useStatusStyling`
- 留言：`useIssueComments`、`useAnnouncementComments`、`useDiscussionComments`（共用 core，依提案／公告領域權限判斷管理操作）
- 公告：`useAnnouncements`、`useAnnouncementManagement`、`useAnnouncementDetail`（詳情讀取、快取、Realtime、按讚與刪除流程）
- 設備：`useFacilities`、`useFacilityDetail`、`useFacilityComposerForm`
- 通知／推播：`useNotificationBadge`、`useNotifications`、`useNotificationNavigation`、`useNotificationDisplay`（依目前語系組合通知標題、狀態與舊資料內容）、`usePushNotifications`、`usePushPermissionPrompt`
- UI 流程：`useActionFeedback`、`useActiveNavigationRefresh`、`useAuthenticatedDetailState`、`useDetailRouteQuery`、`useContentListRuntime`（三領域共用最短載入、逾時／斷線、重試、無限捲動與導覽重新整理）、`useBodyScrollLock`、`useDialogFocus`、`useDialogThemeColor`、`useDropdownPosition`、`useClickOutside`、`useInfiniteScroll`、`useMinimumLoading`、`useLoadingTimeout`、`useTimedMessage`、`useNetworkStatus`、`useCompactTableLayout`
- App：`useAppResume`、`useAppStartupGate`、`useAppUpdate`、`useAppInstallPrompt`、`useShareUrl`、`useAuthorAvatar`
- Markdown／圖：`useMarkdown`、`useResolvedMarkdown`、`useImageUpload`、`useMarkdownImageUpload`、`useMarkdownImageEditor`
- Dashboard：`usePlatformDashboard`、`useDashboardMetrics`

---

## generated / constants / lib / types

- `generated/issue-categories.ts` — 分類 codegen
- `constants/app.ts` / `constants/input-limits.ts` — Novae 品牌名稱、學校顯示設定與前端輸入長度
- `constants/categories.ts` / `statuses.ts` — 提案／設備狀態 label 與結案判斷的單一來源
- `lib/` — `firebase`、`firebase-messaging`、`firebase-app-check`、`auth-token`、`supabase`、`request`、`request-id`、`route-request`、`reconnect`、`route`、`page-size`、`format`、`search`、`issue-status`、`issue-timeline`、`issue-sort`、`persistent-cache`（IndexedDB 跨 reload 快取）、`in-app-browser`、`pwa-install`、`caret`、`markdown-*`、`image-processing`
- `types/index.ts` / `types/pwa.d.ts` — 共通型別及獨立 `FacilityStatus`／`FacilitySummary`／`FacilityRecord`／`FacilityInput`／`FacilityPageResult`

---

## services

- `backend-action.ts` / `backend-action-contract.ts` / `supabase-auth.ts` / `session-role.ts`（roles／permissions）/ `access.ts`（角色管理）/ `content-read-cache.ts` / `content-revisions.ts`（三領域批次版本檢查與精準失效）/ `realtime-events.ts`
- 提案：`issues.ts` barrel + `issues-core` / `constants` / `errors` / `utils` / `normalize` / `read*` / `write` / `comment-cursor`
- 其他：`facilities.ts`（設備摘要分頁／詳情／寫入）、`announcements.ts`、`notifications.ts`、`dashboard.ts`、`uploads.ts`、`users-read.ts`、`users-write.ts`

---

## public / scripts / tests / CI

- `.nvmrc` / `.node-version` / `package.json#engines` — 本機、版本管理器與套件安裝統一使用 Node.js 24 LTS
- `public/` — favicon、PWA icons
- `scripts/generate-issue-categories.mjs` / `generate-rate-limits.mjs` / `generate-data-retention.mjs` / `generate-backend-actions.mjs` / `issue-category-config.mjs`
- `scripts/upstash-test-server.ts` — 整合驗證專用的隔離式 Upstash REST／pipeline 相容計數器
- `scripts/check-i18n.mjs` — 驗證中英文 key 完整對齊、英文無中文殘留、Vue 模板無任何語言的靜態可見文案／屬性、前端無硬編碼中文字串、無缺漏或直接顯示的 `text.*` key；納入 `verify:local`
- `scripts/check-ui-primitives.mjs` — 阻止舊 dropdown 類別、任意陰影、手組卡片與各頁自行設定 viewport gutter，並確認共用 primitive 與三階陰影 token 完整；納入 `verify:local`
- `scripts/verify-integration-local.mjs` / `verify-integration-local.sh` — Windows 自動轉入 WSL、Linux/CI 直接執行的本地 Supabase 全自動重設、database lint、Edge 啟動與整合驗證入口；一律注入固定隔離測試值而不載入正式 provider credentials，CI 直接使用 `setup-deno` 加入 PATH 的官方最新版 Deno
- `tests/architecture.test.mjs` — 靜態架構回歸
- `tests/integration/` — 全 backend action、管理員／一般／領域與分類權限、冪等、RLS、通知偏好、worker lifecycle 與 Edge HTTP trust boundary；`action-coverage.test.ts` 防止新增 action 未被領域測試引用，精簡 `README.md` 只保留入口，完整維護規則位於官方網站貢獻指南
- `.github/workflows/` — `verify-pr` 同時執行靜態／build、Cloudflare Worker 與完整本地 Supabase 整合測試；`deploy-backend` 在推送 migration／Edge 前再次執行相同整合驗證；所有 JavaScript Action 使用目前 Node.js 24 世代（Checkout／Setup Node v7、Cache v6、Supabase Setup CLI v3）；另有 `deploy-frontend`、`reset-db`、`reset-cloudinary`
