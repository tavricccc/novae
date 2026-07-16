# Project Structure Map

變更檔案結構時同步更新本檔。先讀此地圖再搜程式，避免盲目掃全庫。

---

## 根目錄

- `README.md` — 中英文專案摘要與快速入口
- `LICENSE` / `CONTRIBUTING.md` / `SECURITY.md` / `CODE_OF_CONDUCT.md` — MIT 授權與社群政策入口
- 官方網站、完整文件、更新紀錄與分類設定產生器由 [`tavricccc/novae-website`](https://github.com/tavricccc/novae-website) 獨立維護與發布
- `config/issue-categories.config.json` — 提案分類與分類管理權限選項的單一設定入口
- `config/rate-limits.config.json` — 限流與圖片壓縮設定入口
- `config/backend-actions.config.json` — Cloudflare gateway 的 action 群組與細部限流映射
- `config/data-retention.config.json` — 已結案內容、通知、事件、log、暫存與維護紀錄保留期的單一設定入口
- `structure.md` / `AGENTS.md` / `design-qa.md` — 結構地圖 / 代理人規則 / 最近一次視覺比對紀錄
- `package.json` — scripts（typecheck、lint、build、check:edge、test:architecture、verify:local…）
- `index.html` / `vite.config.ts` / `vercel.json` / `eslint.config.js` / `tsconfig*.json` / `tailwind.config.cjs`
- `.env.example` / `.gitignore` / `skills-lock.json`

---

## Supabase

- `supabase/config.toml` — schema 暴露與 Functions JWT 模式
- `supabase/migrations/` — 基線 + 增量 SQL（schema／RLS／RPC／Realtime Broadcast／清理／成本限流硬化／設備與 RBAC／輸入長度、附件型別、圖片網址快取、統一 feed 分頁與集合式留言回覆讀取）；`202607150003_facilities_rbac.sql` 建立設備與 RBAC，`202607150004_backfill_legacy_platform_admins.sql` 承接既有管理員，`202607150005_clarify_role_scopes.sql` 固定平台最高權限，`202607150006_category_scoped_proposal_access.sql` 建立可複選的 config 分類管理權限，`202607150007_access_lookup_and_facility_status.sql` 加入精確帳號查找並修正設備狀態 RPC，`202607160001_configurable_retention_cleanup.sql` 由 config 控制已結案內容與營運資料保留期，`202607160002_content_revisions.sql` 建立提案／公告／設備的批次內容版本，`202607160003_harden_retention_deletion_flow.sql` 以批次 outbox 補齊保留期刪除同步並移除舊 maintenance overload，`202607160004_issue_supporter_notifications.sql` 在提案刪除前保存附議者通知名單，細節見 git
- `supabase/functions/backendAction/` — 受控 action 閘道
  - `index.ts` — origin 驗證、CORS、Firebase 驗證、冪等、分派；公開限流由 Cloudflare Worker 先處理
  - `action-registry.ts` / `response.ts` / `rate-limit.ts` / `types.ts` / `utils.ts` / `validation.ts` / `auth.ts`
  - domains：`users`（session access／角色指派）、`uploads`、`issues`（read/create/moderation/support/delete/comments）、`facilities`（獨立 read/create/affected/status/delete）、`announcements`（read/write/comments）、`notifications`、`dashboard`
  - shared helpers：`issue-shared.ts`、`announcement-shared.ts`
- 獨立 Functions：`syncUser`、`cloudinaryWebhook`、`outboxWorker`、`processDeletionJobs`、`maintenanceCleanup`
- `_shared/` — `env`、`http`、`origin`（Worker／內部 origin secret 與動態 Function URL）、`firebase-auth`、`cloudinary`、`database`、`google-oauth`、`issue-categories`、`fcm`、`notion`、`rate-limits`、`upstash-rate-limit`、`webhook`

---

## Cloudflare

- `cloudflare/wrangler.toml` — production/development `workers.dev` 部署與 observability
- `cloudflare/src/` — 公開 API gateway；CORS、Firebase JWT、Cloudinary 簽章、Upstash fail-closed 限流與 Supabase origin 轉發
- `cloudflare/generated/` — rate limit 與 backend action policy codegen
- `scripts/prepare-edge-functions.mjs` — CI 依私密 namespace 暫時產生六個隨機 Supabase Function 部署目錄

---

## src 入口與路由

- `main.ts` — 掛載 app、resume、PWA、session
- `App.vue` — startup gate + AppShell + page-content 轉場
- `sw.ts` — PWA SW、快取策略、FCM 背景通知
- `style.css` — 全域樣式載入入口
- `styles/base.css` — design tokens、全域基礎與頁面骨架
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

- `LoadingSpinner.vue` / `BusyButtonContent.vue` / `FeedLoadMoreControl.vue` / `SelectionOptionButton.vue` — spinner、busy 按鈕內容、共用載入更多與一致的選取列控制
- `AppIcon.vue` / `BrandMark.vue` / `UserAvatar.vue` / `DecorativeGlow.vue`
- `EmptyStatePanel.vue` / `PageLoadFailure.vue` / `SearchHighlight.vue`
- `PillSegmentedControl.vue` / `SelectionMark.vue` / `DetailActionButton.vue` / `DetailPageShell.vue` / `OperationTimeList.vue`（詳情頁共用狀態時間列）
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
- 看板：`IssueBoard`、`BoardControls`、`IssueCategorySelector`、`IssueBoardTable`、`IssueTableRow`、`IssueAdminMenu`、`IssueDetailPagePanel`、`IssueDetailContent`、`IssueDetailSupportFooter`
- 公告：`AnnouncementTable`、`AnnouncementTableRow`、`AnnouncementDetailPagePanel`、`AnnouncementDetailContent`、`AnnouncementDetailActions`、`CompactActionMenu`
- 設備：`FacilityComposer`、`FacilityStatusDialog`、`FacilityAdminMenu`、`FacilityTable`、`FacilityTableRow`；列表與詳情沿用提案看板、卡片與 `DetailPageShell` 視覺系統，資料流維持獨立 service/composable

---

## composables

- Session：`useSession` + `sessionTypes` / `sessionDebug` / `sessionValidation` / `sessionAuthActions` / `sessionEffects`
- 看板：`useIssueBoardData`、`useIssueBuckets`、`useIssueBoardPagination`、`useIssueSearch`、`useUserIssuesData`、`useIssueRouteFilter`、`useDocumentTitle`、`useFilter`
- 詳情／列：`useIssueRouteDetail`、`useIssueDisplay`、`useIssueSupport`、`useIssueItemController`、`useIssueComposerForm`、`useVoteSupport`、`useDeleteIssue`、`useStatusStyling`
- 留言：`useIssueComments`、`useAnnouncementComments`、`useDiscussionComments`（共用 core，依提案／公告領域權限判斷管理操作）
- 公告：`useAnnouncements`、`useAnnouncementManagement`
- 設備：`useFacilities`、`useFacilityDetail`、`useFacilityComposerForm`
- 通知／推播：`useNotificationBadge`、`useNotifications`、`useNotificationNavigation`、`usePushNotifications`、`usePushPermissionPrompt`
- UI 流程：`useActionFeedback`、`useActiveNavigationRefresh`、`useBodyScrollLock`、`useDialogFocus`、`useDialogThemeColor`、`useDropdownPosition`、`useClickOutside`、`useInfiniteScroll`、`useMinimumLoading`、`useLoadingTimeout`、`useTimedMessage`、`useNetworkStatus`、`useCompactTableLayout`
- App：`useAppResume`、`useAppStartupGate`、`useAppUpdate`、`useAppInstallPrompt`、`useShareUrl`、`useAuthorAvatar`
- Markdown／圖：`useMarkdown`、`useResolvedMarkdown`、`useImageUpload`、`useMarkdownImageUpload`、`useMarkdownImageEditor`
- Dashboard：`usePlatformDashboard`、`useDashboardMetrics`

---

## generated / constants / lib / types

- `generated/issue-categories.ts` — 分類 codegen
- `constants/app.ts` / `constants/input-limits.ts` — Novae 品牌名稱、學校顯示設定與前端輸入長度
- `constants/categories.ts` / `statuses.ts`
- `lib/` — `firebase`、`firebase-messaging`、`firebase-app-check`、`auth-token`、`supabase`、`request`、`request-id`、`route-request`、`reconnect`、`route`、`page-size`、`format`、`search`、`issue-status`、`issue-timeline`、`issue-sort`、`persistent-cache`（IndexedDB 跨 reload 快取）、`in-app-browser`、`pwa-install`、`caret`、`markdown-*`、`image-processing`
- `types/index.ts` / `types/pwa.d.ts` — 共通型別及獨立 `FacilityStatus`／`FacilitySummary`／`FacilityRecord`／`FacilityInput`／`FacilityPageResult`

---

## services

- `backend-action.ts` / `backend-action-contract.ts` / `supabase-auth.ts` / `session-role.ts`（roles／permissions）/ `access.ts`（角色管理）/ `content-read-cache.ts` / `content-revisions.ts`（三領域批次版本檢查與精準失效）/ `realtime-events.ts`
- 提案：`issues.ts` barrel + `issues-core` / `constants` / `errors` / `utils` / `normalize` / `read*` / `write` / `comment-cursor`
- 其他：`facilities.ts`（設備摘要分頁／詳情／寫入）、`announcements.ts`、`notifications.ts`、`dashboard.ts`、`uploads.ts`、`users-read.ts`、`users-write.ts`

---

## public / scripts / tests / CI

- `public/` — favicon、PWA icons
- `scripts/generate-issue-categories.mjs` / `generate-rate-limits.mjs` / `generate-data-retention.mjs` / `generate-backend-actions.mjs` / `issue-category-config.mjs`
- `tests/architecture.test.mjs` — 靜態架構回歸
- `.github/workflows/` — `verify-pr`、`deploy-frontend`、`deploy-backend`、`reset-db`、`reset-cloudinary`
