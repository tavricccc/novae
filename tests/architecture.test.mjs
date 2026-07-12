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

test('runtime fonts are local compressed subsets', async () => {
  const style = await read('src/style.css');

  assert.match(style, /inter-latin-400-700\.woff2/u);
  assert.match(style, /jetbrains-mono-latin-400-600\.woff2/u);
  assert.match(style, /material-symbols-outlined-500\.woff2/u);
  assert.doesNotMatch(style, /fonts\.googleapis|fonts\.gstatic|\.ttf/u);
});

test('Vercel deployment config is hosting-only', async () => {
  const vercelJson = await read('vercel.json');
  const vercelConfig = JSON.parse(vercelJson);
  const hostingWorkflow = await read('.github/workflows/deploy-frontend.yml');
  const prWorkflow = await read('.github/workflows/verify-pr.yml');

  assert.match(vercelJson, /"headers"/u);
  assert.match(vercelJson, /"rewrites"/u);
  assert.match(vercelJson, /script-src 'self' 'wasm-unsafe-eval' https:\/\/apis\.google\.com https:\/\/www\.google\.com\/recaptcha\/ https:\/\/www\.gstatic\.com\/recaptcha\//u);
  assert.doesNotMatch(vercelJson, /script-src[^;]*'unsafe-eval'/u);
  const globalHeaders = vercelConfig.headers.find((entry) => entry.source === '/(.*)')?.headers ?? [];
  assert.equal(globalHeaders.some((header) => header.key.toLowerCase() === 'cache-control'), false);
  assert.match(vercelJson, /\/assets\/\(\.\*\)[\s\S]*max-age=31536000, immutable/u);
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
  const runtimeConstraintMigration = await read('supabase/migrations/202607090003_harden_runtime_data_constraints.sql');
  const uploadAttachmentUuidFix = await read('supabase/migrations/202607110008_fix_upload_attachment_uuid.sql');

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
  assert.match(runtimeConstraintMigration, /push_tokens_permission_check/u);
  assert.match(runtimeConstraintMigration, /permission in \('default', 'denied', 'granted'\)/u);
  assert.match(runtimeConstraintMigration, /push_tokens_length_check/u);
  assert.match(runtimeConstraintMigration, /validate constraint issues_status_check/u);
  assert.match(runtimeConstraintMigration, /validate constraint uploads_dimensions_non_negative/u);
  assert.match(runtimeConstraintMigration, /validate constraint announcements_counts_non_negative/u);
  assert.match(uploadAttachmentUuidFix, /attached_target_id = new\.id/u);
  assert.match(uploadAttachmentUuidFix, /attached_target_id = old\.id/u);
  assert.doesNotMatch(uploadAttachmentUuidFix, /attached_target_id = (?:new|old)\.id::text/u);
});

test('backendAction covers frontend actions and Cloudinary direct upload', async () => {
  const backendAction = [
    await read('supabase/functions/backendAction/index.ts'),
    await read('supabase/functions/backendAction/action-registry.ts'),
    await read('supabase/functions/backendAction/response.ts'),
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
  const announcementsService = await read('src/services/announcements.ts');
  const announcementLikeFixMigration = await read('supabase/migrations/202607090004_fix_announcement_like_ambiguity.sql');
  const backendActionService = await read('src/services/backend-action.ts');
  const supabaseAuthService = await read('src/services/supabase-auth.ts');
  const functionErrorService = await read('src/services/supabase-function-error.ts');
  const session = await read('src/composables/useSession.ts');

  for (const action of [
    'getCurrentUserRole',
    'createImageUploadSessions',
    'finalizeImageUploads',
    'deleteUploadedImages',
    'resolveUploadImageUrls',
    'createIssue',
    'deleteIssue',
    'listAnnouncements',
    'setAnnouncementLike',
    'listNotificationPages',
    'registerPushToken',
    'getPlatformDashboard',
  ]) {
    assert.match(backendAction, new RegExp(action, 'u'));
  }

  assert.match(uploads, /res\.cloudinary\.com|api\.cloudinary\.com/u);
  assert.match(uploads, /FormData/u);
  assert.match(uploads, /createImageUploadSessions/u);
  assert.match(uploads, /finalizeImageUploads/u);
  assert.match(uploads, /deleteUploadedImages/u);
  assert.doesNotMatch(uploads, /'createImageUploadSession'|'finalizeImageUpload'|'deleteUploadedImage'/u);
  assert.doesNotMatch(uploads, /firebase\/storage|uploadBytes/u);
  assert.match(session, /fetchCurrentUserRole/u);
  assert.match(backendAction, /requireVerifiedFirebaseUser/u);
  assert.doesNotMatch(backendAction, /requireEligibleFirebaseUser/u);
  assert.match(backendAction, /healthcheck/u);
  assert.match(backendAction, /x-healthcheck-secret/u);
  assert.match(backendAction, /APP_SUPABASE_SERVICE_ROLE_KEY/u);
  assert.match(backendAction, /requestId/u);
  assert.match(backendAction, /backendActionDefinitions/u);
  assert.match(backendAction, /idempotentWrite/u);
  assert.match(backendAction, /idempotentWrite\("setAnnouncementLike"/u);
  assert.match(backendAction, /async function runWithIdempotency/u);
  assert.match(backendAction, /claim_idempotency_key/u);
  assert.match(backendAction, /complete_idempotency_key/u);
  assert.match(backendAction, /release_idempotency_key/u);
  assert.match(backendAction, /successResponse/u);
  assert.match(backendAction, /errorResponse/u);
  assert.match(backendAction, /success: true/u);
  assert.match(backendAction, /success: false/u);
  assert.match(backendAction, /console\.error\(JSON\.stringify/u);
  assert.match(backendAction, /method-not-allowed/u);
  assert.match(backendAction, /readJsonRecord/u);
  assert.match(backendActionService, /getFirebaseIdToken/u);
  assert.match(backendActionService, /Authorization: `Bearer \$\{token\}`/u);
  assert.match(backendActionService, /readSupabaseFunctionError/u);
  assert.match(backendActionService, /BackendActionEnvelope/u);
  assert.match(announcementsService, /setAnnouncementLike[\s\S]*requestId: createRequestId\(\)/u);
  assert.match(announcementLikeFixMigration, /on conflict on constraint announcement_likes_pkey/u);
  assert.match(announcementLikeFixMigration, /announcement_likes\.uid = backend_set_announcement_like\.actor_uid/u);
  assert.match(supabaseAuthService, /Authorization: `Bearer \$\{token\.token\}`/u);
  assert.match(functionErrorService, /response\.clone\(\)\.json/u);
  assert.match(firebaseAuth, /accounts:lookup/u);
  assert.match(firebaseAuth, /firebaseUser\.disabled === true/u);
  assert.match(firebaseAuth, /tokenAuthTime < tokensValidAfter/u);
  assert.match(firebaseAuth, /FIREBASE_USER_CACHE_SECONDS = 15 \* 60/u);
  assert.match(firebaseAuth, /UPSTASH_REDIS_REST_URL/u);
  assert.match(firebaseAuth, /firebaseUser = await lookupFirebaseUser[\s\S]*await cacheFirebaseUser/u);
  assert.match(firebaseAuth, /ALLOWED_DOMAIN/u);
  assert.match(http, /errorStatus/u);
  assert.match(http, /is not configured/u);
  assert.match(http, /record\.message/u);
  assert.match(http, /record\.details/u);
  assert.match(http, /request-in-progress/u);
  assert.doesNotMatch(session, /adminEmails/u);
  assert.match(backendAction, /max_file_size/u);
  assert.match(uploads, /body\.set\('max_file_size'/u);
});

test('backendAction registry owns action metadata and frontend action names', async () => {
  const registry = await read('supabase/functions/backendAction/action-registry.ts');
  const frontendContract = await read('src/services/backend-action-contract.ts');
  const rateLimit = await read('supabase/functions/backendAction/rate-limit.ts');
  const index = await read('supabase/functions/backendAction/index.ts');
  const serviceFiles = (await listFiles('src/services'))
    .filter((file) => !file.pathname.endsWith('/backend-action.ts'));
  const services = (await Promise.all(serviceFiles.map((file) => readFile(file, 'utf8')))).join('\n');

  const frontendActions = [...services.matchAll(/invokeBackendAction[\s\S]*?\);/gu)]
    .map((match) => match[0].match(/(?:invokeBackendAction\(|>\()'([^']+)'/u)?.[1])
    .filter(Boolean)
    .sort();
  assert.ok(frontendActions.length > 20);
  for (const actionName of frontendActions) {
    assert.match(registry, new RegExp(`["']${actionName}["']`, 'u'));
    assert.match(frontendContract, new RegExp(`'${actionName}'`, 'u'));
  }

  const registeredActions = [...registry.matchAll(/(?:action|idempotentWrite)\("([^"]+)",\s*"([^"]+)",\s*"([^"]+)"/gu)];
  assert.doesNotMatch(rateLimit, /definition\.name/u);
  assert.match(rateLimit, /actionName: limits\.prefix/u);
  assert.match(rateLimit, /actionName: `\$\{limits\.prefix\}\.second`/u);
  assert.ok(registeredActions.length > 20);
  for (const [, actionName, domain, rateLimitGroup] of registeredActions) {
    assert.match(frontendContract, new RegExp(`'${actionName}'`, 'u'));
    assert.match(
      registry,
      new RegExp(`\\| "${domain}"`, 'u'),
      `${actionName} uses an unknown backend action domain`,
    );
    assert.match(
      rateLimit,
      new RegExp(`case "${rateLimitGroup}":`, 'u'),
      `${actionName} uses an unknown rate limit group`,
    );
  }

  assert.match(registry, /function idempotentWrite/u);
  assert.match(registry, /idempotent: true,\s+requiresRequestId: true/u);

  assert.match(index, /getBackendActionDefinition\(action\)/u);
  assert.match(index, /definition\.requiresAdmin && !auth\.isAdmin/u);
  assert.match(index, /definition\.requiresRequestId && !requestId/u);
  assert.match(registry, /requiresAdmin: true/u);
  assert.doesNotMatch(index, /const idempotentActions = new Set/u);
  assert.doesNotMatch(rateLimit, /const readActions = new Set/u);
  assert.doesNotMatch(rateLimit, /backend\.unknown/u);
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
  assert.match(outboxWorker, /batch_size: 10/u);
  assert.match(deletionJobs, /batch_size: 10/u);
  const usageHardening = await read('supabase/migrations/202607100004_security_usage_hardening.sql');
  assert.match(usageHardening, /current_setting\('app\.outbox_worker_signaled', true\)/u);
  assert.match(usageHardening, /current_setting\('app\.deletion_worker_signaled', true\)/u);
  assert.match(usageHardening, /set_config\('app\.deletion_worker_signaled', '1', true\)/u);
  assert.match(usageHardening, /create or replace function app_api\.resignal_background_worker/u);
  assert.match(usageHardening, /jobname = 'srp_retry_background_workers'/u);
  assert.match(usageHardening, /'\* \* \* \* \*'/u);
  assert.match(outboxWorker, /rpc\("resignal_background_worker", \{ worker_name: "outbox" \}\)/u);
  assert.match(deletionJobs, /rpc\("resignal_background_worker", \{ worker_name: "deletion" \}\)/u);
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

test('transient database tables have explicit retention coverage', async () => {
  const retentionMigration = await read('supabase/migrations/202607090006_database_retention_minimization.sql');
  const uploads = await read('supabase/functions/backendAction/uploads.ts');

  assert.match(retentionMigration, /alter table app_private\.notifications[\s\S]*now\(\) \+ interval '7 days'/u);
  assert.match(retentionMigration, /alter table app_private\.realtime_events[\s\S]*now\(\) \+ interval '1 day'/u);
  assert.match(retentionMigration, /alter table app_private\.idempotency_keys[\s\S]*now\(\) \+ interval '24 hours'/u);
  assert.match(retentionMigration, /create or replace function app_api\.complete_outbox_event[\s\S]*expires_at = now\(\) \+ interval '1 day'/u);
  assert.match(retentionMigration, /create or replace function app_api\.fail_outbox_event[\s\S]*expires_at = now\(\) \+ interval '3 days'/u);
  assert.match(retentionMigration, /create or replace function app_api\.complete_idempotency_key[\s\S]*expires_at = now\(\) \+ interval '24 hours'/u);

  for (const tableName of [
    'realtime_events',
    'notifications',
    'outbox_events',
    'push_delivery_logs',
    'idempotency_keys',
    'push_tokens',
    'deletion_jobs',
    'maintenance_runs',
  ]) {
    assert.match(
      retentionMigration,
      new RegExp(`(?:delete from|update) app_private\\.${tableName}`, 'u'),
      `${tableName} must be handled by maintenance cleanup`,
    );
  }

  assert.match(retentionMigration, /status = 'ready' and attached_target_id is null and updated_at < now\(\) - interval '48 hours'/u);
  assert.match(retentionMigration, /status = 'failed' and updated_at < now\(\) - interval '24 hours'/u);
  assert.match(retentionMigration, /delivery_url_expires_at < now\(\)/u);
  assert.match(retentionMigration, /status = 'sent' and updated_at < now\(\) - interval '1 day'/u);
  assert.match(retentionMigration, /status = 'failed' and updated_at < now\(\) - interval '3 days'/u);
  assert.match(retentionMigration, /status = 'completed' and updated_at < now\(\) - interval '1 day'/u);

  assert.match(uploads, /const PRIVATE_URL_LIFETIME_MS = 7 \* 24 \* 60 \* 60 \* 1000/u);
  assert.doesNotMatch(uploads, /delivery_url_expires_at: expiresAt\.toISOString\(\),\s+updated_at:/u);
});

test('backend list actions use stable cursor pagination at the service boundary', async () => {
  const backendAction = [
    await read('supabase/functions/backendAction/utils.ts'),
    await read('supabase/functions/backendAction/issue-read.ts'),
    await read('supabase/functions/backendAction/issue-comments.ts'),
    await read('supabase/functions/backendAction/announcement-comments.ts'),
    await read('supabase/functions/backendAction/notifications.ts'),
  ].join('\n');
  const issueReadMigration = await read('supabase/migrations/202607080002_backend_issue_read_rpc.sql');
  const issuePages = await read('src/services/issues-read-pages.ts');
  const issueComments = await read('src/services/issues-read-comments.ts');
  const announcements = await read('src/services/announcements.ts');
  const notifications = await read('src/services/notifications.ts');
  const mostSupportedCursorMigration = await read('supabase/migrations/202607090002_fix_most_supported_cursor.sql');
  const alignedIssueSortMigration = await read('supabase/migrations/202607110009_align_issue_sort_cursor.sql');
  const issueSort = await read('src/lib/issue-sort.ts');
  const announcementSort = await read('src/lib/announcement-sort.ts');

  assert.match(backendAction, /function applyDescendingDateCursor/u);
  assert.match(backendAction, /function applyAscendingDateCursor/u);
  assert.match(backendAction, /if \(action === "listIssues" \|\| action === "searchIssues"\)/u);
  assert.match(backendAction, /rpc\("backend_list_issues"/u);
  assert.match(backendAction, /rpc\("backend_list_user_issues"/u);
  assert.match(backendAction, /cursor_created_at: readCursorDate\(cursor, "created_at"\) \|\| null/u);
  assert.match(backendAction, /private_to_owner_categories: PRIVATE_TO_OWNER_CATEGORIES/u);
  assert.match(issueReadMigration, /sort_name = 'most-supported'/u);
  assert.match(issueReadMigration, /sort_name = 'ending-soon'/u);
  assert.match(issueReadMigration, /cursor_id is null/u);
  assert.match(backendAction, /if \(action === "listComments"\)/u);
  assert.match(backendAction, /if \(action === "listAnnouncementComments"\)/u);
  assert.match(backendAction, /if \(action === "listNotificationPages"\)/u);
  assert.match(backendAction, /rpc\("backend_list_notifications"/u);
  assert.match(backendAction, /cursor_created_at: readCursorDate\(cursor, "createdAtMs", "created_at"\) \|\| null/u);
  assert.match(issuePages, /normalizeIssueCursor\(result\.cursor\)/u);
  assert.match(issueComments, /normalizeCommentCursor\(result\.cursor\)/u);
  assert.match(announcements, /normalizeAnnouncementCursor\(result\.cursor\)/u);
  assert.match(announcements, /normalizeCommentCursor\(result\.cursor\)/u);
  assert.match(notifications, /normalizeNotificationCursor\(page\.cursor\)/u);
  assert.match(mostSupportedCursorMigration, /effective_sort_name = 'most-supported'/u);
  assert.match(mostSupportedCursorMigration, /coalesce\(cursor_sort_date, cursor_created_at\)/u);
  assert.match(mostSupportedCursorMigration, /when effective_sort_name = 'most-supported' then last_issue -> 'created_at_ms'/u);
  assert.match(alignedIssueSortMigration, /coalesce\(last_issue -> 'review_approved_at_ms', last_issue -> 'created_at_ms'\)/u);
  assert.match(alignedIssueSortMigration, /coalesce\(review_approved_at, created_at\) < coalesce\(cursor_sort_date, cursor_created_at\)/u);
  assert.match(issueSort, /issue\.review_approved_at \?\? issue\.created_at/u);
  assert.match(issueSort, /issue\.closed_at \?\? issue\.created_at/u);
  assert.match(announcementSort, /right\.published_at/u);
});

test('content writes validate markdown uploads before database writes', async () => {
  const uploads = await read('supabase/functions/backendAction/uploads.ts');
  const issueCreate = await read('supabase/functions/backendAction/issue-create.ts');
  const issueComments = await read('supabase/functions/backendAction/issue-comments.ts');
  const announcementWrite = await read('supabase/functions/backendAction/announcement-write.ts');
  const announcementComments = await read('supabase/functions/backendAction/announcement-comments.ts');
  const hardeningMigration = await read('supabase/migrations/202607100004_security_usage_hardening.sql');

  assert.match(uploads, /function extractMarkdownUploadIds/u);
  assert.match(uploads, /export async function validateMarkdownUploadsBeforeCreate/u);
  assert.match(uploads, /export async function validateMarkdownUploadsBeforeUpdate/u);
  assert.match(uploads, /upload\.attached_target_type === targetType && upload\.attached_target_id === targetId/u);
  assert.match(uploads, /upload\.owner_uid === ownerUid && !upload\.attached_target_id/u);
  assert.match(hardeningMigration, /create trigger attach_issue_markdown_uploads/u);
  assert.match(hardeningMigration, /target_type_name = 'announcement' or owner_uid = new\.author_uid/u);
  assert.match(hardeningMigration, /revoke all on function app_private\.emit_content_realtime_event[\s\S]*from public, anon, authenticated/u);
  assert.ok(
    issueCreate.indexOf('validateMarkdownUploadsBeforeCreate') < issueCreate.indexOf('rpc("backend_create_issue"'),
    'issue creation must validate upload attachments before creating the issue',
  );
  assert.ok(
    issueComments.indexOf('validateMarkdownUploadsBeforeCreate') < issueComments.indexOf('rpc("backend_create_issue_comment"'),
    'issue comment creation must validate upload attachments before creating the comment',
  );
  assert.ok(
    announcementWrite.indexOf('validateMarkdownUploadsBeforeCreate') < announcementWrite.indexOf('rpc("backend_create_announcement"'),
    'announcement creation must validate upload attachments before creating the announcement',
  );
  assert.ok(
    announcementWrite.indexOf('validateMarkdownUploadsBeforeUpdate') < announcementWrite.indexOf('rpc("backend_update_announcement"'),
    'announcement updates must validate upload attachments before updating the announcement',
  );
  assert.ok(
    announcementComments.indexOf('validateMarkdownUploadsBeforeCreate') < announcementComments.indexOf('rpc("backend_create_announcement_comment"'),
    'announcement comment creation must validate upload attachments before creating the comment',
  );
});

test('comment realtime triggers pass an explicit operation to the emitter', async () => {
  const migration = await read('supabase/migrations/202607120001_fix_comment_realtime_overload.sql');

  assert.match(migration, /queue_issue_comment_realtime_event[\s\S]*lower\(tg_op\)/u);
  assert.match(migration, /queue_announcement_comment_realtime_event[\s\S]*lower\(tg_op\)/u);
  assert.match(
    migration,
    /drop function if exists app_private\.emit_content_realtime_event\([\s\S]*integer\s*\);/u,
  );
  assert.match(migration, /comment_count integer,\s*op text\s*\)/u);
  assert.doesNotMatch(migration, /op text default/u);
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
  const announcementCommentNotificationMigration = await read('supabase/migrations/202607090005_announcement_comment_author_notifications.sql');

  assert.match(atomicOutboxMigration, /'issue\.comment_created'/u);
  assert.match(atomicOutboxMigration, /'issue_author_uid', issue_record\.author_uid/u);
  assert.match(atomicOutboxMigration, /'issue\.status_changed'/u);
  assert.match(atomicOutboxMigration, /queue_announcement_comment_created/u);
  assert.match(announcementCommentNotificationMigration, /'announcement_author_uid', announcement_record\.author_uid/u);
  assert.match(backendAction, /rpc\("backend_delete_issue_with_upload_targets"/u);
  assert.match(securityMigration, /'issue\.deleted'/u);
  assert.match(securityMigration, /'author_uid', issue_record\.author_uid/u);
  assert.match(outboxWorker, /async function findIssueAuthorUid/u);
  assert.match(outboxWorker, /async function findAnnouncementCommentRecipientUid/u);
  assert.match(outboxWorker, /asString\(event\.payload\.issue_author_uid\)\s*\|\|\s*asString\(event\.payload\.author_uid\)/u);
  assert.match(outboxWorker, /asString\(event\.payload\.announcement_author_uid\)/u);
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
  assert.match(outboxWorker, /title: `來自 \$\{authorName\} 的留言`/u);
  assert.match(outboxWorker, /title: "提案已達附議門檻"/u);
  assert.match(outboxWorker, /title: "提案已被刪除"/u);
  assert.match(outboxWorker, /title: "有新的公告"/u);
  assert.match(outboxWorker, /source: "broadcast"[\s\S]*type: "announcement_created"/u);
  assert.match(outboxWorker, /title: `來自 \$\{authorName\} 的留言`/u);
  assert.match(outboxWorker, /return text\.slice\(0, 80\)/u);
});

test('private issue data and upload URLs stay behind backend authorization', async () => {
  const migration = await read('supabase/migrations/202607050001_supabase_baseline.sql');
  const uploads = await read('supabase/functions/backendAction/uploads.ts');
  const support = await read('supabase/functions/backendAction/issue-support.ts');

  assert.match(migration, /revoke all on app_api\.issues from anon, authenticated/u);
  assert.match(uploads, /async function resolveUploadAccessBatch/u);
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
  assert.match(notificationsComposable, /registerAppResumeHandler\(reconnectNotificationsAfterResume\)/u);
  assert.match(notificationsComposable, /NOTIFICATION_RESUME_RECONNECT_MS = 10 \* 60_000/u);
  assert.match(notificationsComposable, /fetchNotificationSnapshot\(activeSources\.value, uid\)/u);
  assert.doesNotMatch(notificationsComposable, /setInterval/u);
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

test('app updates hand over the service worker with bounded reload recovery', async () => {
  const appUpdate = await read('src/composables/useAppUpdate.ts');
  const serviceWorker = await read('src/sw.ts');
  const realtimeEvents = await read('src/services/realtime-events.ts');

  assert.match(appUpdate, /SERVICE_WORKER_PREPARE_TIMEOUT_MS = 4_000/u);
  assert.match(appUpdate, /waitForServiceWorkerTakeover/u);
  assert.match(appUpdate, /registration\.waiting\?\.postMessage\(\{ type: 'SKIP_WAITING' \}\)/u);
  assert.match(appUpdate, /RELOAD_RECOVERY_TIMEOUT_MS = 10_000/u);
  assert.match(serviceWorker, /event\.data[\s\S]*SKIP_WAITING/u);
  assert.match(realtimeEvents, /content-realtime:shared:\$\{realtimeChannelSerial \+= 1\}/u);
});

test('push notification registration recovers without overriding an explicit opt-out', async () => {
  const pushNotifications = await read('src/composables/usePushNotifications.ts');
  const pushPrompt = await read('src/composables/usePushPermissionPrompt.ts');
  const promptDialog = await read('src/components/PushPermissionPromptDialog.vue');

  assert.match(pushPrompt, /PUSH_PROMPT_COOLDOWN_MS/u);
  assert.match(pushPrompt, /needsRegistrationRepair/u);
  assert.match(pushPrompt, /useAppResume\(\(\) =>/u);
  assert.match(pushPrompt, /mode\.value = 'repair'/u);
  assert.match(pushNotifications, /needsRegistrationRepair/u);
  assert.match(pushNotifications, /preference\.deviceEnabled && currentToken/u);
  assert.match(pushNotifications, /registerCurrentPushToken\(currentToken\)/u);
  assert.match(pushNotifications, /setExplicitlyDisabled\(true\)/u);
  assert.match(pushNotifications, /setExplicitlyDisabled\(false\)/u);
  assert.match(promptDialog, /重新啟用推播通知/u);
});

test('notification navigation verifies target access before routing', async () => {
  const navigation = await read('src/composables/useNotificationNavigation.ts');
  const notificationBell = await read('src/components/NotificationBell.vue');
  const notificationsView = await read('src/views/NotificationsView.vue');
  const issueRead = await read('supabase/functions/backendAction/issue-read.ts');
  const issueReadMigration = await read('supabase/migrations/202607080002_backend_issue_read_rpc.sql');

  assert.match(navigation, /await fetchIssueRecordById\(notification\.target_id\)/u);
  assert.match(navigation, /filter: issue\.category/u);
  assert.match(navigation, /notification\.type === 'issue_deleted'/u);
  assert.match(notificationBell, /return notification\.title/u);
  assert.match(notificationBell, /return notification\.body_preview \|\| ''/u);
  assert.match(notificationsView, /return notification\.title/u);
  assert.match(notificationsView, /return notification\.body_preview \|\| ''/u);
  assert.match(issueRead, /review_required_categories: REVIEW_REQUIRED_CATEGORIES/u);
  assert.match(issueRead, /rpc\("backend_get_issue"/u);
  assert.match(issueReadMigration, /author_uid = actor_uid/u);
  assert.match(issueReadMigration, /status in \('under-review', 'review-rejected'\)/u);
});

test('cost-sensitive hot paths use aggregation, patching, and lazy startup', async () => {
  const supportMigration = await read('supabase/migrations/202607110001_cost_perf_support_notion.sql');
  const realtimeMigration = await read('supabase/migrations/202607110003_realtime_patch_operations.sql');
  const dashboardMigration = await read('supabase/migrations/202607110005_dashboard_counters.sql');
  const cleanupMigration = await read('supabase/migrations/202607110006_remove_obsolete_runtime_data.sql');
  const topicMigration = await read('supabase/migrations/202607110007_push_topic_state.sql');
  const board = await read('src/composables/useIssueBoardData.ts');
  const appShell = await read('src/components/AppShell.vue');
  const firebase = await read('src/lib/firebase.ts');
  const messaging = await read('src/lib/firebase-messaging.ts');
  const fcm = await read('supabase/functions/_shared/fcm.ts');
  const uploads = await read('supabase/functions/backendAction/uploads.ts');
  const vite = await read('vite.config.ts');

  assert.match(supportMigration, /locked_until/u);
  assert.match(supportMigration, /claimed_updated_at/u);
  assert.match(realtimeMigration, /add column if not exists op/u);
  assert.match(board, /fetchIssueRecordById/u);
  assert.doesNotMatch(board, /scheduleRealtimeRefresh/u);
  assert.match(appShell, /useNotificationBadge/u);
  assert.doesNotMatch(firebase, /firebase\/messaging/u);
  assert.match(messaging, /import\('firebase\/messaging'\)/u);
  assert.match(vite, /firebase-messaging-\*\.js/u);
  assert.match(vite, /firebase-app-check-\*\.js/u);
  assert.match(fcm, /srp-broadcast/u);
  assert.match(fcm, /iid\/v1/u);
  assert.match(topicMigration, /topic_broadcast/u);
  assert.match(uploads, /resolveUploadAccessBatch/u);
  assert.match(uploads, /select\("id,category,status,author_uid"\)/u);
  assert.match(dashboardMigration, /platform_category_counters/u);
  assert.doesNotMatch(dashboardMigration, /from app_private\.issues group by category\) grouped/u);
  assert.match(cleanupMigration, /support\.created/u);
  assert.match(cleanupMigration, /drop column if exists secure_url/u);
});
