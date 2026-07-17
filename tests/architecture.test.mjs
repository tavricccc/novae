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
  const main = await read('src/main.ts');
  const style = await read('src/style.css');
  const baseStyle = await read('src/styles/base.css');
  const tailwindConfig = await read('tailwind.config.cjs');
  const viteConfig = await read('vite.config.ts');

  assert.match(main, /harmonyos-sans-webfont-splitted/u);
  assert.match(baseStyle, /jetbrains-mono-latin-400-600\.woff2/u);
  assert.match(tailwindConfig, /sans: \['HarmonyOS Sans TC', 'HarmonyOS Sans SC'/u);
  assert.doesNotMatch(tailwindConfig, /Inter/u);
  assert.doesNotMatch(viteConfig, /globPatterns:[\s\S]*woff2/u);
  assert.doesNotMatch(style, /material-symbols|Material Symbols/u);
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

  assert.match(workflow, /supabase\/setup-cli@v3[\s\S]*version: latest/u);
  assert.match(workflow, /actions\/setup-node@v7/u);
  assert.match(workflow, /cache-node-modules/u);
  assert.match(workflow, /npm ci --prefer-offline/u);
  assert.match(workflow, /npm run test:architecture/u);
  assert.match(workflow, /supabase db push/u);
  assert.match(workflow, /prepare-edge-functions\.mjs prepare/u);
  assert.match(workflow, /supabase functions deploy \$names --no-verify-jwt/u);
  assert.match(workflow, /function_namespace="n\$\{EDGE_FUNCTION_NAMESPACE\}"/u);
  assert.match(workflow, /Deploy Cloudflare API Gateway/u);
  assert.match(workflow, /wrangler@4\.111\.0 secret bulk/u);
  assert.match(workflow, /wrangler@4\.111\.0 deploy/u);
  assert.match(workflow, /for attempt in \$\(seq 1 12\)/u);
  assert.match(workflow, /"code":"origin-denied"/u);
  assert.match(workflow, /Smoke test API origin deployment/u);
  assert.match(workflow, /x-healthcheck-secret/u);
  assert.match(workflow, /x-novae-origin-secret/u);
  assert.match(workflow, /EDGE_FUNCTION_NAMESPACE/u);
  assert.match(workflow, /Run maintenance cleanup/u);
  assert.match(workflow, /function_namespace\}-maintenance/u);
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
    await read('supabase/functions/backendAction/execution.ts'),
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
  const apiErrors = await read('supabase/functions/_shared/api-errors.ts');
  const uploads = await read('src/services/uploads.ts');
  const announcementsService = await read('src/services/announcements.ts');
  const announcementLikeFixMigration = await read('supabase/migrations/202607090004_fix_announcement_like_ambiguity.sql');
  const backendActionService = await read('src/services/backend-action.ts');
  const supabaseAuthService = await read('src/services/supabase-auth.ts');
  const apiGateway = await read('src/lib/api-gateway.ts');
  const originGate = await read('supabase/functions/_shared/origin.ts');
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
  assert.match(backendActionService, /apiGatewayUrl\('\/v1\/actions'\)/u);
  assert.doesNotMatch(backendActionService, /functions\.invoke/u);
  assert.match(backendActionService, /BackendActionEnvelope/u);
  assert.match(announcementsService, /setAnnouncementLike[\s\S]*requestId: createRequestId\(\)/u);
  assert.match(announcementLikeFixMigration, /on conflict on constraint announcement_likes_pkey/u);
  assert.match(announcementLikeFixMigration, /announcement_likes\.uid = backend_set_announcement_like\.actor_uid/u);
  assert.match(supabaseAuthService, /Authorization: `Bearer \$\{token\.token\}`/u);
  assert.match(supabaseAuthService, /apiGatewayUrl\('\/v1\/auth\/sync'\)/u);
  assert.match(apiGateway, /VITE_API_BASE_URL/u);
  assert.match(originGate, /EDGE_ORIGIN_SECRET/u);
  assert.match(backendAction, /requireOriginSecret/u);
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
  assert.match(apiErrors, /request-in-progress/u);
  assert.doesNotMatch(session, /adminEmails/u);
  assert.doesNotMatch(backendAction, /max_file_size/u);
  assert.doesNotMatch(uploads, /body\.set\('max_file_size'/u);
});

