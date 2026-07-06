import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';
import test from 'node:test';
import { URL } from 'node:url';

const root = new URL('../', import.meta.url);
const read = async (path) => readFile(new URL(path, root), 'utf8');

async function listFiles(relativeDir, files = []) {
  const dir = new URL(relativeDir, root);
  for (const entry of await readdir(dir)) {
    if (['node_modules', 'dist', 'functions', '.git'].includes(entry)) continue;
    const child = new URL(`${relativeDir.replace(/\/?$/u, '/')}${entry}`, root);
    const childStat = await stat(child);
    if (childStat.isDirectory()) {
      await listFiles(`${relativeDir.replace(/\/?$/u, '/')}${entry}`, files);
    } else {
      files.push(child);
    }
  }
  return files;
}

test('frontend keeps Firebase limited to Auth, App Check, and FCM', async () => {
  const srcFiles = await listFiles('src');
  const source = (await Promise.all(srcFiles.map((file) => readFile(file, 'utf8')))).join('\n');
  const firebaseRuntime = await read('src/lib/firebase.ts');
  const serviceWorker = await read('src/sw.ts');

  assert.doesNotMatch(source, /firebase\/firestore|firebase\/functions|firebase\/storage|httpsCallable|getFirestore|getFunctions|getStorage/u);
  assert.doesNotMatch(source, /firebasestorage\.googleapis|storage\.googleapis/u);
  assert.match(firebaseRuntime, /getAuth/u);
  assert.match(serviceWorker, /firebase\/messaging\/sw/u);
  assert.doesNotMatch(firebaseRuntime, /VITE_ADMIN_EMAILS|VITE_FIREBASE_STORAGE_BUCKET|VITE_FIREBASE_FUNCTIONS_REGION/u);
});

test('Vercel deployment config is hosting-only', async () => {
  const vercelJson = await read('vercel.json');
  const hostingWorkflow = await read('.github/workflows/deploy-frontend.yml');
  const prWorkflow = await read('.github/workflows/verify-pr.yml');

  assert.match(vercelJson, /"headers"/u);
  assert.match(vercelJson, /"rewrites"/u);
  assert.match(hostingWorkflow, /npx -y vercel/u);
  assert.match(hostingWorkflow, /VITE_SUPABASE_URL/u);
  assert.match(hostingWorkflow, /VITE_SUPABASE_PUBLISHABLE_KEY/u);
  assert.doesNotMatch(hostingWorkflow, /VITE_ADMIN_EMAILS|VITE_FIREBASE_STORAGE_BUCKET|bootstrap-firebase/u);
  assert.doesNotMatch(prWorkflow, /functions\/|Firestore Rules|test:rules|firebase emulators|storage\.rules|firestore\.rules/u);
});

test('Supabase backend deployment owns database and Edge Functions', async () => {
  const workflow = await read('.github/workflows/deploy-backend.yml');
  const config = await read('supabase/config.toml');

  assert.match(workflow, /supabase\/setup-cli/u);
  assert.match(workflow, /actions\/setup-node/u);
  assert.match(workflow, /cache-node-modules/u);
  assert.match(workflow, /npm ci --prefer-offline/u);
  assert.match(workflow, /npm run test:architecture/u);
  assert.match(workflow, /supabase db push/u);
  assert.match(workflow, /supabase functions deploy backendAction/u);
  assert.match(workflow, /Smoke test backendAction deployment/u);
  assert.match(workflow, /x-healthcheck-secret/u);
  assert.match(workflow, /supabase functions deploy outboxWorker/u);
  assert.match(workflow, /supabase functions deploy maintenanceCleanup/u);
  assert.match(workflow, /Run maintenance cleanup/u);
  assert.match(workflow, /functions\/v1\/maintenanceCleanup/u);
  assert.match(workflow, /SUPABASE_ACCESS_TOKEN/u);
  assert.match(workflow, /CLOUDINARY_API_SECRET/u);
  assert.match(workflow, /APP_SUPABASE_SERVICE_ROLE_KEY/u);
  assert.doesNotMatch(workflow, /^\s+SUPABASE_SERVICE_ROLE_KEY=/mu);
  assert.doesNotMatch(workflow, /firebase-tools|firestore:rules|storage|Cloud Functions/u);
  assert.match(config, /\[functions\.backendAction\]/u);
  assert.match(config, /\[functions\.backendAction\]\s*verify_jwt = false/u);
  assert.match(config, /schemas = \["public", "graphql_public", "app_api", "app_private"\]/u);
});

