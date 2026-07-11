# Project Structure Map

變更檔案結構時同步更新本檔。先讀此地圖再搜程式，避免盲目掃全庫。

---

## 根目錄

- `README.md` — 中英文專案摘要與快速入口
- `LICENSE` / `CONTRIBUTING.md` / `SECURITY.md` / `CODE_OF_CONDUCT.md` — MIT 授權與社群政策入口
- `docs/*.md` — 繁中開源文件（總覽、快速開始、使用、架構、設定、部署、維運、故障排除、安全、成本、貢獻）
- `docs/en/*.md` — 與繁中對照的英文文件
- `website/` — 雙語專案介紹頁與文件網站；建置時直接使用根目錄 `docs/`，由 GitHub Pages 部署
- `config/issue-categories.config.json` — 提案分類設定入口
- `config/rate-limits.config.json` — 限流與圖片壓縮設定入口
- `structure.md` / `AGENTS.md` — 結構地圖 / 代理人規則
- `package.json` — scripts（typecheck、lint、build、check:edge、test:architecture、verify:local…）
- `index.html` / `vite.config.ts` / `vercel.json` / `eslint.config.js` / `tsconfig*.json` / `tailwind.config.cjs` / `postcss.config.cjs`
- `.env.example` / `.gitignore` / `skills-lock.json`

---

## Supabase

- `supabase/config.toml` — schema 暴露與 Functions JWT 模式
- `supabase/migrations/` — 基線 + 增量 SQL（schema／RLS／RPC／Realtime／清理／附件型別修正）；細節見 git，不逐檔列
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
- `style.css` — 全域 design tokens、button/panel/menu/popover/dialog 轉場
- `assets/fonts/` — 本地字型與 Material Symbols 子集
- `router/index.ts` — 組合 modules、abort 上一頁、session guard
- `router/authRoutes.ts` / `issueRoutes.ts` / `announcementRoutes.ts` / `changelogRoutes.ts` / `adminRoutes.ts` / `notificationRoutes.ts` / `settingsRoutes.ts`
- `views/LoginView.vue` — 登入
- `views/IssueBoardView.vue` — 提案看板
- `views/IssueDetailView.vue` — 提案詳情
- `views/AnnouncementsView.vue` — 公告列表
- `views/AnnouncementDetailView.vue` — 公告詳情
- `views/NotificationsView.vue` — 通知頁
- `views/SettingsView.vue` — 設定頁（手機）
- `views/DashboardView.vue` — 管理員統計
- `views/ChangelogView.vue` — 更新紀錄

---

## components/ui（無業務）

- `LoadingSpinner.vue` / `BusyButtonContent.vue` — spinner、busy 按鈕內容
- `AppIcon.vue` / `BrandMark.vue` / `UserAvatar.vue` / `DecorativeGlow.vue`
- `EmptyStatePanel.vue` / `PageLoadFailure.vue` / `SearchHighlight.vue`
- `PillSegmentedControl.vue` / `DetailActionButton.vue` / `DetailPageShell.vue`
- `DialogOverlay.vue` / `GoogleLoginButton.vue`
- Markdown：`MarkdownImageEditor.vue`、`MarkdownToolbar.vue`、`MarkdownImagePreviews.vue`、`MarkdownImageToolbarStatus.vue`、`MarkdownTableBlockCard.vue`、`TableGridPicker.vue`、`VisualTableEditor.vue`
- Skeleton：`SkeletonTable`、`SkeletonAnnouncementList`、`SkeletonCommentList`、`SkeletonDashboard`

---

## components（應用）

- Shell：`AppShell.vue`、`AppStartupScreen.vue`、`LoginPanel.vue`、`ToastViewport.vue`
- 設定／通知：`SettingsPanel.vue`、`SettingsPanelContent.vue`、`NotificationBell.vue`
- Dialog：`ConfirmDialog`、`CreateActionMenu`、`AppInstallPromptDialog`、`AppUpdatePromptDialog`、`PushPermissionPromptDialog`、`IssueComposer`、`AnnouncementEditorDialog`、`IssueReviewDialog`、`IssueStatusDialog`
- 留言：`CommentThreadPanel`、`CommentItem`、`CommentComposer`、`IssueComments`、`AnnouncementComments`
- 內容：`MarkdownRenderer`、`MarkdownMediaContent`、`AuthorAvatar`、`VoteButtons`
- 看板：`IssueBoard`、`BoardControls`、`IssueBoardTable`、`IssueTableRow`、`IssueAdminMenu`、`IssueDetailPagePanel`、`IssueDetailContent`、`IssueDetailSupportFooter`
- 公告：`AnnouncementControls`、`AnnouncementTable`、`AnnouncementTableRow`、`AnnouncementDetailPagePanel`、`AnnouncementDetailContent`、`AnnouncementDetailActions`、`CompactActionMenu`

---

## composables

- Session：`useSession` + `sessionTypes` / `sessionDebug` / `sessionValidation` / `sessionAuthActions` / `sessionEffects`
- 看板：`useIssueBoardData`、`useIssueBuckets`、`useIssueBoardPagination`、`useIssueSearch`、`useUserIssuesData`、`useIssueRouteFilter`、`useDocumentTitle`、`useFilter`
- 詳情／列：`useIssueRouteDetail`、`useIssueDisplay`、`useIssueSupport`、`useIssueItemController`、`useIssueComposerForm`、`useVoteSupport`、`useDeleteIssue`、`useStatusStyling`
- 留言：`useIssueComments`、`useAnnouncementComments`、`useDiscussionComments`（共用 core）
- 公告：`useAnnouncements`、`useAnnouncementManagement`
- 通知／推播：`useNotificationBadge`、`useNotifications`、`useNotificationNavigation`、`usePushNotifications`、`usePushPermissionPrompt`
- UI 流程：`useToast`、`useBodyScrollLock`、`useDialogFocus`、`useDialogThemeColor`、`useDropdownPosition`、`useClickOutside`、`useInfiniteScroll`、`useMinimumLoading`、`useLoadingTimeout`、`useTimedMessage`、`useNetworkStatus`
- App：`useAppResume`、`useAppStartupGate`、`useAppUpdate`、`useAppInstallPrompt`、`useCreateEntryActions`、`useShareUrl`、`useAuthorAvatar`
- Markdown／圖：`useMarkdown`、`useResolvedMarkdown`、`useImageUpload`、`useMarkdownImageUpload`、`useMarkdownImageEditor`
- Dashboard：`usePlatformDashboard`、`useDashboardMetrics`

---

## generated / constants / lib / types

- `generated/issue-categories.ts` — 分類 codegen
- `constants/app.ts` — Novae 品牌名稱與學校顯示設定
- `constants/categories.ts` / `statuses.ts` / `changelog.ts`
- `lib/` — `firebase`、`firebase-messaging`、`firebase-app-check`、`auth-token`、`supabase`、`request`、`request-id`、`route-request`、`reconnect`、`route`、`page-size`、`format`、`search`、`issue-status`、`issue-timeline`、`issue-sort`、`announcement-sort`、`in-app-browser`、`pwa-install`、`caret`、`markdown-*`、`image-processing`
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
- `.github/workflows/` — `verify-pr`、`deploy-frontend`、`deploy-backend`、`deploy-pages`、`reset-db`、`reset-cloudinary`