test('backendAction registry owns action metadata and frontend action names', async () => {
  const registry = await read('supabase/functions/backendAction/action-registry.ts');
  const frontendContract = await read('src/services/backend-action-contract.ts');
  const workerPolicies = JSON.parse(await read('config/backend-actions.config.json'));
  const rateLimits = JSON.parse(await read('config/rate-limits.config.json'));
  const workerRateLimit = await read('cloudflare/src/rate-limit.ts');
  const index = await read('supabase/functions/backendAction/index.ts');
  const execution = await read('supabase/functions/backendAction/execution.ts');
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
  assert.ok(registeredActions.length > 20);
  for (const [, actionName, domain, rateLimitGroup] of registeredActions) {
    assert.match(frontendContract, new RegExp(`'${actionName}'`, 'u'));
    assert.match(
      registry,
      new RegExp(`\\| "${domain}"`, 'u'),
      `${actionName} uses an unknown backend action domain`,
    );
    assert.equal(workerPolicies[actionName]?.group, rateLimitGroup, `${actionName} has a mismatched Worker rate limit group`);
  }
  for (const [actionName, policy] of Object.entries(workerPolicies)) {
    if (!policy.extraLimit) continue;
    assert.ok(rateLimits[policy.extraLimit], `${actionName} references a missing business limit`);
  }
  assert.match(workerRateLimit, /BACKEND_ACTION_POLICIES/u);
  assert.match(workerRateLimit, /claimActionRateLimit/u);

  assert.match(registry, /function idempotentWrite/u);
  assert.match(registry, /idempotent: true,\s+requiresRequestId: true/u);

  assert.match(index, /getBackendActionDefinition\(action\)/u);
  assert.match(index, /executeBackendAction\(definition, payload, auth, supabase\)/u);
  assert.match(execution, /definition\.requiredPermission && !hasPermission\(auth, definition\.requiredPermission\)/u);
  assert.match(execution, /definition\.requiresRequestId && !requestId/u);
  assert.match(registry, /requiredPermission: "facility\.manage"/u);
  assert.match(registry, /requiredPermission: "role\.manage"/u);
  assert.doesNotMatch(registry, /requiresAdmin/u);
  assert.doesNotMatch(`${index}\n${execution}`, /const idempotentActions = new Set/u);
  assert.doesNotMatch(workerRateLimit, /const readActions = new Set/u);
  assert.doesNotMatch(workerRateLimit, /backend\.unknown/u);
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
  const origin = await read('supabase/functions/_shared/origin.ts');
  const notion = await read('supabase/functions/_shared/notion.ts');
  const deployBackend = await read('.github/workflows/deploy-backend.yml');

  assert.match(syncUser, /requireEligibleFirebaseUser/u);
  assert.ok(syncUser.indexOf('requireOriginSecret(request)') < syncUser.indexOf('requireEligibleFirebaseUser(request)'));
  assert.match(syncUser, /requireMethod\(request, "POST"\)/u);
  assert.match(outboxWorker, /requireBearerSecret/u);
  assert.ok(outboxWorker.indexOf('requireOriginSecret(request)') < outboxWorker.indexOf('requireBearerSecret(request)'));
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
  assert.ok(cloudinaryWebhook.indexOf('requireOriginSecret(request)') < cloudinaryWebhook.indexOf('verifyCloudinarySignature(request, rawBody)'));
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
  assert.match(origin, /timingSafeEqual/u);
  assert.match(origin, /EDGE_FUNCTION_NAMESPACE/u);
  assert.match(origin, /EDGE_ORIGIN_SECRET/u);
  assert.match(notion, /name: "已刪除"/u);
  assert.match(notion, /ensureSelectOption/u);
  assert.match(notion, /"分類": \{ select: \{ name: categoryLabel \} \}/u);
  assert.match(notion, /"狀態": \{ select: \{ name: statusLabel \} \}/u);
  assert.match(notion, /optionalEnv\("NOTION_ENABLED"\) === "false"/u);
  assert.match(notion, /const NOTION_API_VERSION = "2026-03-11"/u);
  assert.match(notion, /\/databases\/\$\{requireEnv\("NOTION_DATABASE_ID"\)\}/u);
  assert.match(notion, /\/data_sources\/\$\{await getDataSourceId\(\)\}/u);
  assert.match(notion, /parent: \{ type: "data_source_id", data_source_id: await getDataSourceId\(\) \}/u);
  assert.match(notion, /NOTION_DATA_SOURCE_ID/u);
  assert.match(notion, /NOTION_DATA_SOURCE_ID does not belong to NOTION_DATABASE_ID/u);
  assert.doesNotMatch(notion, /callNotionAPI\(`\/databases\/[^`]+`, "PATCH"/u);
  assert.doesNotMatch(notion, /parent: \{ database_id:/u);
  assert.doesNotMatch(notion, /2022-06-28/u);
  assert.match(deployBackend, /NOTION_TOKEN and NOTION_DATABASE_ID must either both be set or both be omitted/u);
  assert.match(deployBackend, /NOTION_DATA_SOURCE_ID/u);
  assert.match(deployBackend, /NOTION_DATA_SOURCE_ID requires NOTION_TOKEN and NOTION_DATABASE_ID/u);
  assert.match(deployBackend, /NOTION_ENABLED="\$notion_enabled"/u);
  const requiredSecretBlock = deployBackend.slice(
    deployBackend.indexOf('missing=()'),
    deployBackend.indexOf('if [ "${#missing[@]}"'),
  );
  assert.doesNotMatch(requiredSecretBlock, /NOTION_TOKEN|NOTION_DATABASE_ID/u);
  assert.doesNotMatch(notion, /archived: true/u);
});

test('cost-sensitive ingress and provider operations are bounded before work', async () => {
  const backendAction = await read('supabase/functions/backendAction/index.ts');
  const worker = await read('cloudflare/src/index.ts');
  const workerRateLimit = await read('cloudflare/src/rate-limit.ts');
  const backendRateLimit = await read('supabase/functions/backendAction/rate-limit.ts');
  const workerTypes = await read('cloudflare/src/types.ts');
  const wrangler = await read('cloudflare/wrangler.toml');
  const deployBackend = await read('.github/workflows/deploy-backend.yml');
  const cloudinary = await read('supabase/functions/_shared/cloudinary.ts');
  const cloudinaryWebhook = await read('supabase/functions/cloudinaryWebhook/index.ts');
  const hardening = await read('supabase/migrations/202607150001_rate_limit_cost_hardening.sql');
  const resourceHardening = await read('supabase/migrations/202607160006_resource_efficiency_hardening.sql');
  const googleOauth = await read('supabase/functions/_shared/google-oauth.ts');
  const notion = await read('supabase/functions/_shared/notion.ts');
  const outboxWorker = await read('supabase/functions/outboxWorker/index.ts');
  const http = await read('supabase/functions/_shared/http.ts');
  const syncUser = await read('supabase/functions/syncUser/index.ts');
  const uploads = await read('supabase/functions/backendAction/uploads.ts');

  assert.match(cloudinary, /max_file_size/u);
  assert.match(cloudinary, /transformation: `c_limit,w_\$\{maxDimension\},h_\$\{maxDimension\}`/u);
  assert.match(uploads, /upload_preset: CLOUDINARY_IMAGE_UPLOAD_PRESET/u);
  assert.doesNotMatch(uploads, /claimFixedWindowRateLimitUnits/u);
  assert.match(backendRateLimit, /unitsPath.*payload\.images/u);
  assert.match(backendRateLimit, /claimBackendActionBusinessLimit/u);
  assert.match(backendRateLimit, /claimFixedWindowRateLimits/u);
  assert.match(googleOauth, /cachedTokens = new Map/u);
  assert.match(googleOauth, /scopeCacheKey/u);
  assert.match(resourceHardening, /backend_get_access_context/u);
  assert.match(resourceHardening, /facility_reports_title_search_trgm_idx/u);
  assert.match(resourceHardening, /outbox_events_stale_processing_idx/u);
  assert.match(resourceHardening, /deletion_jobs_active_cloudinary_unique_idx/u);
  assert.match(resourceHardening, /truncate table app_private\.realtime_events/u);
  assert.match(resourceHardening, /add column if not exists content_hash text/u);
  assert.match(notion, /mapping\.content_hash === nextContentHash/u);
  assert.match(outboxWorker, /upsert\(notifications, \{ ignoreDuplicates: true, onConflict: "id" \}\)/u);
  assert.doesNotMatch(uploads, /internal:delete-upload/u);
  assert.match(http, /readRequestText\(request: Request, maxBytes: number\)/u);
  assert.doesNotMatch(cloudinaryWebhook, /requestRateLimitIdentifier/u);
  assert.doesNotMatch(syncUser, /requestRateLimitIdentifier/u);
  assert.match(worker, /claimSyncIngress/u);
  assert.match(worker, /claimCloudinaryIngress/u);
  assert.match(worker, /claimActionIngress/u);
  assert.match(worker, /claimActionRateLimit/u);
  assert.match(workerRateLimit, /\.limit\(\{ key \}\)/u);
  assert.doesNotMatch(`${workerRateLimit}\n${workerTypes}`, /UPSTASH_REDIS/u);
  assert.match(wrangler, /\[\[env\.production\.ratelimits\]\]/u);
  assert.match(wrangler, /\[\[env\.development\.ratelimits\]\]/u);
  const gatewayDeploy = deployBackend.slice(
    deployBackend.indexOf('- name: Deploy Cloudflare API Gateway'),
    deployBackend.indexOf('- name: Smoke test Cloudflare API Gateway'),
  );
  assert.doesNotMatch(gatewayDeploy, /\$\{\{ secrets\.UPSTASH_REDIS/u);
  assert.match(gatewayDeploy, /secret delete "\$obsolete_key"/u);
  assert.match(syncUser, /claimFixedWindowRateLimit/u);
  assert.ok(
    backendAction.indexOf('getBackendActionDefinition(action)')
      < backendAction.indexOf('requireAuth(supabase, request)'),
  );
  assert.match(backendRateLimit, /RATE_LIMITS\.issueCreateDaily/u);
  assert.match(hardening, /pg_advisory_xact_lock/u);
  assert.match(hardening, /max_devices constant integer := 10/u);
  assert.match(hardening, /revoke select on app_private\.realtime_events from authenticated/u);
  assert.doesNotMatch(hardening, /revoke select on app_api\.(?:notifications|notification_states)/u);
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
  assert.doesNotMatch(announcements, /sortNumber|most-liked|most-commented/u);
});

test('content feeds share 30-item batches and bounded load-more controls', async () => {
  const pageSize = await read('src/lib/page-size.ts');
  const infiniteScroll = await read('src/composables/useInfiniteScroll.ts');
  const loadMoreControl = await read('src/components/ui/FeedLoadMoreControl.vue');
  const issueSearch = await read('src/composables/useIssueSearch.ts');
  const feedMigration = await read('supabase/migrations/202607140001_unified_feed_pagination.sql');
  const issueRead = await read('supabase/functions/backendAction/issue-read.ts');

  assert.match(pageSize, /CONTENT_FEED_PAGE_SIZE = 30/u);
  assert.match(pageSize, /COMMENT_FEED_PAGE_SIZE = 30/u);
  assert.match(pageSize, /NOTIFICATION_FEED_PAGE_SIZE = 30/u);
  assert.match(infiniteScroll, /options\.root\?\.value/u);
  assert.match(infiniteScroll, /loadPending/u);
  assert.match(loadMoreControl, /rounded-full/u);
  assert.match(loadMoreControl, /common\.loadMore/u);
  assert.match(loadMoreControl, /LoadingSpinner/u);
  assert.match(issueSearch, /loadMoreSearchResults/u);
  assert.match(feedMigration, /reply_groups as materialized/u);
  assert.match(feedMigration, /create or replace function app_api\.backend_list_issues/u);
  assert.match(feedMigration, /create or replace function app_api\.backend_list_notifications/u);
  assert.match(feedMigration, /backend_issue_list_to_json/u);
  assert.match(feedMigration, /array_agg\(issue_id\)/u);
  assert.match(issueRead, /delete issue\.content/u);
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
  assert.match(
    migration,
    /drop function if exists app_private\.emit_content_realtime_event\([\s\S]*integer,\s*text\s*\);/u,
  );
  assert.match(migration, /create function app_private\.emit_content_realtime_event/u);
  assert.match(migration, /comment_count integer,\s*op text\s*\)/u);
  assert.doesNotMatch(migration, /op text default/u);
});

test('issue cascade deletion keeps dependent triggers parent-safe', async () => {
  const migration = await read('supabase/migrations/202607120002_harden_cascade_delete_triggers.sql');

  assert.match(migration, /mark_notion_support_dirty[\s\S]*tg_op = 'DELETE'[\s\S]*not exists/u);
  assert.match(migration, /track_issue_category_counter[\s\S]*-related_comments/u);
  assert.match(migration, /if tg_op = 'DELETE' then\s*return old;[\s\S]*return new;/u);
  assert.match(migration, /track_comment_category_counter[\s\S]*old_category is not null/u);
  assert.match(
    migration,
    /create trigger track_issue_category_counter\s*before insert or delete or update of category/u,
  );
});

test('configured retention covers closed content and operational records', async () => {
  const config = await read('config/data-retention.config.json');
  const generator = await read('scripts/generate-data-retention.mjs');
  const maintenanceCleanup = await read('supabase/functions/maintenanceCleanup/index.ts');
  const migration = await read('supabase/migrations/202607160001_configurable_retention_cleanup.sql');
  const hardeningMigration = await read('supabase/migrations/202607160003_harden_retention_deletion_flow.sql');
  const outboxWorker = await read('supabase/functions/outboxWorker/index.ts');

  assert.match(config, /"closedIssuesDays"/u);
  assert.match(config, /"closedFacilitiesDays"/u);
  assert.match(config, /"notificationsDays"/u);
  assert.match(config, /"pushDeliverySentDays"/u);
  assert.match(generator, /data-retention\.config\.json/u);
  assert.match(maintenanceCleanup, /retention_config: DATA_RETENTION/u);
  assert.match(migration, /expired_closed_issues_deleted/u);
  assert.match(migration, /expired_closed_facilities_deleted/u);
  assert.match(migration, /role_assignment_audit_deleted/u);
  assert.match(hardeningMigration, /drop function if exists app_api\.run_maintenance_cleanup\(text\[\]\)/u);
  assert.match(hardeningMigration, /drop function if exists app_private\.run_maintenance_cleanup\(text\[\]\)/u);
  assert.match(hardeningMigration, /with expired_issues as materialized/u);
  assert.match(hardeningMigration, /with expired_facilities as materialized/u);
  assert.match(hardeningMigration, /'retention_cleanup', true/u);
  assert.match(hardeningMigration, /notion_page\.target_type = 'issue'/u);
  assert.match(hardeningMigration, /notion_page\.target_type = 'facility'/u);
  assert.match(hardeningMigration, /expired_closed_issue_notion_deletions_queued/u);
  assert.match(hardeningMigration, /expired_closed_facility_notion_deletions_queued/u);
  assert.match(outboxWorker, /event\.payload\.retention_cleanup === true\) return null/u);
});

test('facilities and author-fixed support use independent atomic storage', async () => {
  const migration = await read('supabase/migrations/202607150003_facilities_rbac.sql');
  const facilityService = await read('src/services/facilities.ts');
  const facilityAction = await read('supabase/functions/backendAction/facilities.ts');
  const facilityTypes = await read('src/types/index.ts');
  const notion = await read('supabase/functions/_shared/notion.ts');
  const maintenanceCleanup = await read('supabase/functions/maintenanceCleanup/index.ts');
  const legacyAdminBackfill = await read('supabase/migrations/202607150004_backfill_legacy_platform_admins.sql');
  const syncUser = await read('supabase/functions/syncUser/index.ts');
  const supabaseAuth = await read('src/services/supabase-auth.ts');

  assert.match(migration, /create table if not exists app_private\.facility_reports/u);
  assert.match(migration, /create table if not exists app_private\.facility_report_affected_users/u);
  assert.match(migration, /primary key \(facility_id,\s*uid\)/u);
  assert.match(migration, /affected_count integer not null default 1/u);
  assert.match(migration, /if facility\.author_uid=actor_uid then raise exception 'facility-author-fixed'/u);
  assert.match(migration, /affected_count=affected_count\+case when now_affected then 1 else -1 end/u);
  assert.match(migration, /if issue_record\.author_uid = actor_uid then raise exception 'support-not-available'/u);
  assert.match(migration, /case when support_enabled then 1 else 0 end/u);
  assert.match(migration, /drop table if exists app_private\.notion_support_dirty/u);
  assert.match(migration, /cron\.unschedule\(jobid\)[\s\S]*srp_notion_support_sync/u);
  assert.doesNotMatch(maintenanceCleanup, /notion_support|syncIssueSupport/u);
  assert.match(facilityService, /invokeBackendAction[\s\S]*listFacilities/u);
  assert.match(facilityAction, /cursor_id: asUuid\(cursor\.id\) \|\| null/u);
  assert.match(facilityTypes, /export type FacilityStatus = 'pending' \| 'processing' \| 'completed' \| 'unable-to-handle'/u);
  assert.match(notion, /if \(!terminal\) return/u);
  assert.match(notion, /"遇到人數"[\s\S]*facility\.affected_count/u);
  assert.match(notion, /\["completed", "infeasible"\]\.includes\(newStatus\)/u);
  assert.match(legacyAdminBackfill, /from app_private\.user_roles[\s\S]*where role = 'admin'/u);
  assert.match(legacyAdminBackfill, /'platform-admin'/u);
  assert.match(syncUser, /legacyRole\?\.role === "admin"/u);
  assert.doesNotMatch(supabaseAuth, /if \(token\.claims\.role === 'authenticated'\) \{\s*return;/u);
});

test('proposal manager access is config-driven and category-scoped', async () => {
  const categoryConfig = JSON.parse(await read('config/issue-categories.config.json'));
  const accessView = await read('src/views/AccessManagementView.vue');
  const auth = await read('supabase/functions/backendAction/auth.ts');
  const users = await read('supabase/functions/backendAction/users.ts');
  const issueRead = await read('supabase/functions/backendAction/issue-read.ts');
  const migration = await read('supabase/migrations/202607150006_category_scoped_proposal_access.sql');
  const lookupMigration = await read('supabase/migrations/202607150007_access_lookup_and_facility_status.sql');
  const selectionControl = await read('src/components/ui/SelectionOptionButton.vue');
  const facilityDialog = await read('src/components/FacilityStatusDialog.vue');
  const statusTransitionDialog = await read('src/components/ui/StatusTransitionDialog.vue');

  assert.ok(categoryConfig.categories.every((category) => typeof category.labelKey === 'string'));
  assert.match(accessView, /import \{ ISSUE_CATEGORIES \} from '@\/generated\/issue-categories'/u);
  assert.match(accessView, /v-for="category in ISSUE_CATEGORIES"/u);
  assert.match(migration, /primary key \(uid, category_id\)/u);
  assert.match(users, /managedIssueCategoryIds[\s\S]*filter\(isIssueCategory\)/u);
  assert.match(auth, /canManageIssueCategory/u);
  assert.match(issueRead, /canManageIssueCategory\(auth, category\)/u);
  assert.match(users, /if \(!rawQuery\) return \{ users: \[\] \}/u);
  assert.match(users, /const rawQuery = asString\(payload\.query\)\.trim\(\)/u);
  assert.match(users, /rawQuery\.includes\("@"\) \? rawQuery\.toLowerCase\(\) : rawQuery/u);
  assert.match(users, /profilesQuery\.eq\("email", query\)[\s\S]*profilesQuery\.eq\("uid", query\)/u);
  assert.match(lookupMigration, /user_profiles_email_unique_idx/u);
  assert.match(lookupMigration, /backend_update_facility_status\.result_content/u);
  assert.match(accessView, /SelectionOptionButton/u);
  assert.match(facilityDialog, /StatusTransitionDialog/u);
  assert.match(statusTransitionDialog, /SelectionOptionButton/u);
  assert.match(selectionControl, /button-toolbar--active[\s\S]*SelectionMark/u);
});

test('facility next actions and account UID use existing detail controls', async () => {
  const facilityDetail = await read('src/views/FacilityDetailView.vue');
  const facilityPanel = await read('src/components/FacilityDetailPagePanel.vue');
  const facilityActions = await read('src/components/FacilityDetailActions.vue');
  const detailPagePanel = await read('src/components/ContentDetailPagePanel.vue');
  const contentDetailBody = await read('src/components/ContentDetailBody.vue');
  const settingsView = await read('src/views/SettingsView.vue');
  const settingsPanel = await read('src/components/SettingsPanelContent.vue');
  const shareUrl = await read('src/composables/useShareUrl.ts');
  const proposalFooter = await read('src/components/IssueDetailSupportFooter.vue');
  const detailActionGroup = await read('src/components/ui/DetailActionGroup.vue');
  const operationTimes = await read('src/components/ui/OperationTimeList.vue');
  const detailRouteState = await read('src/components/ui/DetailRouteState.vue');

  assert.match(facilityDetail, /FacilityDetailPagePanel/u);
  assert.match(facilityDetail, /DetailRouteState/u);
  assert.match(detailRouteState, /LoadingSpinner/u);
  assert.match(facilityDetail, /ConfirmDialog/u);
  assert.match(facilityDetail, /useShareUrl/u);
  assert.match(facilityPanel, /#actions="\{ compact \}"/u);
  assert.match(facilityPanel, /:compact="compact"/u);
  assert.match(facilityActions, /DetailActionButton/u);
  assert.match(facilityActions, /DetailActionGroup/u);
  assert.match(detailActionGroup, /label="common\.share"/u);
  assert.match(facilityPanel, /ContentDetailPagePanel/u);
  assert.match(detailPagePanel, /ContentDetailBody/u);
  assert.match(contentDetailBody, /noticeContent/u);
  assert.equal((contentDetailBody.match(/<MarkdownMediaContent/gu) ?? []).length, 2);
  assert.match(facilityDetail, /facility\.startProcessing' : 'facility\.completeCannotResolve/u);
  assert.match(facilityDetail, /facility\.waitingTime[\s\S]*facility\.startProcessingTime[\s\S]*facility\.markedUnresolved/u);
  assert.match(facilityActions, /:operation-time-items="operationTimeItems"/u);
  assert.match(proposalFooter, /:operation-time-items="operationTimeItems"/u);
  assert.match(detailActionGroup, /OperationTimeList/u);
  assert.match(operationTimes, /compact \? `\$\{t\(item\.shortLabel\)\}:` : `\$\{t\(item\.label\)\}:`/u);
  assert.doesNotMatch(facilityDetail, />更新狀態</u);
  assert.match(settingsView, /:uid="user\.uid"/u);
  assert.match(settingsPanel, /t\('account\.uidLabel'\)[\s\S]*\{\{ uid \}\}[\s\S]*name="copy"/u);
  assert.match(settingsPanel, /show\(t\('settings\.uidCopied'\), 'success'\)/u);
  assert.match(shareUrl, /export async function copyText/u);
});

test('announcement editing is removed across frontend, backend, and database', async () => {
  const actionContract = await read('src/services/backend-action-contract.ts');
  const announcementService = await read('src/services/announcements.ts');
  const announcementWrite = await read('supabase/functions/backendAction/announcement-write.ts');
  const actionRegistry = await read('supabase/functions/backendAction/action-registry.ts');
  const removalMigration = await read('supabase/migrations/202607120003_remove_announcement_editing.sql');

  assert.doesNotMatch(actionContract, /updateAnnouncement/u);
  assert.doesNotMatch(announcementService, /updateAnnouncement/u);
  assert.doesNotMatch(announcementWrite, /updateAnnouncement|backend_update_announcement/u);
  assert.doesNotMatch(actionRegistry, /updateAnnouncement/u);
  assert.match(removalMigration, /drop function if exists app_api\.backend_update_announcement/u);
});

test('announcement writes update visible lists and invalidate list-page caches', async () => {
  const management = await read('src/composables/useAnnouncementManagement.ts');
  const announcements = await read('src/services/announcements.ts');

  assert.match(management, /const announcement = await createAnnouncement\(payload\);\s*upsertAnnouncement\(announcement\);/u);
  assert.match(announcements, /const ANNOUNCEMENT_LIST_CACHE_PREFIX = 'announcement-list-page\|'/u);
  assert.match(
    announcements,
    /createAnnouncement[\s\S]*markContentCachePrefixStale\(ANNOUNCEMENT_LIST_CACHE_PREFIX\)/u,
  );
  assert.match(
    announcements,
    /deleteAnnouncement[\s\S]*markContentCachePrefixStale\(ANNOUNCEMENT_LIST_CACHE_PREFIX\)/u,
  );
});

test('realtime-backed lists revalidate after stale resumes without fixed polling', async () => {
  const discussionComments = await read('src/composables/useDiscussionComments.ts');
  const announcementManagement = await read('src/composables/useAnnouncementManagement.ts');
  const issueBoard = await read('src/composables/useIssueBoardData.ts');
  const realtimeEvents = await read('src/services/realtime-events.ts');
  const boardControls = await read('src/components/BoardControls.vue');
  const appShell = await read('src/components/AppShell.vue');
  const appShellNavigation = [
    await read('src/components/app-shell/AppDesktopSidebar.vue'),
    await read('src/components/app-shell/AppMobileBottomNav.vue'),
  ].join('\n');
  const activeNavigationRefresh = await read('src/composables/useActiveNavigationRefresh.ts');
  const announcements = await read('src/services/announcements.ts');
  const issueWrites = await read('src/services/issues-write.ts');

  assert.doesNotMatch(discussionComments, /setInterval/u);
  assert.match(discussionComments, /registerAppResumeHandler/u);
  assert.match(discussionComments, /shouldRefreshContentAfterResume/u);
  assert.match(discussionComments, /forceRefresh: options\.force === true \|\| hydrated/u);
  assert.match(announcementManagement, /refreshAnnouncementList\(\{ force: true \}\)/u);
  assert.doesNotMatch(announcementManagement, /setInterval/u);
  assert.doesNotMatch(issueBoard, /setInterval/u);
  assert.match(announcementManagement, /shouldRefreshContentAfterResume/u);
  assert.match(issueBoard, /shouldRefreshContentAfterResume/u);
  assert.match(issueBoard, /invalidateIssueBuckets\(\)/u);
  assert.match(realtimeEvents, /scheduleReconnect/u);
  assert.match(realtimeEvents, /status !== 'CHANNEL_ERROR'.*status !== 'TIMED_OUT'.*status !== 'CLOSED'/u);
  assert.doesNotMatch(boardControls, /aria-label="重新整理提案"/u);
  await assert.rejects(read('src/components/AnnouncementControls.vue'));
  assert.match(appShell, /@navigate="handleNavigationClick"/u);
  assert.match(appShellNavigation, /\$emit\('navigate', item\.isActive\)/u);
  assert.match(activeNavigationRefresh, /refreshFromActiveNavigation/u);
  assert.match(announcements, /ANNOUNCEMENT_COMMENTS_CACHE_PREFIX/u);
  assert.match(issueWrites, /markContentCachePrefixStale\('issue-comments-page\|'\)/u);
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
  const issueSupporterNotificationMigration = await read('supabase/migrations/202607160005_issue_supporter_notifications.sql');
  const notificationView = await read('src/views/NotificationsView.vue');
  const notificationDisplay = await read('src/composables/useNotificationDisplay.ts');

  assert.match(atomicOutboxMigration, /'issue\.comment_created'/u);
  assert.match(atomicOutboxMigration, /'issue_author_uid', issue_record\.author_uid/u);
  assert.match(atomicOutboxMigration, /'issue\.status_changed'/u);
  assert.match(atomicOutboxMigration, /queue_announcement_comment_created/u);
  assert.match(announcementCommentNotificationMigration, /'announcement_author_uid', announcement_record\.author_uid/u);
  assert.match(backendAction, /rpc\("backend_delete_issue_with_upload_targets"/u);
  assert.match(securityMigration, /'issue\.deleted'/u);
  assert.match(securityMigration, /'author_uid', issue_record\.author_uid/u);
  assert.match(issueSupporterNotificationMigration, /jsonb_agg\(supporter\.uid order by supporter\.created_at\)/u);
  assert.match(issueSupporterNotificationMigration, /'supporter_uids', supporter_uids/u);
  assert.match(outboxWorker, /async function findIssueAuthorUid/u);
  assert.match(outboxWorker, /async function findAnnouncementCommentRecipientUid/u);
  assert.match(outboxWorker, /asString\(event\.payload\.issue_author_uid\)\s*\|\|\s*asString\(event\.payload\.author_uid\)/u);
  assert.match(outboxWorker, /asString\(event\.payload\.announcement_author_uid\)/u);
  assert.match(outboxWorker, /async function resolveNotification/u);
  assert.match(outboxWorker, /recipientUid === event\.actor_uid/u);
  assert.match(outboxWorker, /recipient_uid: recipientUid/u);
  assert.match(outboxWorker, /from\("supports"\)[\s\S]*select\("uid"\)\.eq\("issue_id", event\.target_id\)/u);
  assert.match(outboxWorker, /asStringArray\(event\.payload\.supporter_uids\)/u);
  assert.match(outboxWorker, /new Set\(\[authorUid, \.\.\.supporterUids\]/u);
  assert.match(outboxWorker, /event\.event_type === "support\.goal_met" \|\| uid !== event\.actor_uid/u);
  assert.match(outboxWorker, /query = query\.in\("uid", recipientUids\)/u);
  assert.match(outboxWorker, /upsert\(notifications, \{ ignoreDuplicates: true, onConflict: "id" \}\)/u);
  assert.match(outboxWorker, /sendPushesWithoutBlockingOutbox\(supabase, base, insertedRecipientUids\)/u);
  assert.doesNotMatch(outboxWorker, /srp-admin|topic_admin/u);
  assert.doesNotMatch(outboxWorker, /title: "新提案待審核"|title: "新提案待處理"/u);
  assert.match(outboxWorker, /title: "設備狀態已變更"/u);
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
  assert.match(notificationView, /useNotificationDisplay/u);
  assert.doesNotMatch(notificationView, /return t\(notification\.title\)/u);
  assert.match(notificationDisplay, /notification\.commentTitle/u);
  assert.match(notificationDisplay, /notification\.statusChangedBody/u);
  assert.match(notificationDisplay, /LEGACY_STATUS_SUFFIX/u);
});

test('timestamps stay UTC at rest and render in the device time zone', async () => {
  const format = await read('src/lib/format.ts');
  const utcMigration = await read('supabase/migrations/202607180002_enforce_utc_database_timezone.sql');
  const migrationFiles = (await listFiles('supabase/migrations'))
    .filter((file) => file.pathname.endsWith('.sql'));
  const migrationSource = (await Promise.all(migrationFiles.map((file) => readFile(file, 'utf8')))).join('\n');

  assert.match(format, /resolvedOptions\(\)\.timeZone/u);
  assert.match(format, /timeZone: getDeviceTimeZone\(\)/u);
  assert.match(utcMigration, /alter database %I set timezone to %L/u);
  assert.match(utcMigration, /current_database\(\)[\s\S]*'UTC'/u);
  assert.doesNotMatch(migrationSource, /\btimestamp(?:\(\d+\))?\s+(?!with\s+time\s+zone)/iu);
});

test('private issue data and upload URLs stay behind backend authorization', async () => {
  const migration = await read('supabase/migrations/202607050001_supabase_baseline.sql');
  const deliveryScopeMigration = await read('supabase/migrations/202607120004_refresh_upload_delivery_scope.sql');
  const uploads = await read('supabase/functions/backendAction/uploads.ts');
  const cloudinary = await read('supabase/functions/_shared/cloudinary.ts');
  const support = await read('supabase/functions/backendAction/issue-support.ts');

  assert.match(migration, /revoke all on app_api\.issues from anon, authenticated/u);
  assert.match(deliveryScopeMigration, /delivery_url_scope in \('private-v2', 'public-v2'\)/u);
  assert.doesNotMatch(deliveryScopeMigration, /'private', 'public'/u);
  assert.match(uploads, /async function resolveUploadAccessBatch/u);
  assert.match(uploads, /canReadIssue\(issue, auth\)/u);
  assert.match(uploads, /issueIsPrivateToOwner/u);
  assert.match(uploads, /PRIVATE_DELIVERY_SCOPE = "private-v2"/u);
  assert.match(uploads, /PUBLIC_DELIVERY_SCOPE = "public-v2"/u);
  assert.match(cloudinary, /deliveryPath = `\$\{publicId\}\.webp`/u);
  assert.match(cloudinary, /s--\$\{signature\}--\/\$\{encodedPublicId\}\.webp/u);
  assert.doesNotMatch(cloudinary, /resource_type: "image",[\s\S]*timestamp:[\s\S]*type: "authenticated"/u);
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

test('notification realtime subscriptions use authorized private broadcasts', async () => {
  const notificationsComposable = await read('src/composables/useNotifications.ts');
  const notificationsService = await read('src/services/notifications.ts');
  const appResume = await read('src/composables/useAppResume.ts');
  const realtimeMigration = await read('supabase/migrations/202607150001_rate_limit_cost_hardening.sql');
  const backendAuth = await read('supabase/functions/backendAction/auth.ts');

  assert.match(notificationsComposable, /let initialized = false/u);
  assert.match(notificationsComposable, /ensureNotificationsInitialized/u);
  assert.match(notificationsComposable, /registerAppResumeHandler\(reconnectNotificationsAfterResume\)/u);
  assert.match(notificationsComposable, /NOTIFICATION_RESUME_RECONNECT_MS = 10 \* 60_000/u);
  assert.match(notificationsComposable, /fetchNotificationSnapshot\(activeSources\.value, uid, controller\.signal\)/u);
  assert.doesNotMatch(notificationsComposable, /setInterval/u);
  assert.doesNotMatch(notificationsComposable, /onScopeDispose\(clearSubscriptions\)/u);
  assert.match(notificationsService, /config: \{ private: true \}/u);
  assert.match(notificationsService, /'notification_insert' \| 'notification_state_changed'/u);
  assert.doesNotMatch(notificationsService, /postgres_changes/u);
  assert.match(realtimeMigration, /revoke select on app_private\.notifications from authenticated/u);
  assert.match(realtimeMigration, /realtime\.topic\(\) = 'notifications:user:' \|\| app_private\.firebase_uid\(\)/u);
  assert.match(notificationsComposable, /insertRealtimeNotification/u);
  assert.doesNotMatch(notificationsComposable, /isPersonalNotificationVisible/u);
  assert.match(realtimeMigration, /app_private\.is_expected_firebase_project\(\)/u);
  assert.match(backendAuth, /firebase_project_id: requireEnv\("FIREBASE_PROJECT_ID"\)/u);
  assert.match(appResume, /export function registerAppResumeHandler/u);
});

test('app updates hand over the service worker with bounded reload recovery', async () => {
  const appUpdate = await read('src/composables/useAppUpdate.ts');
  const serviceWorker = await read('src/sw.ts');
  const realtimeEvents = await read('src/services/realtime-events.ts');

  assert.match(appUpdate, /SERVICE_WORKER_PREPARE_TIMEOUT_MS = 4_000/u);
  assert.match(appUpdate, /waitForServiceWorkerTakeover/u);
  assert.match(appUpdate, /registration\.waiting\?\.postMessage\(\{ type: 'SKIP_WAITING' \}\)/u);
  assert.match(appUpdate, /serviceWorker\.register\('\/sw\.js',[\s\S]*type: 'module'/u);
  assert.match(appUpdate, /RELOAD_RECOVERY_TIMEOUT_MS = 10_000/u);
  assert.match(serviceWorker, /event\.data[\s\S]*SKIP_WAITING/u);
  assert.match(realtimeEvents, /config: \{ private: true \}/u);
  assert.match(realtimeEvents, /event: 'content_changed'/u);
});

test('Google redirect recovery runs only after an explicit redirect fallback', async () => {
  const firebase = await read('src/lib/firebase.ts');
  const authActions = await read('src/composables/sessionAuthActions.ts');
  const session = await read('src/composables/useSession.ts');
  const loginPanel = await read('src/components/LoginPanel.vue');
  const loginButton = await read('src/components/ui/GoogleLoginButton.vue');

  assert.match(firebase, /browserPopupRedirectResolver/u);
  assert.match(firebase, /popupRedirectResolver: browserPopupRedirectResolver/u);
  assert.match(authActions, /await signInWithPopup\(firebaseAuth/u);
  assert.match(authActions, /error\.code === 'auth\/argument-error'/u);
  assert.match(loginPanel, /<GoogleLoginButton :loading="loading" @login="login"/u);
  assert.match(loginButton, /@click="emit\('login'\)"/u);
  assert.match(authActions, /GOOGLE_REDIRECT_PENDING_KEY = 'novae:google-redirect-pending'/u);
  assert.match(authActions, /markGoogleRedirectPending\(\);[\s\S]*await signInWithRedirect/u);
  assert.match(authActions, /if \(!hasPendingGoogleRedirect\(\)\) return;/u);
  assert.match(authActions, /finally \{[\s\S]*clearGoogleRedirectPending\(\);/u);
  assert.match(authActions, /await firebaseAuth\.authStateReady\(\)/u);
  assert.match(authActions, /if \(!firebaseAuth\.currentUser && !state\.user\)/u);
  assert.match(authActions, /auth\.loginReplyTimedOut/u);
  assert.match(session, /recoverPendingGoogleRedirect\(state, firebaseAuth\)/u);
  assert.doesNotMatch(session, /getRedirectResult/u);
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
  assert.match(pushNotifications, /preference\.deviceEnabled[\s\S]*!registrationIsFresh\(uid\)/u);
  assert.match(pushNotifications, /registerCurrentPushToken\(currentToken\)/u);
  assert.match(pushNotifications, /PUSH_REGISTRATION_SYNC_TTL_MS = 7 \* 24 \* 60 \* 60_000/u);
  assert.match(pushNotifications, /setExplicitlyDisabled\(true\)/u);
  assert.match(pushNotifications, /setExplicitlyDisabled\(false\)/u);
  assert.match(promptDialog, /app\.install\.reEnablePushNotifications/u);
});

test('notification navigation verifies target access before routing', async () => {
  const navigation = await read('src/composables/useNotificationNavigation.ts');
  const notificationsView = await read('src/views/NotificationsView.vue');
  const notificationDisplay = await read('src/composables/useNotificationDisplay.ts');
  const issueRead = await read('supabase/functions/backendAction/issue-read.ts');
  const issueReadMigration = await read('supabase/migrations/202607080002_backend_issue_read_rpc.sql');

  assert.match(navigation, /await fetchIssueRecordById\(notification\.target_id\)/u);
  assert.match(navigation, /filter: issue\.category/u);
  assert.match(navigation, /notification\.type === 'issue_deleted'/u);
  await assert.rejects(read('src/components/NotificationBell.vue'));
  assert.match(notificationsView, /useNotificationDisplay/u);
  assert.match(notificationDisplay, /notification\.commentTitle/u);
  assert.match(notificationDisplay, /notification\.statusChangedBody/u);
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

test('content reads persist by account and invalidate after writes or realtime events', async () => {
  const persistentCache = await read('src/lib/persistent-cache.ts');
  const contentCache = await read('src/services/content-read-cache.ts');
  const sessionEffects = await read('src/composables/sessionEffects.ts');
  const issuePages = await read('src/services/issues-read-pages.ts');
  const announcements = await read('src/services/announcements.ts');
  const facilities = await read('src/services/facilities.ts');
  const notifications = await read('src/services/notifications.ts');
  const realtime = await read('src/services/realtime-events.ts');
  const backendAction = await read('src/services/backend-action.ts');

  assert.match(persistentCache, /indexedDB\.open/u);
  assert.match(persistentCache, /createIndex\('scope'/u);
  assert.match(persistentCache, /deletePersistentCacheIfVersion/u);
  assert.match(persistentCache, /entry\?\.writeVersion === writeVersion/u);
  assert.match(contentCache, /CONTENT_READ_CACHE_TTL_MS = 30 \* 24 \* 60 \* 60/u);
  assert.match(contentCache, /getCachedContentPersistent/u);
  assert.match(contentCache, /function rememberContentCacheEntry/u);
  assert.match(contentCache, /cache\.delete\(key\);[\s\S]*cache\.set\(key, entry\)/u);
  assert.match(contentCache, /leastRecentlyUsedKey/u);
  assert.match(contentCache, /runCoalescedContentRequest/u);
  assert.match(contentCache, /pendingInvalidations/u);
  assert.match(contentCache, /interface ContentCacheWriteGuard/u);
  assert.match(contentCache, /scopeVersion \+= 1/u);
  assert.match(contentCache, /invalidationVersions/u);
  assert.match(contentCache, /isContentCacheWriteGuardCurrent\(guard\)/u);
  assert.match(contentCache, /setCachedContentFromRead/u);
  assert.match(contentCache, /pendingPersistentReads\.get\(persistentKey\) === pending/u);
  assert.match(contentCache, /pendingRequests\.get\(scopedRequestKey\) === pending/u);
  assert.match(contentCache, /deletePersistentCacheIfVersion\(persistentKey, writeVersion\)/u);
  assert.match(sessionEffects, /setContentCacheScope\(uid\)/u);
  assert.match(issuePages, /getCachedContentPersistent/u);
  assert.match(announcements, /getCachedContentPersistent/u);
  assert.match(facilities, /getCachedContentPersistent/u);
  assert.match(notifications, /NOTIFICATION_HINT_CACHE_TTL_MS/u);
  for (const service of [issuePages, announcements, facilities, notifications]) {
    assert.match(service, /setCachedContentFromRead/u);
  }
  assert.match(realtime, /invalidateRealtimeContent/u);
  assert.match(backendAction, /auth\?\.currentUser\?\.uid !== requestUid/u);
});

test('content revisions batch cache validation and searches only submit explicitly', async () => {
  const revisions = await read('src/services/content-revisions.ts');
  const revisionMigration = await read('supabase/migrations/202607160002_content_revisions.sql');
  const actionRegistry = await read('supabase/functions/backendAction/action-registry.ts');
  const issueSearch = await read('src/composables/useIssueSearch.ts');
  const facilities = await read('src/composables/useFacilities.ts');
  const controls = await read('src/components/BoardControls.vue');

  assert.match(revisions, /REVISION_CHECK_INTERVAL_MS = 30 \* 60_000/u);
  assert.match(revisions, /getContentRevisions/u);
  assert.match(revisions, /pendingChecks/u);
  assert.match(revisions, /DOMAIN_PREFIXES/u);
  assert.match(actionRegistry, /action\("getContentRevisions", "content", "read"/u);
  assert.match(revisionMigration, /create table if not exists app_private\.content_revisions/u);
  assert.match(revisionMigration, /for each statement execute function app_private\.bump_content_revision/u);
  assert.doesNotMatch(revisionMigration, /realtime_events/u);
  assert.match(controls, /@submit\.prevent="emit\('submitSearch'\)"/u);
  assert.match(issueSearch, /committedSearchQuery/u);
  assert.match(facilities, /committedQuery/u);
  assert.doesNotMatch(issueSearch, /debounce|setTimeout/u);
  assert.doesNotMatch(facilities, /searchTimer|setTimeout/u);
});

test('entry and comment limits are enforced across UI, Edge, and a new migration', async () => {
  const frontendLimits = await read('src/constants/input-limits.ts');
  const backendValidation = await read('supabase/functions/backendAction/validation.ts');
  const databaseLimits = await read('supabase/migrations/202607150002_input_length_limits.sql');
  const commentComposer = await read('src/components/CommentComposer.vue');
  const commentItem = await read('src/components/CommentItem.vue');
  const commentThread = await read('src/components/CommentThreadPanel.vue');
  const detailShell = await read('src/components/ui/DetailPageShell.vue');
  const issueComposer = await read('src/components/IssueComposer.vue');
  const announcementComposer = await read('src/components/AnnouncementComposerDialog.vue');
  const facilityComposer = await read('src/components/FacilityComposer.vue');
  const composerShell = await read('src/components/ui/EntryComposerShell.vue');
  const countedField = await read('src/components/ui/CountedTextField.vue');
  const feedbackBar = await read('src/components/ActionFeedbackBar.vue');
  const responsiveStyles = await read('src/styles/responsive.css');
  const baseStyles = await read('src/styles/base.css');

  assert.match(frontendLimits, /title: 30/u);
  assert.match(frontendLimits, /content: 1_000/u);
  assert.match(frontendLimits, /comment: 70/u);
  assert.match(backendValidation, /requiredMediaContent/u);
  assert.match(databaseLimits, /visible_media_text_length/u);
  assert.match(databaseLimits, /between 1 and 30/u);
  assert.match(databaseLimits, /> 1000/u);
  assert.match(databaseLimits, /> 70/u);
  assert.doesNotMatch(commentComposer, /MarkdownRenderer|showPreview|預覽留言/u);
  assert.match(commentItem, /plain-text/u);
  assert.doesNotMatch(commentThread, /第一則留言會出現在這裡/u);
  assert.match(detailShell, /label: t\('comments\.countComments'/u);
  assert.match(baseStyles, /padding-bottom: calc\(var\(--app-bottom-nav-height\) \+ 1rem\)/u);
  assert.match(responsiveStyles, /padding-left: max\(var\(--dialog-safe-padding, 1rem\), env\(safe-area-inset-left\)\)/u);
  assert.match(responsiveStyles, /padding-right: max\(var\(--dialog-safe-padding, 1rem\), env\(safe-area-inset-right\)\)/u);
  assert.match(composerShell, /entry-composer__scroll/u);
  assert.match(responsiveStyles, /\.entry-composer__scroll \{[\s\S]*margin-inline: -0\.5rem;[\s\S]*padding-inline: 0\.5rem;/u);
  assert.match(responsiveStyles, /\.entry-composer__footer \{/u);
  assert.match(responsiveStyles, /\.entry-composer__actions \{/u);
  assert.match(responsiveStyles, /\.entry-composer__action \{[\s\S]*height: var\(--control-height\);[\s\S]*font-weight: 600;/u);
  [issueComposer, announcementComposer, facilityComposer].forEach((composer) => {
    assert.match(composer, /EntryComposerShell/u);
    assert.doesNotMatch(composer, /entry-composer__action button-contextual/u);
  });
  assert.match(composerShell, /CountedTextField/u);
  assert.match(composerShell, /MarkdownImageEditor/u);
  assert.match(composerShell, /class="entry-composer__footer"/u);
  assert.match(composerShell, /class="entry-composer__actions"/u);
  assert.match(composerShell, /md:max-h-screen/u);
  assert.equal((composerShell.match(/entry-composer__action button-secondary/gu) ?? []).length, 2);
  assert.match(countedField, /v-model="value"/u);
  assert.match(composerShell, /min-h-\[220px\]/u);
  assert.match(composerShell, /editor-class="flex-1 min-h-\[180px\]"/u);
  assert.match(feedbackBar, /action-feedback-card[\s\S]*min-h-14 w-full/u);
  assert.match(baseStyles, /\.action-feedback-viewport \{[\s\S]*padding-left: max\(var\(--app-viewport-gutter\), env\(safe-area-inset-left\)\);[\s\S]*padding-right: max\(var\(--app-viewport-gutter\), env\(safe-area-inset-right\)\)/u);
  assert.match(baseStyles, /body\.dialog-open \.action-feedback-viewport \{[\s\S]*top: calc\(env\(safe-area-inset-top\) \+ 6\.75rem\)/u);
});

test('primary navigation preloads route chunks while shell chrome stays outside route transitions', async () => {
  const app = await read('src/App.vue');
  const appShell = await read('src/components/AppShell.vue');
  const issueBoard = await read('src/components/IssueBoard.vue');
  const facilitiesView = await read('src/views/FacilitiesView.vue');
  const routeComponents = await read('src/router/route-components.ts');
  const responsiveStyles = await read('src/styles/responsive.css');

  assert.doesNotMatch(app, /Transition name="page-content"/u);
  assert.doesNotMatch(app, /flex-1 overflow-x-hidden/u);
  assert.match(appShell, /app-main-content relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden/u);
  assert.match(appShell, /<AppMobileHeader[\s\S]*<ViewportFrame as="main"[\s\S]*<slot \/>/u);
  assert.match(issueBoard, /overflow-y-auto overflow-x-hidden overscroll-contain/u);
  assert.match(facilitiesView, /overflow-y-auto overflow-x-hidden overscroll-contain/u);
  assert.match(app, /requestIdleCallback/u);
  assert.match(app, /preloadPrimaryRouteComponents/u);
  assert.match(appShell, /@pointerover\.capture="handleNavigationIntent"/u);
  assert.match(appShell, /preloadRoutePath/u);
  assert.match(routeComponents, /preloadRequests/u);
  assert.match(routeComponents, /for \(const routeName of routeNames\)/u);
  assert.doesNotMatch(responsiveStyles, /\.page-content-(?:enter|leave)/u);
  assert.match(responsiveStyles, /\.board-controls \{[\s\S]*padding-top: 0\.5rem/u);
});

test('proposals, announcements, and facilities share list cards and detail panels', async () => {
  const listComponents = await Promise.all([
    read('src/components/IssueBoardTable.vue'),
    read('src/components/AnnouncementTable.vue'),
    read('src/components/FacilityTable.vue'),
  ]);
  const rowComponents = await Promise.all([
    read('src/components/IssueTableRow.vue'),
    read('src/components/AnnouncementTableRow.vue'),
    read('src/components/FacilityTableRow.vue'),
  ]);
  const detailPanels = await Promise.all([
    read('src/components/IssueDetailPagePanel.vue'),
    read('src/components/AnnouncementDetailPagePanel.vue'),
    read('src/components/FacilityDetailPagePanel.vue'),
  ]);
  const cardCollection = await read('src/components/ui/ContentCardCollection.vue');
  const cardShell = await read('src/components/ui/ContentCardShell.vue');
  const detailPagePanel = await read('src/components/ContentDetailPagePanel.vue');
  const detailActionGroup = await read('src/components/ui/DetailActionGroup.vue');
  const detailActionComponents = await Promise.all([
    read('src/components/IssueDetailSupportFooter.vue'),
    read('src/components/AnnouncementDetailActions.vue'),
    read('src/components/FacilityDetailActions.vue'),
  ]);
  const announcementDetailView = await read('src/views/AnnouncementDetailView.vue');
  const announcementDetailFlow = await read('src/composables/useAnnouncementDetail.ts');
  const detailRouteQuery = await read('src/composables/useDetailRouteQuery.ts');
  const shareUrl = await read('src/composables/useShareUrl.ts');
  const statuses = await read('src/constants/statuses.ts');
  const contentListState = await read('src/components/ui/ContentListState.vue');
  const contentListRuntime = await read('src/composables/useContentListRuntime.ts');
  const contentListConsumers = await Promise.all([
    read('src/components/IssueBoard.vue'),
    read('src/views/AnnouncementsView.vue'),
    read('src/views/FacilitiesView.vue'),
  ]);

  listComponents.forEach((component) => assert.match(component, /ContentCardCollection/u));
  rowComponents.forEach((component) => assert.match(component, /ContentCardShell/u));
  detailPanels.forEach((component) => assert.match(component, /ContentDetailPagePanel/u));
  detailActionComponents.forEach((component) => assert.match(component, /DetailActionGroup/u));
  contentListConsumers.forEach((component) => {
    assert.match(component, /ContentListState/u);
    assert.match(component, /useContentListRuntime/u);
  });
  assert.match(cardCollection, /issue-card-grid/u);
  assert.match(cardShell, /issue-card[\s\S]*surface-card[\s\S]*list-row-trigger/u);
  assert.match(contentListState, /PageLoadFailure/u);
  assert.match(contentListState, /EmptyStatePanel/u);
  assert.match(contentListState, /FeedLoadMoreControl/u);
  assert.match(contentListRuntime, /useMinimumLoading/u);
  assert.match(contentListRuntime, /useLoadingTimeout/u);
  assert.match(contentListRuntime, /useInfiniteScroll/u);
  assert.match(contentListRuntime, /registerActiveNavigationRefreshHandler/u);
  assert.match(detailPagePanel, /DetailPageShell/u);
  assert.match(detailPagePanel, /ContentDetailBody/u);
  assert.match(detailActionGroup, /DetailActionButton/u);
  assert.match(detailActionGroup, /OperationTimeList/u);
  assert.match(announcementDetailView, /useAnnouncementDetail/u);
  assert.doesNotMatch(announcementDetailView, /fetchAnnouncementRecordById|subscribeContentRealtimeEvents/u);
  assert.match(announcementDetailFlow, /fetchAnnouncementRecordById/u);
  assert.match(announcementDetailFlow, /subscribeContentRealtimeEvents/u);
  assert.match(detailRouteQuery, /focusCommentId/u);
  assert.match(detailRouteQuery, /initialTab/u);
  assert.match(shareUrl, /copyRouteUrl/u);
  assert.match(statuses, /FACILITY_STATUS_LABELS/u);
  assert.match(statuses, /isFacilityClosed/u);
});

test('frontend localization follows the first-visit system language and remains regression-checked', async () => {
  const main = await read('src/main.ts');
  const i18n = await read('src/i18n/index.ts');
  const settings = await read('src/components/SettingsPanelContent.vue');
  const documentTitle = await read('src/composables/useDocumentTitle.ts');
  const packageJson = JSON.parse(await read('package.json'));
  const i18nCheck = await read('scripts/check-i18n.mjs');

  assert.ok(main.indexOf('initializeI18n()') < main.indexOf('createApp(App)'));
  assert.match(i18n, /LOCALE_STORAGE_KEY = 'novae:locale'/u);
  assert.match(i18n, /storedLocale \?\? detectSystemLocale\(\)/u);
  assert.match(i18n, /navigator\.languages/u);
  assert.match(i18n, /document\.documentElement\.lang = locale/u);
  assert.doesNotMatch(i18n, /sourceKeyLookup|getSourceKeyLookup/u);
  assert.match(i18n, /Object\.hasOwn\(messages, source\)/u);
  assert.match(settings, /@click="setLocale\(option\.value\)"/u);
  assert.match(settings, /value: 'zh-TW'/u);
  assert.match(settings, /value: 'en'/u);
  assert.match(documentTitle, /watch\(\[title, locale\]/u);
  assert.match(documentTitle, /t\(title\.value\)/u);
  assert.equal(packageJson.scripts['check:i18n'], 'node scripts/check-i18n.mjs');
  assert.match(packageJson.scripts['verify:local'], /npm run check:i18n/u);
  assert.match(i18nCheck, /English catalog is missing/u);
  assert.match(i18nCheck, /hard-coded Han string/u);
  assert.match(i18nCheck, /parseVueSfc/u);
  assert.match(i18nCheck, /static visible template text/u);
  assert.match(i18nCheck, /static user-facing attribute/u);
  assert.match(i18nCheck, /static user-facing object property/u);
  assert.match(i18nCheck, /Locale interpolation parameters do not match/u);
  assert.match(i18nCheck, /readCatalogDirectory/u);
  assert.match(i18nCheck, /key\.length > 55/u);
  assert.match(i18nCheck, /contains key outside its/u);
  assert.match(i18nCheck, /references an unknown API error code/u);
});

test('public API errors use a generated code-only contract', async () => {
  const apiErrorConfig = JSON.parse(await read('config/api-errors.config.json'));
  const backendResponse = await read('supabase/functions/backendAction/response.ts');
  const sharedHttp = await read('supabase/functions/_shared/http.ts');
  const gatewayHttp = await read('cloudflare/src/http.ts');
  const databaseTypes = await read('supabase/functions/_shared/database.ts');
  const dashboardAction = await read('supabase/functions/backendAction/dashboard.ts');
  const traceStorageMigration = await read('supabase/migrations/202607170001_unify_error_trace_storage.sql');
  const rateLimitConfig = JSON.parse(await read('config/rate-limits.config.json'));
  const packageJson = JSON.parse(await read('package.json'));

  assert.ok(apiErrorConfig['internal-error']);
  assert.ok(apiErrorConfig['rate-limit.operation']);
  assert.match(packageJson.scripts['generate:all'], /generate:api-errors/u);
  assert.doesNotMatch(backendResponse, /message:/u);
  assert.match(backendResponse, /publicErrorBody\(error\)/u);
  assert.doesNotMatch(sharedHttp, /達到上限|太頻繁|上傳額度已用完/u);
  assert.match(gatewayHttp, /retryAfterSeconds/u);
  assert.doesNotMatch(dashboardAction, /[\u3400-\u9fff]/u);
  assert.match(dashboardAction, /failed_task_codes/u);
  assert.doesNotMatch(databaseTypes, /last_error|error_message/u);
  for (const table of ['outbox_events', 'deletion_jobs', 'push_delivery_logs', 'maintenance_runs']) {
    assert.match(
      traceStorageMigration,
      new RegExp(`alter table app_private\\.${table} alter column error_trace_id type uuid`, 'u'),
    );
  }
  assert.match(traceStorageMigration, /fail_outbox_event\(event_id uuid, error_trace_id uuid\)/u);
  assert.match(traceStorageMigration, /raise exception 'validation-invalid'/u);
  for (const value of Object.values(rateLimitConfig)) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, 'limit')) continue;
    assert.equal(typeof value.errorCode, 'string');
    assert.ok(apiErrorConfig[value.errorCode]);
    assert.equal(Object.hasOwn(value, 'message'), false);
  }
});

test('navigation and contextual creation share the same responsive information architecture', async () => {
  const appShell = await read('src/components/AppShell.vue');
  const mobileHeader = await read('src/components/app-shell/AppMobileHeader.vue');
  const mobileNav = await read('src/components/app-shell/AppMobileBottomNav.vue');
  const desktopSidebar = await read('src/components/app-shell/AppDesktopSidebar.vue');
  const boardControls = await read('src/components/BoardControls.vue');
  const issueBoard = await read('src/components/IssueBoard.vue');
  const facilitiesView = await read('src/views/FacilitiesView.vue');
  const announcementsView = await read('src/views/AnnouncementsView.vue');
  const settingsPanel = await read('src/components/SettingsPanelContent.vue');
  const issueComposer = await read('src/components/IssueComposer.vue');
  const composerShell = await read('src/components/ui/EntryComposerShell.vue');
  const controls = await read('src/styles/controls.css');

  assert.match(appShell, /label: t\('issue\.proposal'\)/u);
  assert.match(appShell, /:category-filter="mobileCategoryFilter"/u);
  assert.match(mobileHeader, /IssueCategorySelector/u);
  assert.match(boardControls, /IssueCategorySelector/u);
  assert.doesNotMatch(mobileNav, /CreateActionMenu|新增/u);
  assert.doesNotMatch(desktopSidebar, /CreateActionMenu|新增/u);
  assert.ok(mobileNav.indexOf('v-for="item in items"') < mobileNav.indexOf('to="/notifications"'));
  assert.ok(mobileNav.indexOf('to="/notifications"') < mobileNav.indexOf('to="/settings"'));
  assert.ok(desktopSidebar.indexOf('v-for="item in items"') < desktopSidebar.indexOf('to="/notifications"'));
  assert.ok(desktopSidebar.indexOf('to="/notifications"') < desktopSidebar.indexOf('to="/settings"'));
  assert.match(boardControls, /v-if="createLabel"[\s\S]*name="plus"/u);
  assert.ok(boardControls.indexOf('name="search"') < boardControls.indexOf('v-if="createLabel"'));
  assert.match(boardControls, /class="button-contextual h-8 w-8 min-w-8[\s\S]*name="plus"/u);
  assert.doesNotMatch(boardControls, /<span class="truncate">\{\{ createLabel \}\}<\/span>/u);
  assert.match(issueBoard, /t\('issue\.addToCategory'/u);
  assert.match(facilitiesView, /:create-label="t\('facility\.addFacility'\)"[\s\S]*@create="composerOpen = true"/u);
  assert.match(announcementsView, /v-if="isAdmin"[\s\S]*:aria-label="t\('announcement\.newAnnouncement'\)"/u);
  assert.match(issueComposer, /EntryComposerShell/u);
  assert.match(composerShell, /class="button-dialog-close/u);
  assert.match(composerShell, /type="submit"[\s\S]*class="entry-composer__action button-secondary"/u);
  assert.doesNotMatch(issueComposer, /entry-composer__action button-contextual/u);
  assert.match(controls, /\.button-contextual \{[\s\S]*bg-surface[\s\S]*box-shadow: var\(--shadow-card\)/u);
  assert.match(controls, /\.button-dialog-close \{[\s\S]*bg-surface[\s\S]*box-shadow: var\(--shadow-card\)/u);
  assert.ok(settingsPanel.indexOf('issue.myProposal') < settingsPanel.indexOf('dashboard.statistics'));
  assert.ok(settingsPanel.indexOf('dashboard.statistics') < settingsPanel.indexOf('access.roleManagement'));
  assert.ok(settingsPanel.indexOf('access.roleManagement') < settingsPanel.indexOf('settings.restartApp'));
  assert.ok(settingsPanel.indexOf('settings.restartApp') < settingsPanel.indexOf('settings.moreResources'));
  await assert.rejects(read('src/components/CreateActionMenu.vue'));
  await assert.rejects(read('src/composables/useCreateEntryActions.ts'));
});

test('authenticated route pages share one content width and AppShell owns horizontal gutters', async () => {
  const baseStyles = await read('src/styles/base.css');
  const primitives = await read('src/styles/primitives.css');
  const contentStyles = await read('src/styles/content.css');
  const appShell = await read('src/components/AppShell.vue');
  const viewportFrame = await read('src/components/ui/ViewportFrame.vue');
  const mobileHeader = await read('src/components/app-shell/AppMobileHeader.vue');
  const mobileNav = await read('src/components/app-shell/AppMobileBottomNav.vue');
  const feedbackBar = await read('src/components/ActionFeedbackBar.vue');
  const emptyState = await read('src/components/ui/EmptyStatePanel.vue');
  const pageLoadFailure = await read('src/components/ui/PageLoadFailure.vue');
  const issueBoard = await read('src/components/IssueBoard.vue');
  const settingsPanel = await read('src/components/SettingsPanelContent.vue');
  const routePages = await Promise.all([
    'src/views/IssueBoardView.vue',
    'src/views/FacilitiesView.vue',
    'src/views/AnnouncementsView.vue',
    'src/views/NotificationsView.vue',
    'src/views/SettingsView.vue',
    'src/views/DashboardView.vue',
    'src/views/AccessManagementView.vue',
    'src/components/ui/DetailPageShell.vue',
  ].map(read));

  assert.match(baseStyles, /--app-content-max-width: 80rem;/u);
  assert.match(baseStyles, /--app-viewport-gutter: 1\.5rem;/u);
  assert.match(primitives, /\.viewport-frame \{[\s\S]*padding-left: max\(var\(--app-viewport-gutter\), env\(safe-area-inset-left\)\);[\s\S]*padding-right: max\(var\(--app-viewport-gutter\), env\(safe-area-inset-right\)\);/u);
  assert.match(primitives, /\.viewport-floating-inline \{[\s\S]*left: max\(var\(--app-viewport-gutter\), env\(safe-area-inset-left\)\);[\s\S]*right: max\(var\(--app-viewport-gutter\), env\(safe-area-inset-right\)\);/u);
  assert.match(baseStyles, /\.route-page \{[\s\S]*max-width: var\(--app-content-max-width\);[\s\S]*min-width: 0;[\s\S]*width: 100%;/u);
  assert.doesNotMatch(baseStyles, /\.app-viewport-frame/u);
  assert.match(viewportFrame, /class="viewport-frame"[\s\S]*'viewport-content': content/u);
  assert.match(appShell, /<ViewportFrame as="main" class="min-h-0 flex-1">/u);
  assert.match(mobileHeader, /<ViewportFrame/u);
  assert.match(mobileNav, /viewport-floating-inline/u);
  assert.doesNotMatch(mobileNav, /\bleft-4\b|\bright-4\b/u);
  routePages.forEach((page) => assert.match(page, /class="[^"]*route-page/u));
  routePages.forEach((page) => assert.doesNotMatch(page, /route-page-surface-inset/u));
  assert.doesNotMatch(contentStyles, /\.issue-card-grid \{[^}]*padding:/u);
  assert.match(contentStyles, /\.scroll-shadow-bleed \{[\s\S]*margin-left: calc\(var\(--scroll-shadow-bleed\) \* -1\);[\s\S]*margin-top: calc\(var\(--scroll-shadow-bleed\) \* -1\);[\s\S]*padding-left: var\(--scroll-shadow-bleed\);[\s\S]*padding-top: var\(--scroll-shadow-bleed\);/u);
  [issueBoard, routePages[1]]
    .forEach((page) => assert.match(page, /scroll-shadow-bleed[\s\S]*overflow-y-auto overflow-x-hidden/u));
  assert.match(emptyState, /class="flex w-full min-w-0/u);
  assert.match(pageLoadFailure, /class="route-page panel panel-pad flex w-full min-w-0/u);
  assert.match(feedbackBar, /action-feedback-card[\s\S]*min-h-14 w-full/u);
  assert.match(contentStyles, /\.settings-scroll--flat \{[\s\S]*@apply overflow-visible px-0 py-3/u);
  assert.match(settingsPanel, /flat \? 'settings-panel--flat overflow-visible' : 'overflow-hidden'/u);
  assert.match(settingsPanel, /flat[\s\S]*\? 'settings-scroll--flat overflow-visible'[\s\S]*: 'overflow-x-hidden overflow-y-auto'/u);
  assert.doesNotMatch(settingsPanel, /settings-scroll min-h-0 min-w-0 w-full max-w-full overflow-x-hidden overflow-y-auto/u);
  assert.doesNotMatch(routePages[3], /px-0\.5|sm:px-1/u);
  assert.doesNotMatch(routePages[4], /:class="\{ 'px-1': true \}"/u);
  assert.doesNotMatch(routePages[4], /overflow-x-hidden/u);
  assert.doesNotMatch(routePages[5], /space-y-5 px-2/u);
  assert.doesNotMatch(routePages[7], /px-1|sm:px-2/u);
});

test('reusable UI primitives own buttons, surfaces, lists, dropdowns, controls, and elevation', async () => {
  const packageJson = JSON.parse(await read('package.json'));
  const styleEntry = await read('src/style.css');
  const baseStyles = await read('src/styles/base.css');
  const primitives = await read('src/styles/primitives.css');
  const appButton = await read('src/components/ui/AppButton.vue');
  const surfacePanel = await read('src/components/ui/SurfacePanel.vue');
  const dropdownPanel = await read('src/components/ui/DropdownPanel.vue');
  const dropdownMenu = await read('src/components/ui/DropdownMenu.vue');
  const contentCard = await read('src/components/ui/ContentCardShell.vue');
  const compactMenu = await read('src/components/CompactActionMenu.vue');
  const facilityMenu = await read('src/components/FacilityAdminMenu.vue');
  const boardControls = await read('src/components/BoardControls.vue');
  const settingsPanel = await read('src/components/SettingsPanelContent.vue');
  const commentComposer = await read('src/components/CommentComposer.vue');
  const skeletonTable = await read('src/components/ui/SkeletonTable.vue');
  const skeletonAnnouncements = await read('src/components/ui/SkeletonAnnouncementList.vue');
  const notifications = await read('src/views/NotificationsView.vue');
  const settingsView = await read('src/views/SettingsView.vue');
  const checker = await read('scripts/check-ui-primitives.mjs');

  assert.match(styleEntry, /@import "\.\/styles\/primitives\.css";/u);
  for (const token of ['--shadow-control', '--shadow-card', '--shadow-floating']) {
    assert.match(baseStyles, new RegExp(`${token}:`, 'u'));
    assert.match(primitives, new RegExp(`var\\(${token}\\)`, 'u'));
  }
  for (const primitive of [
    '.surface-control',
    '.surface-card',
    '.surface-floating',
    '.list-surface',
    '.list-surface-row',
    '.dropdown-panel',
    '.dropdown-item',
    '.dropdown-label',
    '.control-frame',
    '.control-footer',
  ]) {
    assert.ok(primitives.includes(primitive), `missing UI primitive ${primitive}`);
  }

  assert.match(appButton, /type ButtonVariant = 'contextual'[\s\S]*'toolbar'/u);
  assert.match(surfacePanel, /type SurfaceVariant = 'card' \| 'control' \| 'floating' \| 'inset' \| 'list'/u);
  assert.match(dropdownPanel, /class="dropdown-panel"/u);
  assert.match(dropdownMenu, /<DropdownPanel[\s\S]*useDropdownPosition[\s\S]*useClickOutside/u);
  assert.match(contentCard, /surface-card surface-card--interactive/u);
  [compactMenu, facilityMenu].forEach((menu) => assert.match(menu, /<DropdownMenu/u));
  assert.match(boardControls, /<DropdownPanel/u);
  assert.match(settingsPanel, /list-surface/u);
  assert.match(settingsPanel, /settings-row list-surface-row list-surface-row--interactive/u);
  assert.match(commentComposer, /control-frame/u);
  [skeletonTable, skeletonAnnouncements].forEach((skeleton) => {
    assert.match(skeleton, /<SurfacePanel[^>]*class="issue-card"/u);
  });
  assert.match(notifications, /notification-group-row list-surface-row list-surface-row--interactive/u);
  assert.match(notifications, /notification-group-row list-surface-row/u);
  assert.match(settingsView, /v-if="loading"[\s\S]*<SurfacePanel variant="list"/u);

  assert.equal(packageJson.scripts['check:ui'], 'node scripts/check-ui-primitives.mjs');
  assert.match(packageJson.scripts['verify:local'], /npm run check:ui/u);
  assert.match(checker, /legacy popover-panel/u);
  assert.match(checker, /hard-codes floating viewport gutters/u);
  assert.match(checker, /defines an arbitrary shadow/u);
  assert.match(checker, /assembles a card surface manually/u);
});

test('pull requests and backend deployments retain the local integration gate', async () => {
  const packageJson = JSON.parse(await read('package.json'));
  const verifyPr = await read('.github/workflows/verify-pr.yml');
  const deployBackend = await read('.github/workflows/deploy-backend.yml');
  const agents = await read('AGENTS.md');

  assert.equal(
    packageJson.scripts['verify:all'],
    'npm run verify:local && npm run verify:integration',
  );
  assert.match(verifyPr, /Full local backend integration[\s\S]*npm run verify:integration/u);
  assert.match(verifyPr, /Check Cloudflare Worker[\s\S]*npm run check:worker/u);
  assert.match(verifyPr, /denoland\/setup-deno@v2[\s\S]*npm run verify:integration/u);
  assert.doesNotMatch(verifyPr, /NOVAE_DENO_BIN|\/home\/runner\/\.deno/u);
  assert.match(
    deployBackend,
    /Verify local database, permissions, and Edge workflows[\s\S]*npm run verify:integration/u,
  );
  assert.match(
    deployBackend,
    /denoland\/setup-deno@v2[\s\S]*npm run verify:integration/u,
  );
  assert.doesNotMatch(deployBackend, /NOVAE_DENO_BIN|\/home\/runner\/\.deno/u);
  assert.match(agents, /新增 backend action 必須在 `tests\/integration\/`/u);
});

test('GitHub workflows use the current Node 24 action generations', async () => {
  const workflowPaths = [
    '.github/workflows/deploy-backend.yml',
    '.github/workflows/deploy-frontend.yml',
    '.github/workflows/reset-db.yml',
    '.github/workflows/verify-pr.yml',
  ];
  const workflows = await Promise.all(workflowPaths.map((path) => read(path)));
  const combined = workflows.join('\n');

  assert.doesNotMatch(
    combined,
    /actions\/checkout@v[1-6]\b|actions\/setup-node@v[1-6]\b|supabase\/setup-cli@v[1-2]\b/u,
  );
  assert.match(combined, /actions\/checkout@v7/u);
  assert.match(combined, /actions\/setup-node@v7[\s\S]*node-version: 24/u);
  assert.match(combined, /actions\/cache@v6/u);
  assert.match(combined, /supabase\/setup-cli@v3/u);
  assert.match(combined, /denoland\/setup-deno@v2/u);
});

test('Edge Functions avoid the Supabase JS Node-version shim', async () => {
  const edgeFiles = await listFiles('supabase/functions');
  const edgeSource = (await Promise.all(
    edgeFiles.map((file) => readFile(file, 'utf8')),
  )).join('\n');
  const databaseClient = await read('supabase/functions/_shared/database-client.ts');
  const integrationScript = await read('scripts/verify-integration-local.sh');

  const supabaseJsImports = edgeSource
    .split(/\r?\n/u)
    .filter((line) => line.includes('npm:@supabase/supabase-js'));
  assert.ok(supabaseJsImports.every((line) => line.trimStart().startsWith('import type ')));
  assert.match(databaseClient, /npm:@supabase\/postgrest-js@2\.110\.7/u);
  assert.match(databaseClient, /APP_SUPABASE_SERVICE_ROLE_KEY/u);
  assert.match(integrationScript, /-X OPTIONS[\s\S]*backendAction/u);
  assert.match(
    integrationScript,
    /DENO_FALLBACK[\s\S]*node_modules\/\.bin[\s\S]*type -aP deno/u,
  );
  assert.match(
    integrationScript,
    /test --help[\s\S]*--minimum-dependency-age[\s\S]*DENO_DEPENDENCY_AGE_ARGS/u,
  );
  assert.doesNotMatch(
    integrationScript,
    /--data ['"][^'"]*integrationReadinessProbe/u,
  );
});