test('Supabase schema includes RLS helpers, app tables, and hard-delete support', async () => {
  const migrations = await read('supabase/migrations/202607050001_supabase_baseline.sql');

  assert.match(migrations, /create schema if not exists app_private/u);
  assert.match(migrations, /create schema if not exists app_api/u);
  assert.match(migrations, /auth\.firebase_uid\(\)/u);
  assert.match(migrations, /auth\.firebase_project_id\(\)/u);
  assert.match(migrations, /create table if not exists app_private\.announcements/u);
  assert.match(migrations, /create table if not exists app_private\.notifications/u);
  assert.match(migrations, /create table if not exists app_private\.push_tokens/u);
  assert.match(migrations, /create table if not exists app_private\.notion_pages/u);
  assert.match(migrations, /references app_private\.issues\(id\) on delete cascade/u);
  assert.match(migrations, /create or replace function app_api\.delete_issue/u);
  assert.match(migrations, /insert into app_private\.outbox_events/u);
  assert.match(migrations, /delete from app_private\.issues/u);
  assert.match(migrations, /for update skip locked/u);
  assert.match(migrations, /for each statement/u);
  assert.match(migrations, /alter role authenticator set pgrst\.db_schemas = 'public, graphql_public, app_api, app_private'/u);
  assert.match(migrations, /notify pgrst, 'reload config'/u);
  assert.match(migrations, /grant all privileges on all tables in schema app_private to service_role/u);
  assert.match(migrations, /alter default privileges in schema app_private/u);
  assert.match(migrations, /grant select on app_private\.notifications to authenticated/u);
  assert.match(migrations, /grant select on app_private\.notification_states to authenticated/u);
  assert.match(migrations, /alter publication supabase_realtime add table app_private\.notifications/u);
  assert.match(migrations, /alter publication supabase_realtime add table app_private\.notification_states/u);
  assert.match(migrations, /create table if not exists app_private\.idempotency_keys/u);
  assert.match(migrations, /primary key \(uid, action, request_id\)/u);
  assert.match(migrations, /create or replace function app_api\.claim_idempotency_key/u);
  assert.match(migrations, /create or replace function app_api\.complete_idempotency_key/u);
  assert.match(migrations, /create or replace function app_api\.release_idempotency_key/u);
  assert.match(migrations, /create table if not exists app_private\.push_delivery_logs/u);
});

