# Project Structure Map

變更檔案結構時同步更新本檔。先讀此地圖再搜程式，避免盲目掃全庫。

---

## 根目錄

- `README.md` — 中英文專案摘要與快速入口
- `LICENSE` / `CONTRIBUTING.md` / `SECURITY.md` / `CODE_OF_CONDUCT.md` — MIT 授權與社群政策入口
- 官方網站、完整文件、更新紀錄與分類設定產生器由 [`tavricccc/novae-website`](https://github.com/tavricccc/novae-website) 獨立維護與發布
- `config/issue-categories.config.json` — 提案分類設定入口
- `config/rate-limits.config.json` — 限流與圖片壓縮設定入口
- `structure.md` / `AGENTS.md` / `design-qa.md` — 結構地圖 / 代理人規則 / 最近一次視覺比對紀錄
- `package.json` — scripts（typecheck、lint、build、check:edge、test:architecture、verify:local…）
- `index.html` / `vite.config.ts` / `vercel.json` / `eslint.config.js` / `tsconfig*.json` / `tailwind.config.cjs`
- `.env.example` / `.gitignore` / `skills-lock.json`

---

## Supabase

- `supabase/config.toml` — schema 暴露與 Functions JWT 模式
- `supabase/migrations/` — 基線 + 增量 SQL（schema／RLS／RPC／Realtime／清理／附件型別、圖片網址快取、統一 feed 分頁與集合式留言回覆讀取）；細節見 git，不逐檔列
- `supabase/functions/backendAction/` — 受控 action 閘道
  - `index.ts` — CORS、驗證、限流、冪等、分派
  - `action-registry.ts` / `response.ts` / `rate-limit.ts` / `types.ts` / `utils.ts` / `validation.ts` / `auth.ts`
  - domains：`users`、`uploads`、`issues`（read/create/moderation/support/delete/comments）、`announcements`（read/write/comments）、`notifications`、`dashboard`
  - shared helpers：`issue-shared.ts`、`announcement-shared.ts`
- 獨立 Functions：`syncUser`、`cloudinaryWebhook`、`outboxWorker`、`processDeletionJobs`、`maintenanceCleanup`
- `_shared/` — `env`、`http`、`firebase-auth`、`cloudinary`、`database`、`google-oauth`、`issue-categories`、`fcm`、`notion`、`rate-limits`、`upstash-rate-limit`、`webhook`

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
- `router/index.ts` — 組合 modules、abort 上一頁、session guard
- `router/authRoutes.ts` / `issueRoutes.ts` / `announcementRoutes.ts` / `adminRoutes.ts` / `notificationRoutes.ts` / `settingsRoutes.ts`
- `views/LoginView.vue` — 登入
- `views/IssueBoardView.vue` — 提案看板
- `views/IssueDetailView.vue` — 提案詳情
- `views/AnnouncementsView.vue` — 公告列表
- `views/AnnouncementDetailView.vue` — 公告詳情
- `views/NotificationsView.vue` — 通知頁
- `views/SettingsView.vue` — 設定頁（手機）
- `views/DashboardView.vue` — 管理員統計

---

## components/ui（無業務）

- `LoadingSpinner.vue` / `BusyButtonContent.vue` / `FeedLoadMoreControl.vue` — spinner、busy 按鈕內容與共用 pill 載入更多控制
- `AppIcon.vue` / `BrandMark.vue` / `UserAvatar.vue` / `DecorativeGlow.vue`
- `EmptyStatePanel.vue` / `PageLoadFailure.vue` / `SearchHighlight.vue`
- `PillSegmentedControl.vue` / `SelectionMark.vue` / `DetailActionButton.vue` / `DetailPageShell.vue`
- `DialogOverlay.vue` / `GoogleLoginButton.vue`
- Markdown：`MarkdownImageEditor.vue`、`MarkdownToolbar.vue`、`MarkdownImagePreviews.vue`、`MarkdownImageToolbarStatus.vue`、`MarkdownTableBlockCard.vue`、`TableGridPicker.vue`、`VisualTableEditor.vue`
- Skeleton：`SkeletonTable`、`SkeletonAnnouncementList`、`SkeletonCommentList`、`SkeletonDashboard`

---

## components（應用）

- Shell：`AppShell.vue`（共用導覽狀態、返回與捲動記憶）、`app-shell/AppDesktopSidebar.vue`、`app-shell/AppMobileHeader.vue`、`app-shell/AppMobileBottomNav.vue`、`app-shell/types.ts`、`AppStartupScreen.vue`、`LoginPanel.vue`、`ActionFeedbackBar.vue`
- 設定／通知：`SettingsPanelContent.vue`；通知與設定使用獨立路由頁
- Dialog：`ConfirmDialog`、`CreateActionMenu`、`AppInstallPromptDialog`、`AppUpdatePromptDialog`、`PushPermissionPromptDialog`、`IssueComposer`、`AnnouncementComposerDialog`、`IssueReviewDialog`、`IssueStatusDialog`
- 留言：`CommentThreadPanel`、`CommentItem`、`CommentComposer`、`IssueComments`、`AnnouncementComments`
- 內容：`MarkdownRenderer`、`MarkdownMediaContent`、`AuthorAvatar`、`VoteButtons`
- 看板：`IssueBoard`、`BoardControls`、`IssueBoardTable`、`IssueTableRow`、`IssueAdminMenu`、`IssueDetailPagePanel`、`IssueDetailContent`、`IssueDetailSupportFooter`
- 公告：`AnnouncementTable`、`AnnouncementTableRow`、`AnnouncementDetailPagePanel`、`AnnouncementDetailContent`、`AnnouncementDetailActions`、`CompactActionMenu`

---

## composables

- Session：`useSession` + `sessionTypes` / `sessionDebug` / `sessionValidation` / `sessionAuthActions` / `sessionEffects`
- 看板：`useIssueBoardData`、`useIssueBuckets`、`useIssueBoardPagination`、`useIssueSearch`、`useUserIssuesData`、`useIssueRouteFilter`、`useDocumentTitle`、`useFilter`
- 詳情／列：`useIssueRouteDetail`、`useIssueDisplay`、`useIssueSupport`、`useIssueItemController`、`useIssueComposerForm`、`useVoteSupport`、`useDeleteIssue`、`useStatusStyling`
- 留言：`useIssueComments`、`useAnnouncementComments`、`useDiscussionComments`（共用 core）
- 公告：`useAnnouncements`、`useAnnouncementManagement`
- 通知／推播：`useNotificationBadge`、`useNotifications`、`useNotificationNavigation`、`usePushNotifications`、`usePushPermissionPrompt`
- UI 流程：`useActionFeedback`、`useActiveNavigationRefresh`、`useBodyScrollLock`、`useDialogFocus`、`useDialogThemeColor`、`useDropdownPosition`、`useClickOutside`、`useInfiniteScroll`、`useMinimumLoading`、`useLoadingTimeout`、`useTimedMessage`、`useNetworkStatus`、`useCompactTableLayout`
- App：`useAppResume`、`useAppStartupGate`、`useAppUpdate`、`useAppInstallPrompt`、`useCreateEntryActions`、`useShareUrl`、`useAuthorAvatar`
- Markdown／圖：`useMarkdown`、`useResolvedMarkdown`、`useImageUpload`、`useMarkdownImageUpload`、`useMarkdownImageEditor`
- Dashboard：`usePlatformDashboard`、`useDashboardMetrics`

---

## generated / constants / lib / types

- `generated/issue-categories.ts` — 分類 codegen
- `constants/app.ts` — Novae 品牌名稱與學校顯示設定
- `constants/categories.ts` / `statuses.ts`
- `lib/` — `firebase`、`firebase-messaging`、`firebase-app-check`、`auth-token`、`supabase`、`request`、`request-id`、`route-request`、`reconnect`、`route`、`page-size`、`format`、`search`、`issue-status`、`issue-timeline`、`issue-sort`、`in-app-browser`、`pwa-install`、`caret`、`markdown-*`、`image-processing`
- `types/index.ts` / `types/pwa.d.ts`

---

## services

- `backend-action.ts` / `backend-action-contract.ts` / `supabase-function-error.ts` / `supabase-auth.ts` / `session-role.ts` / `content-read-cache.ts` / `realtime-events.ts`
- 提案：`issues.ts` barrel + `issues-core` / `constants` / `errors` / `utils` / `normalize` / `read*` / `write` / `comment-cursor`
- 其他：`announcements.ts`、`notifications.ts`、`dashboard.ts`、`uploads.ts`、`users-read.ts`、`users-write.ts`

---

## public / scripts / tests / CI

- `public/` — favicon、PWA icons
- `scripts/generate-issue-categories.mjs` / `generate-rate-limits.mjs` / `issue-category-config.mjs`
- `tests/architecture.test.mjs` — 靜態架構回歸
- `.github/workflows/` — `verify-pr`、`deploy-frontend`、`deploy-backend`、`reset-db`、`reset-cloudinary`
