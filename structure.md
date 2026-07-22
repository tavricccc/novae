# Project Structure Map

變更檔案結構時同步更新本檔。先讀此地圖再搜程式，避免盲目掃全庫。

---

## 根目錄

- `README.md` — 中英文專案摘要與快速入口
- `LICENSE` / `CONTRIBUTING.md` / `SECURITY.md` / `CODE_OF_CONDUCT.md` — MIT 授權與社群政策入口
- 官方網站、完整文件與更新紀錄由 [`tavricccc/novae-website`](https://github.com/tavricccc/novae-website) 獨立維護與發布；分類改由安裝後的程式內初始設定與管理頁維護
- `config/api-errors.config.json` — 公開 API 錯誤碼、HTTP status 與前端 i18n key 的單一契約；由 `scripts/generate-api-errors.mjs` 產生三端型別
- `config/rate-limits.config.json` — Supabase 精確業務配額、對應 API error code 與圖片壓縮設定入口
- `config/backend-actions.config.json` — Cloudflare 原生防刷群組與 Supabase 細部業務配額映射
- `config/data-retention.config.json` — 已結案內容、通知、事件、log、暫存與維護紀錄保留期的單一設定入口
- `structure.md` / `AGENTS.md` / `ui-design-system.md` / `design-qa.md` — 結構地圖 / 代理人規則 / 前端 UI 復用與新增設計規範 / 最近一次視覺比對紀錄
- `package.json` — scripts（typecheck、lint、build、check:edge、test:architecture、verify:local…）
- `index.html` / `vite.config.ts` / `vercel.json` / `firebase.json`（僅本機 Auth emulator）/ `eslint.config.js` / `tsconfig*.json` / `tailwind.config.cjs`
- `.env.example` / `.gitignore` / `skills-lock.json`

---

## Supabase

- `supabase/config.toml` — schema 暴露與 Functions JWT 模式
- `supabase/migrations/` — 基線 + 增量 SQL（schema／RLS／RPC／Realtime Broadcast／清理／成本限流硬化／設備與 RBAC／輸入長度、附件型別、圖片網址快取、統一 feed 分頁與集合式留言回覆讀取）；`202607190001_dynamic_category_management.sql` 建立動態分類，`202607200002_atomic_user_access.sql` 將角色與分類指派改為單一交易並完整稽核，`202607200003_harden_category_deletion.sql` 統一分類永久刪除、內容／通知／圖片清理與稽核，`202607200004_facility_category_parity_and_personal_notifications.sql` 補齊設備分類篩選／分類管理範圍並將既有設備建立通知改回個人通知，`202607200005_platform_feature_switches.sql` 建立提案／設備功能開關與原子更新 RPC，`202607220001_scoped_user_access.sql` 改為鎖定目標帳號的單一權限範圍更新並保留既有設備通知退訂，`202607220002_remove_category_archiving.sql` 將舊分類全部恢復可用並以資料庫約束移除封存狀態，較早 migration 細節見 git
- `supabase/functions/backendAction/` — 受控 action 閘道
  - `index.ts` — origin 驗證、CORS、Firebase 驗證與分派；公開限流由 Cloudflare Worker 先處理
  - `execution.ts` — 正式入口與本地整合驗證共用的權限、request ID、冪等執行核心
  - `action-registry.ts` / `response.ts` / `rate-limit.ts`（Upstash 精確業務配額）/ `types.ts` / `utils.ts` / `validation.ts` / `auth.ts`
  - domains：`users`（公開使用者資料）、`user-access`（負責人精確查找、scope 列表與單一範圍原子授權）、`session-bootstrap`（冷啟動合併 role／catalog／revisions／unread／optional visit，降低 Edge invocation）、`categories`（動態 catalog／初始設定／管理）、`uploads`、`issues`（read/create/moderation/support/delete/comments）、`facilities`（分類式 read/create/affected/status/delete）、`announcements`（read/write/comments）、`notifications`、`dashboard`
  - shared helpers：`issue-shared.ts`、`announcement-shared.ts`
  - 省 Edge Function 次數靠合併讀取與前端快取，不把 domain 業務搬進 Cloudflare Worker
- 獨立 Functions：`syncUser`、`cloudinaryWebhook`、`outboxWorker`、`processDeletionJobs`、`maintenanceCleanup`
- `_shared/` — `env`、`http`、`api-errors`（公開錯誤契約 codegen）、`origin`（Worker／內部 origin secret 與動態 Function URL）、`firebase-auth`、`cloudinary`、`database`、`database-client`（Edge 專用精簡 PostgREST client）、`google-oauth`、`fcm`、`notion`、`rate-limits`、`upstash-rate-limit`、`webhook`

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
- `App.vue` — startup gate + AppShell；route stage 使用固定 Grid 疊放新舊頁，navigation depth 僅保留轉場語意，實際統一採用較完整的 opacity crossfade，且不切換 absolute 定位、不使用 transform 合成陰影層或 `out-in` 卸載空檔
- `sw.ts` — PWA SW、快取策略、FCM 背景通知
- `style.css` — 全域樣式載入入口；依序載入 base、primitives 與領域樣式
- `styles/base.css` — design tokens、全域基礎與頁面骨架；route 換頁使用不觸發 layout、也不建立整頁 transform containing block 的長曲線 opacity crossfade
- `styles/primitives.css` — viewport、control／card／floating 表面與陰影、list、dropdown、control frame、GPU progress fill 的單一可復用視覺契約；Tailwind 陰影名稱同樣只使用 `shadow-control`、`shadow-card`、`shadow-floating`
- `styles/components.css` / `controls.css` — 共用表面、互動狀態、按鈕與欄位；全域點擊回饋使用無位移的輕微放大與 spring-like 回彈，大型表面降低幅度，不叠加縮小、下沉或 inset shadow
- `styles/navigation.css` — 桌面側欄與手機底部導覽；浮入與 scrim 使用 opacity／局部 transform，窄桌面側欄展開不再推動整個內容 viewport
- `styles/content.css` / `responsive.css` — 列表、設定、統計、Dialog 與跨裝置覆寫；Dialog 根節點保留 Vue transition 生命週期，surface 與獨立全畫面 backdrop 延後分層進場，blur 維持固定值只動畫 opacity
- `assets/fonts/` — JetBrains Mono 與 Material Symbols 子集
- `router/index.ts` / `router/default-route.ts` / `router/route-components.ts` / `router/navigation-hierarchy.ts` — 組合 modules、依啟用功能選擇登入預設頁並阻擋已關閉入口、abort 上一頁、session guard、主要頁面與三領域新增頁 chunk 預載，以及 root／新增／子頁／巢狀詳情深度與通知來源返回
- `router/authRoutes.ts` / `issueRoutes.ts` / `facilityRoutes.ts` / `announcementRoutes.ts` / `adminRoutes.ts` / `notificationRoutes.ts` / `settingsRoutes.ts`
- `views/LoginView.vue` — 登入
- `views/IssueBoardView.vue` — 提案看板
- `views/IssueDetailView.vue` — 提案詳情
- `views/FacilitiesView.vue` / `views/FacilityDetailView.vue` — 依動態設備分類瀏覽、建立與詳情／分類範圍狀態管理，分類選擇同步於 URL query
- `views/AnnouncementsView.vue` — 公告列表
- `views/AnnouncementDetailView.vue` — 公告詳情
- `views/NotificationsView.vue` — 通知頁
- `views/SettingsView.vue` — 設定頁（手機）
- `views/DashboardView.vue` — 管理員統計
- `views/AdministrationView.vue` — 單一系統設定中心，以頁面層級文字 Tabs 切換分類／流程與人員／權限，避免和內容選擇控制混淆；舊 `/admin/access`、`/admin/categories` 會導向對應區段
- `components/admin/CategoryWorkflowPanel.vue` / `MemberAccessPanel.vue` / `MemberAccessRow.vue` / `MemberAccessListSkeleton.vue` / `CategoryWizardDialog.vue` — 以等寬膠囊 Tabs 切換提案／設備，功能開關與分類草稿由單一按鈕原子儲存；草稿關閉功能時鎖定該功能的分類編輯，尚未儲存前不影響前台；人員權限先選分類／功能、只列出現有負責人，再以完整 Email／UID 查找並以共用成員列與載入骨架呈現／指派；平台總管理員只由 `ADMIN_EMAILS` 同步，不混入分類負責人名單，也不提供 UI 或一般權限 API 修改入口
- `components/categories/CategoryManagementSection.vue` / `SetupCategorySection.vue` / `CategorySelectorList.vue` / `CategoryEditorCard.vue` / `PlatformFeatureToggle.vue` — 初始設定與後續管理共用可橫向捲動的手機分類選擇清單、單一分類規則表單、目前分類的唯一預設 Switch，以及提案與設備功能開關；分類不提供封存或停止接案狀態，後續管理只允許永久刪除並明示會清除其所有關聯資料
- `views/SetupView.vue` / `components/LanguageSelector.vue` / `components/categories/SetupCategorySection.vue` — ADMIN_EMAILS 首次設定依序確認系統語言，再以與系統設定相同的提案／設備介面調整功能與分類；只驗證啟用功能的必填資料，完成前以確認 Dialog 說明先略過尚未註冊的負責人，未完成時停用送出，相同語言選擇器亦供設定頁覆用

---

## components/ui（Atomic Design，無業務）

- `atoms/` — 不依賴其他 UI 組裝層的最小視覺與互動單位：`AppButton.vue`、`AppIcon.vue`、`ImageRemoveButton.vue`、`IconTile.vue`、`TagBadge.vue`、`SwitchIndicator.vue`、`CharacterCount.vue`、`InlineAlert.vue`、`InlineMessage.vue`、`SkeletonBlock.vue`、`BrandMark.vue`、`BusyButtonContent.vue`、`DecorativeGlow.vue`、`LoadingSpinner.vue`、`DecodedImage.vue`（下載與 decode 完成前隱藏漸進繪製並顯示 spinner）、`SelectionMark.vue`、`UserAvatar.vue`；列表計數操作統一套用 `button-card-count` 緊湊高度；新頁面不得自行複製按鈕、圖片移除鍵、圖示容器、徽章、switch、字數顯示、alert／inline message、skeleton、品牌、avatar、圖片載入或 loading 樣式
- `molecules/` — 由 atoms 組成、可獨立重用的局部控制與狀態：`SurfacePanel`／`ContentNoticePanel`（列表補充列與詳情結果／地點共用的 neutral、success、error 表面）／`EditorSurface`／dropdown、`EditorModeBar`、`ListSurfaceRow`、`IconListRow`、`LabeledListSection`、`SectionHeader`、`WorkflowStepHeader`、`CountedTextField`、`CountedTextareaField`、`NumberField`、`DialogHeading`、`DialogActionRow`、選取控制、詳情操作、空狀態／錯誤、Markdown 工具列與圖片預覽；molecule 不得依賴 organism
- `organisms/` — 可直接供 route view 或領域元件填入資料／slots 的完整區塊：內容卡集合與 skeleton、列表狀態、詳情殼與 route 狀態、`DialogShell`、Composer、Markdown／表格編輯器、狀態 Dialog、`ViewportFrame` 與 `RoutePageFrame`
- 依賴方向固定為 `atoms → molecules → organisms`；同層可組合，低層不得反向 import 高層，`check:ui` 會阻止 flat path 與逆向依賴
- `organisms/ViewportFrame.vue` / `organisms/RoutePageFrame.vue` — AppShell 只用 safe-area-aware padding 提供唯一 viewport gutter，route page 只負責 max-width、全高 flex、垂直 padding與底部導覽安全距離；不以負 margin、bleed 或頁面級 `overflow-x-hidden` 推出／裁切內容。手機 `bottom-safe` 共用 Bottom Tab 實際螢幕底距，使 Detail 的時間／操作列到 Tab 與 Tab 到螢幕底部保持相同留白
- `organisms/ContentCardCollection.vue` / `ContentCardShell.vue` / `ContentCardSkeleton.vue` — 提案、公告、設備共用的列表狀態、卡片表面、作者／標題／時間／狀態與操作區；支援不取代可見入口的長按／右鍵快捷操作，並向領域層轉發 pointer／focus intent 供單筆資料預抓；列表與 load-more 骨架共用無陰影內層的 opacity 進場（`skeleton-card`／`skeleton-enter`），保留卡片陰影並避免 iOS WebKit 卸載殘影，領域元件只填資料及差異 slots
- `organisms/DetailRouteState.vue` / `DetailPageShell.vue` / `SkeletonDetail.vue` — 三領域詳情共用的完整高度鏈、狀態、操作與 responsive panel；手機內容／留言切換只使用短 opacity crossfade，不做左右位移；Detail 本體不再疊加 article/actions 底距，底部時間與操作列只由 RoutePageFrame 的 Bottom Tab safe gap 定位
- `organisms/EntryComposerShell.vue` / `MarkdownImageEditor.vue` / `VisualTableEditor.vue` — 三領域共用的路由新增頁、鍵盤可視高度、未儲存離頁攔截與 Markdown／表格編輯流程；較小控制留在 molecules
- `organisms/DialogShell.vue` / `AdaptiveActionMenu.vue` — Dialog overlay、獨立全螢幕 backdrop、card surface、scroll lock、focus trap、ARIA、返回鍵堆疊與 dismiss/persistent 行為的唯一完整外殼；backdrop 與 surface 分開進場，使按壓回彈先完成再漸進模糊／壓暗；一般浮層在手機自適應為可向下拖曳的 Bottom Sheet，選單共用同一份 slots 並在桌面使用 Dropdown、手機使用 Sheet；領域元件只填內容與 actions

---

## components（應用）

- Shell：`AppShell.vue`（共用導覽狀態、返回、捲動記憶、提案／設備的手機分類切換與桌面 utility popup；設備分類以 URL query 同步手機 Header 和桌面 BoardControls；顯示 Bottom Tab 時不再額外加 main-content 底距）、`app-shell/AppDesktopSidebar.vue`、`app-shell/AppMobileHeader.vue`（共用字串型分類選項；返回鍵保留單一 DOM，槽位與 44px 點擊區同寬並以寬度／opacity 收合，避免按鈕溢出壓字；標題維持單一內容實例）、`app-shell/AppMobileBottomNav.vue`（每個項目自行顯示靜態選中底色，不量測 DOM 或搬移共用灰色 indicator）、`app-shell/types.ts`、`AppStartupScreen.vue`、`LoginPanel.vue`、`ActionFeedbackBar.vue`
- 設定／通知：`SettingsPanelContent.vue`、`DesktopUtilityDialog.vue`；手機與深層連結保留獨立路由頁，桌面側欄的通知與頭像分別開啟各自尺寸與內容的獨立大型 popup
- 新增頁：`IssueComposer`、`FacilityComposer`、`AnnouncementComposer` 搭配 `views/IssueComposerView.vue`、`FacilityComposerView.vue`、`AnnouncementComposerView.vue`；手機隱藏 Bottom Nav，手機與桌面皆填滿 AppShell padding 內的可用內容區，不另做 full-bleed 補償；共用 Composer 以內側 padding 預留按鈕陰影繪製空間，手機沿用 AppShell 的 iOS 式側距並只保留扣除多餘安全區後的緊湊底距，送出後 replace 至新內容詳情
- Dialog：`ConfirmDialog`、`AppInstallPromptDialog`、`AppUpdatePromptDialog`、`PushPermissionPromptDialog`、`FacilityStatusDialog`、`IssueReviewDialog`、`IssueStatusDialog`
- 留言：`CommentThreadPanel`、`CommentItem`、`CommentComposer`、`IssueComments`、`AnnouncementComments`
- 內容：`MarkdownRenderer`、`MarkdownMediaContent`、`AuthorAvatar`、`VoteButtons`；附議在卡片維持緊湊 icon-pill，在詳情頁則組合共用 `DetailActionButton`，與設備「我也遇到」共用尺寸、表面及選中狀態
- 詳情內容：`ContentDetailPagePanel` / `ContentDetailBody` — 提案、公告、設備共用完整 DetailPageShell、標題、作者、補充訊息與 Markdown 內容排版；可組合 context notice（設備地點）及 result notice（處理結果），留言、操作與領域標籤以 slots 注入
- 看板：`IssueBoard`、`BoardControls`、`BoardCategorySelector`、`IssueBoardTable`、`IssueTableRow`、`IssueAdminMenu`、`IssueDetailPagePanel`、`IssueDetailSupportFooter`；提案與設備共用分類選擇器
- 公告：`AnnouncementTable`、`AnnouncementTableRow`、`AnnouncementDetailPagePanel`、`AnnouncementDetailActions`、`CompactActionMenu`
- 設備：`FacilityComposer`、`FacilityStatusDialog`、`FacilityAdminMenu`、`FacilityTable`、`FacilityTableRow`、`FacilityDetailPagePanel`、`FacilityDetailActions`；列表補充列只顯示地點與遇到人數，分類由 AppShell／BoardControls 顯示；詳情以共用 notice 表面呈現地點，並保留分類徽章。新增時標題與地點必填，詳細說明與圖片為選填；三領域共用 Composer、詳情內容、loading／錯誤、Skeleton、操作列與確認 Dialog
- 分類：`categories/CategorySelectorList.vue` / `CategoryEditorCard.vue` / `CategoryManagementSection.vue` / `SetupCategorySection.vue` / `PlatformFeatureToggle.vue` — 初始設定與後續管理共用的分類選擇、表單、功能開關、唯一預設控制與永久刪除入口

---

## composables

- Session：`useSession` + `sessionTypes` / `sessionDebug` / `sessionValidation` / `sessionAuthActions`（production：GIS Token Client → `signInWithCredential`；emulator：`signInWithPopup`）/ `sessionEffects`
- 分類：`useCategories` — 動態 catalog、平台功能開關、預設分類與標籤查找的前端單一狀態來源
- 權限：`useMemberAccessManagement` — 分類／公告 scope 的負責人載入、精確查找、競態防護與單一範圍授權流程
- 看板：`useIssueBoardData`、`useIssueBuckets`、`useIssueBoardPagination`、`useIssueSearch`、`useUserIssuesData`、`useIssueRouteFilter`、`useDocumentTitle`、`useFilter`
- 詳情／列：`useIssueRouteDetail`、`useIssueDetailCacheScope`（列表 intent 預抓與詳情讀取共用的權限範圍 key）、`useIssueDisplay`、`useIssueSupport`、`useIssueItemController`、`useIssueComposerForm`、`useVoteSupport`、`useDeleteIssue`、`useStatusStyling`
- 留言：`useIssueComments`、`useAnnouncementComments`、`useDiscussionComments`（共用 core，依提案／公告領域權限判斷管理操作）
- 公告：`useAnnouncements`、`useAnnouncementManagement`、`useAnnouncementDetail`（詳情讀取、快取、Realtime、按讚與刪除流程）
- 設備：`useFacilities`、`useFacilityDetail`、`useFacilityComposerForm`
- 通知／推播：`useNotificationBadge`、`useNotifications`、`useNotificationNavigation`（開啟內容時保留通知 root 來源，詳情返回會 pop 回通知）、`useNotificationDisplay`（依目前語系組合通知標題、狀態與舊資料內容）、`usePushNotifications`、`usePushPermissionPrompt`
- UI 流程：`useActionFeedback`、`useActiveNavigationRefresh`、`useAuthenticatedDetailState`、`useDetailRouteQuery`、`useContentListRuntime`（三領域共用最短載入、逾時／斷線、重試、無限捲動與導覽重新整理）、`useBodyScrollLock`、`useBottomSheetDrag`（距離／速度門檻、每 animation frame 合併 pointer 位移與跟手回彈）、`useOverlayBack`（LIFO 系統返回）、`useLongPress`（移動容差與 click 抑制）、`useVisualViewport`（手機鍵盤可視高度）、`useDialogFocus`、`useDialogThemeColor`、`useDropdownPosition`、`useClickOutside`、`useInfiniteScroll`、`useMinimumLoading`、`useLoadingTimeout`、`useTimedMessage`、`useNetworkStatus`、`useCompactTableLayout`
- App：`useAppResume`、`useAppStartupGate`、`useAppUpdate`、`useAppInstallPrompt`、`useShareUrl`、`useAuthorProfile`
- Markdown／圖：`useMarkdown`、`useResolvedMarkdown`、`useImageUpload`、`useMarkdownImageUpload`、`useMarkdownImageEditor`
- Dashboard：`usePlatformDashboard`、`useDashboardMetrics`

---

## generated / constants / lib / types

- `constants/app.ts` / `constants/input-limits.ts` — Novae 品牌名稱、學校顯示設定與前端輸入長度
- `constants/categories.ts` / `statuses.ts` — 動態分類衍生規則與提案／設備狀態判斷
- `lib/` — `firebase`、`google-identity`（lazy GIS Token Client）、`firebase-messaging`、`firebase-app-check`、`auth-token`、`supabase`、`request`、`request-id`、`route-request`、`reconnect`、`route`、`page-size`、`format`、`search`、`issue-status`、`issue-timeline`、`issue-notice`（列表與詳情共用的結案內容／標題／tone 正規化）、`issue-sort`、`issue-detail-preview`（列表到詳情的一次性同步摘要 seed）、`persistent-cache`（IndexedDB 跨 reload 快取）、`press-feedback`（共用 pointer 按壓狀態、12px 捲動取消與放開後固定 160ms 可見時間）、`touch-zoom`（以 capture touchend 座標與 dblclick 雙層攔截雙擊放大，仍保留 pinch zoom）、`in-app-browser`、`pwa-install`、`caret`、`markdown-*`、`image-processing`
- `types/index.ts` / `types/categories.ts` / `types/pwa.d.ts` / `types/google-identity.d.ts` — 共通型別、動態分類契約、設備領域型別與 GIS Token Client 型別

---

## services

- `backend-action.ts` / `backend-action-contract.ts` / `supabase-auth.ts` / `session-role.ts`（roles／permissions）/ `session-bootstrap.ts`（冷啟動合併 session 讀取）/ `access.ts`（負責人查找與單一 scope 授權）/ `categories.ts`（動態 catalog／setup／整體原子管理）/ `content-read-cache.ts` / `content-revisions.ts`（三領域批次版本檢查與精準失效）/ `realtime-events.ts`（依 UID／角色重建、斷線重連與成功後 resync）
- 提案：`issues.ts` barrel + `issues-core` / `constants` / `errors` / `utils` / `normalize` / `read*` / `write` / `comment-cursor`
- 其他：`facilities.ts`（設備分類摘要分頁／詳情／寫入）、`announcements.ts`、`notifications.ts`（公告廣播與提案／設備分類負責人的個人通知讀取）、`dashboard.ts`、`uploads.ts`、`users-read.ts`、`users-write.ts`

---

## public / scripts / tests / CI

- `.nvmrc` / `.node-version` / `package.json#engines` — 本機、版本管理器與套件安裝統一使用 Node.js 24 LTS
- `public/` — favicon、PWA icons
- `scripts/generate-rate-limits.mjs` / `generate-data-retention.mjs` / `generate-backend-actions.mjs`
- `scripts/upstash-test-server.ts` / `external-provider-test-server.ts` — 整合驗證專用的隔離式 Upstash REST／pipeline 相容計數器與外部服務收件器；後者記錄 FCM topic／token／payload／深層連結及 Cloudinary 刪除請求，避免測試連到正式服務
- `scripts/check-i18n.mjs` — 驗證中英文 key 完整對齊、英文無中文殘留、Vue 模板無任何語言的靜態可見文案／屬性、前端無硬編碼中文字串、無缺漏或直接顯示的 `text.*` key；納入 `verify:local`
- `scripts/check-ui-primitives.mjs` — 阻止舊 dropdown 類別、任意陰影、手組卡片與各頁自行設定 viewport gutter，並確認共用 primitive 與三階陰影 token 完整；納入 `verify:local`
- `scripts/verify-integration-local.mjs` / `verify-integration-local.sh` — Windows 自動轉入 WSL、Linux/CI 直接執行的本地 Supabase 全自動重設、database lint、Edge 啟動與整合驗證入口；`npm run test:env` 會以相同基礎再啟動 Firebase Auth emulator、Cloudflare gateway 與 Vite，並以 `scripts/check-local-auth-emulator.mjs` 驗證登入、custom claim、僅由 `ADMIN_EMAILS` 決定的平台總管理員與 Setup 路由前置狀態後才回報 Ready；Google 登入模擬器可快速建立任意 `@integration.invalid` 新使用者，一律使用隔離測試值，不載入正式 provider credentials；自動驗證模式另啟動 FCM 收件器，實際驗證站外 topic／個人推播與通知偏好；本機 Firebase debug log 由 `.gitignore` 排除
- 動態壓測：`npm run verify:stress` 以目前資料庫分類展開 `tests/integration/stress-workflows.test.ts`；規模可用 `--stress-scale 2..20` 調整，涵蓋多人多權限、各分類內容、巢狀留言、通知、圖片與分類刪除
- `tests/architecture.test.mjs` — 靜態架構回歸
- `tests/integration/` — 全 backend action、管理員／一般／領域與分類權限、冪等、RLS、站內通知、FCM topic／個人站外通知、分類收件人、worker lifecycle 與 Edge HTTP trust boundary；`retention-cleanup.test.ts` 逐表驗證過期刪除、未過期保留、Cloudinary／Notion 清理排程與無聲保留期刪除，`action-coverage.test.ts` 防止新增 action 未被領域測試引用，精簡 `README.md` 只保留入口，完整維護規則位於官方網站貢獻指南
- `.github/workflows/` — `verify-pr` 同時執行靜態／build、Cloudflare Worker 與完整本地 Supabase 整合測試；`deploy-backend` 在推送 migration／Edge 前再次執行相同整合驗證；所有 JavaScript Action 使用目前 Node.js 24 世代（Checkout／Setup Node v7、Cache v6、Supabase Setup CLI v3）；另有 `deploy-frontend`、`reset-db`、`reset-cloudinary`