test('backendAction covers frontend actions and Cloudinary direct upload', async () => {
  const backendAction = [
    await read('supabase/functions/backendAction/index.ts'),
    await read('supabase/functions/backendAction/auth.ts'),
    await read('supabase/functions/backendAction/users.ts'),
    await read('supabase/functions/backendAction/uploads.ts'),
    await read('supabase/functions/backendAction/issues.ts'),
    await read('supabase/functions/backendAction/issue-create.ts'),
    await read('supabase/functions/backendAction/issue-delete.ts'),
    await read('supabase/functions/backendAction/issue-comments.ts'),
    await read('supabase/functions/backendAction/issue-moderation.ts'),
    await read('supabase/functions/backendAction/issue-support.ts'),
    await read('supabase/functions/backendAction/announcements.ts'),
    await read('supabase/functions/backendAction/announcement-comments.ts'),
    await read('supabase/functions/backendAction/announcement-read.ts'),
    await read('supabase/functions/backendAction/announcement-write.ts'),
    await read('supabase/functions/backendAction/notifications.ts'),
    await read('supabase/functions/backendAction/dashboard.ts'),
  ].join('\n');
  const firebaseAuth = await read('supabase/functions/_shared/firebase-auth.ts');
  const http = await read('supabase/functions/_shared/http.ts');
  const uploads = await read('src/services/uploads.ts');
  const backendActionService = await read('src/services/backend-action.ts');
  const supabaseAuthService = await read('src/services/supabase-auth.ts');
  const functionErrorService = await read('src/services/supabase-function-error.ts');
  const session = await read('src/composables/useSession.ts');

  for (const action of [
    'getCurrentUserRole',
    'createImageUploadSession',
    'finalizeImageUpload',
    'resolveUploadImageUrls',
    'createIssue',
    'deleteIssue',
    'listAnnouncements',
    'setAnnouncementLike',
    'listNotifications',
    'registerPushToken',
    'getPlatformDashboard',
  ]) {
    assert.match(backendAction, new RegExp(action, 'u'));
  }

  assert.match(uploads, /res\.cloudinary\.com|api\.cloudinary\.com/u);
  assert.match(uploads, /FormData/u);
  assert.doesNotMatch(uploads, /firebase\/storage|uploadBytes/u);
  assert.match(session, /fetchCurrentUserRole/u);
  assert.match(backendAction, /requireVerifiedFirebaseUser/u);
  assert.doesNotMatch(backendAction, /requireEligibleFirebaseUser/u);
  assert.match(backendAction, /healthcheck/u);
  assert.match(backendAction, /x-healthcheck-secret/u);
  assert.match(backendAction, /APP_SUPABASE_SERVICE_ROLE_KEY/u);
  assert.match(backendAction, /requestId/u);
  assert.match(backendAction, /const idempotentActions = new Set/u);
  assert.match(backendAction, /async function runWithIdempotency/u);
  assert.match(backendAction, /claim_idempotency_key/u);
  assert.match(backendAction, /complete_idempotency_key/u);
  assert.match(backendAction, /release_idempotency_key/u);
  assert.match(backendAction, /console\.error\(JSON\.stringify/u);
  assert.match(backendAction, /requireMethod\(request, "POST"\)/u);
  assert.match(backendAction, /readJsonRecord/u);
  assert.match(backendActionService, /auth\?\.currentUser\?\.getIdToken/u);
  assert.match(backendActionService, /Authorization: `Bearer \$\{token\}`/u);
  assert.match(backendActionService, /readSupabaseFunctionError/u);
  assert.match(supabaseAuthService, /Authorization: `Bearer \$\{token\.token\}`/u);
  assert.match(functionErrorService, /response\.clone\(\)\.json/u);
  assert.match(firebaseAuth, /accounts:lookup/u);
  assert.match(firebaseAuth, /ALLOWED_DOMAIN/u);
  assert.match(http, /errorStatus/u);
  assert.match(http, /is not configured/u);
  assert.match(http, /record\.message/u);
  assert.match(http, /record\.details/u);
  assert.match(http, /request-in-progress/u);
  assert.doesNotMatch(session, /adminEmails/u);
});

test('outbox, webhooks, FCM, and Notion deletion marks are guarded', async () => {
  const syncUser = await read('supabase/functions/syncUser/index.ts');
  const outboxWorker = await read('supabase/functions/outboxWorker/index.ts');
  const cloudinary = await read('supabase/functions/_shared/cloudinary.ts');
  const googleOauth = await read('supabase/functions/_shared/google-oauth.ts');
  const fcm = await read('supabase/functions/_shared/fcm.ts');
  const webhook = await read('supabase/functions/_shared/webhook.ts');
  const cloudinaryWebhook = await read('supabase/functions/cloudinaryWebhook/index.ts');
  const deletionJobs = await read('supabase/functions/processDeletionJobs/index.ts');
  const maintenanceCleanup = await read('supabase/functions/maintenanceCleanup/index.ts');
  const notion = await read('supabase/functions/_shared/notion.ts');

  assert.match(syncUser, /requireEligibleFirebaseUser/u);
  assert.match(syncUser, /requireMethod\(request, "POST"\)/u);
  assert.match(outboxWorker, /requireBearerSecret/u);
  assert.match(outboxWorker, /requireMethod\(request, "POST"\)/u);
  assert.match(outboxWorker, /errorMessage/u);
  assert.match(outboxWorker, /claim_outbox_events/u);
  assert.match(outboxWorker, /batch_size: 100/u);
  assert.match(outboxWorker, /sendFcmMessage/u);
  assert.match(outboxWorker, /push_delivery_logs/u);
  assert.match(outboxWorker, /push_comments_enabled/u);
  assert.match(outboxWorker, /markMappedNotionPageDeleted/u);
  assert.doesNotMatch(outboxWorker, /event_id.*request\.json/u);
  assert.match(cloudinary, /image\/destroy/u);
  assert.match(cloudinary, /createCloudinaryUploadSignature/u);
  assert.match(googleOauth, /npm:google-auth-library/u);
  assert.match(googleOauth, /cachedToken/u);
  assert.match(fcm, /fcm\.googleapis\.com\/v1\/projects/u);
  assert.match(webhook, /x-cld-signature/u);
  assert.match(webhook, /timingSafeEqual/u);
  assert.match(cloudinaryWebhook, /verifyCloudinarySignature/u);
  assert.match(cloudinaryWebhook, /requireMethod\(request, "POST"\)/u);
  assert.match(deletionJobs, /deleteCloudinaryAsset/u);
  assert.match(deletionJobs, /requireMethod\(request, "POST"\)/u);
  assert.match(deletionJobs, /errorMessage/u);
  assert.match(deletionJobs, /markNotionPageDeleted/u);
  assert.match(maintenanceCleanup, /requireBearerSecret/u);
  assert.match(maintenanceCleanup, /requireMethod\(request, "POST"\)/u);
  assert.match(maintenanceCleanup, /run_maintenance_cleanup/u);
  assert.match(maintenanceCleanup, /ISSUE_CATEGORY_IDS/u);
  assert.match(maintenanceCleanup, /valid_issue_categories/u);
  assert.match(notion, /name: "已刪除"/u);
  assert.match(notion, /ensureSelectOption/u);
  assert.match(notion, /"分類": \{ select: \{ name: categoryLabel \} \}/u);
  assert.match(notion, /"狀態": \{ select: \{ name: statusLabel \} \}/u);
  assert.doesNotMatch(notion, /archived: true/u);
});

test('removed issue categories are cleaned and Notion backups are marked deleted', async () => {
  const cleanupMigration = await read('supabase/migrations/202607060002_cleanup_removed_issue_categories.sql');
  const maintenanceCleanup = await read('supabase/functions/maintenanceCleanup/index.ts');
  const workflow = await read('.github/workflows/deploy-backend.yml');

  assert.match(cleanupMigration, /valid_issue_categories text\[\]/u);
  assert.match(cleanupMigration, /where not \(category = any\(valid_issue_categories\)\)/u);
  assert.match(cleanupMigration, /attached_target_type = 'issue'/u);
  assert.match(cleanupMigration, /attached_target_type = 'comment'/u);
  assert.match(cleanupMigration, /insert into app_private\.deletion_jobs \(target_type, target_id, cloudinary_public_id\)/u);
  assert.match(cleanupMigration, /insert into app_private\.outbox_events \(event_type, target_type, target_id, actor_uid, payload\)/u);
  assert.match(cleanupMigration, /'issue\.deleted'/u);
  assert.match(cleanupMigration, /delete from app_private\.uploads/u);
  assert.match(cleanupMigration, /delete from app_private\.issues/u);
  assert.doesNotMatch(cleanupMigration, /notion_pages|notion_page_id/u);
  assert.match(maintenanceCleanup, /ISSUE_CATEGORY_IDS/u);
  assert.match(maintenanceCleanup, /valid_issue_categories: \[\.\.\.ISSUE_CATEGORY_IDS\]/u);
  assert.match(workflow, /Run maintenance cleanup/u);
});

test('backend list actions use stable cursor pagination at the service boundary', async () => {
  const backendAction = [
    await read('supabase/functions/backendAction/utils.ts'),
    await read('supabase/functions/backendAction/issue-read.ts'),
    await read('supabase/functions/backendAction/issue-comments.ts'),
    await read('supabase/functions/backendAction/announcement-comments.ts'),
    await read('supabase/functions/backendAction/notifications.ts'),
  ].join('\n');
  const issuePages = await read('src/services/issues-read-pages.ts');
  const issueComments = await read('src/services/issues-read-comments.ts');
  const announcements = await read('src/services/announcements.ts');
  const notifications = await read('src/services/notifications.ts');

  assert.match(backendAction, /function applyDescendingDateCursor/u);
  assert.match(backendAction, /function applyAscendingDateCursor/u);
  assert.match(backendAction, /if \(action === "listIssues" \|\| action === "searchIssues"\)/u);
  assert.match(backendAction, /sort === "most-supported"/u);
  assert.match(backendAction, /sort === "ending-soon"/u);
  assert.match(backendAction, /action === "listIssues" && cursorId && cursorCreatedAt/u);
  assert.match(backendAction, /if \(action === "listComments"\)/u);
  assert.match(backendAction, /if \(action === "listAnnouncementComments"\)/u);
  assert.match(backendAction, /if \(action === "listNotifications"\)/u);
  assert.match(backendAction, /cursor: notifications\.length > pageSize/u);
  assert.match(issuePages, /normalizeIssueCursor\(result\.data\.cursor\)/u);
  assert.match(issueComments, /normalizeCommentCursor\(result\.data\.cursor\)/u);
  assert.match(announcements, /normalizeAnnouncementCursor\(result\.data\.cursor\)/u);
  assert.match(announcements, /normalizeCommentCursor\(result\.data\.cursor\)/u);
  assert.match(notifications, /normalizeNotificationCursor\(result\.data\.cursor\)/u);
});

test('personal notification writes and pushes are scoped to the recipient', async () => {
  const backendAction = [
    await read('supabase/functions/backendAction/issue-comments.ts'),
    await read('supabase/functions/backendAction/issue-delete.ts'),
    await read('supabase/functions/backendAction/issue-moderation.ts'),
    await read('supabase/functions/backendAction/announcement-comments.ts'),
  ].join('\n');
  const outboxWorker = await read('supabase/functions/outboxWorker/index.ts');
  const securityMigration = await read('supabase/migrations/202607050001_supabase_baseline.sql');
  const atomicOutboxMigration = await read('supabase/migrations/202607050006_atomic_content_outbox.sql');

  assert.match(atomicOutboxMigration, /'issue\.comment_created'/u);
  assert.match(atomicOutboxMigration, /'issue_author_uid', issue_record\.author_uid/u);
  assert.match(atomicOutboxMigration, /'issue\.status_changed'/u);
  assert.match(atomicOutboxMigration, /queue_announcement_comment_created/u);
  assert.match(backendAction, /rpc\("backend_delete_issue"/u);
  assert.match(securityMigration, /'issue\.deleted'/u);
  assert.match(securityMigration, /'author_uid', issue_record\.author_uid/u);
  assert.match(outboxWorker, /async function findIssueAuthorUid/u);
  assert.match(outboxWorker, /asString\(event\.payload\.issue_author_uid\)\s*\|\|\s*asString\(event\.payload\.author_uid\)/u);
  assert.match(outboxWorker, /async function resolveNotification/u);
  assert.match(outboxWorker, /recipientUid === event\.actor_uid/u);
  assert.match(outboxWorker, /recipient_uid: recipientUid/u);
  assert.match(outboxWorker, /query = query\.eq\("uid", recipientUid\)/u);
  assert.match(outboxWorker, /source === "admin"/u);
  assert.match(outboxWorker, /\.from\("user_roles"\)/u);
  assert.match(outboxWorker, /title: "新提案待審核"/u);
  assert.match(outboxWorker, /title: "新提案待處理"/u);
  assert.match(outboxWorker, /title: isReviewApproved \? "提案審核已通過" : "提案狀態已變更"/u);
  assert.match(outboxWorker, /`\$\{title\} 已通過審核並開放附議。`/u);
  assert.match(outboxWorker, /`\$\{title\} 現在狀態為 \$\{issueStatusLabel\(newStatus\)\}`/u);
  assert.match(outboxWorker, /title: "提案有新的留言"/u);
  assert.match(outboxWorker, /title: "提案已達附議門檻"/u);
  assert.match(outboxWorker, /title: "提案已被刪除"/u);
  assert.match(outboxWorker, /title: "有新的公告"/u);
  assert.match(outboxWorker, /title: "公告有新的留言"/u);
  assert.match(outboxWorker, /return text\.slice\(0, 80\)/u);
});

test('private issue data and upload URLs stay behind backend authorization', async () => {
  const migration = await read('supabase/migrations/202607050001_supabase_baseline.sql');
  const uploads = await read('supabase/functions/backendAction/uploads.ts');
  const support = await read('supabase/functions/backendAction/issue-support.ts');

  assert.match(migration, /revoke all on app_api\.issues from anon, authenticated/u);
  assert.match(uploads, /async function uploadAccess/u);
  assert.match(uploads, /canReadIssue\(issue, auth\)/u);
  assert.match(uploads, /issueIsPrivateToOwner/u);
  assert.match(support, /issueAllowsSupport/u);
  assert.match(support, /issue\.support_enabled !== true/u);
});

test('Markdown upload images support batch cache bypass for expired URLs', async () => {
  const uploads = await read('src/services/uploads.ts');
  const resolvedMarkdown = await read('src/composables/useResolvedMarkdown.ts');
  const markdownRenderer = await read('src/components/MarkdownRenderer.vue');

  assert.match(uploads, /resolveUploadImageUrls\(uploadIds: string\[\], options/u);
  assert.match(uploads, /forceRefresh/u);
  assert.match(uploads, /invalidateResolvedUploadCache/u);
  assert.match(resolvedMarkdown, /refreshUploadImageUrl/u);
  assert.match(resolvedMarkdown, /expiresAtByUploadId/u);
  assert.match(markdownRenderer, /@error\.capture/u);
  assert.match(markdownRenderer, /@click\.capture/u);
});

test('notification realtime subscriptions are shared and collision-resistant', async () => {
  const notificationsComposable = await read('src/composables/useNotifications.ts');
  const notificationsService = await read('src/services/notifications.ts');
  const appResume = await read('src/composables/useAppResume.ts');
  const realtimeMigration = await read('supabase/migrations/202607050002_fix_notification_realtime_rls.sql');
  const backendAuth = await read('supabase/functions/backendAction/auth.ts');

  assert.match(notificationsComposable, /let initialized = false/u);
  assert.match(notificationsComposable, /ensureNotificationsInitialized/u);
  assert.match(notificationsComposable, /registerAppResumeHandler\(startSubscriptions\)/u);
  assert.doesNotMatch(notificationsComposable, /onScopeDispose\(clearSubscriptions\)/u);
  assert.match(notificationsService, /let realtimeChannelSerial = 0/u);
  assert.match(notificationsService, /channelName = `notifications:\$\{source\}:\$\{uid\}:\$\{realtimeChannelSerial \+= 1\}`/u);
  assert.match(notificationsService, /channelName = `notification-state:\$\{uid\}:\$\{realtimeChannelSerial \+= 1\}`/u);
  assert.match(notificationsService, /event: 'INSERT'/u);
  assert.match(notificationsService, /recipient_uid=eq\.\$\{uid\}/u);
  assert.match(notificationsService, /source=eq\.\$\{source\}/u);
  assert.match(notificationsService, /filter: `uid=eq\.\$\{uid\}`/u);
  assert.match(notificationsComposable, /insertRealtimeNotification/u);
  assert.doesNotMatch(notificationsComposable, /isPersonalNotificationVisible/u);
  assert.match(realtimeMigration, /where key = 'firebase_project_id'/u);
  assert.match(backendAuth, /key: "firebase_project_id"/u);
  assert.match(appResume, /export function registerAppResumeHandler/u);
});

test('notification navigation verifies target access before routing', async () => {
  const navigation = await read('src/composables/useNotificationNavigation.ts');
  const notificationBell = await read('src/components/NotificationBell.vue');
  const notificationsView = await read('src/views/NotificationsView.vue');
  const issueRead = await read('supabase/functions/backendAction/issue-read.ts');

  assert.match(navigation, /await fetchIssueRecordById\(notification\.target_id\)/u);
  assert.match(navigation, /filter: issue\.category/u);
  assert.match(navigation, /notification\.type === 'issue_deleted'/u);
  assert.match(notificationBell, /return notification\.title/u);
  assert.match(notificationBell, /return notification\.body_preview \|\| ''/u);
  assert.match(notificationsView, /return notification\.title/u);
  assert.match(notificationsView, /return notification\.body_preview \|\| ''/u);
  assert.match(issueRead, /and\(author_uid\.eq\.\$\{auth\.uid\},status\.in\./u);
});
