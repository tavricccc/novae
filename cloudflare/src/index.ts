import { requireFirebaseUid } from './auth';
import {
  apiErrorResponse,
  corsHeaders,
  isAllowedBrowserRequest,
  parseJsonRecord,
  readBody,
} from './http';
import {
  claimActionIngress,
  claimActionRateLimit,
  claimCloudinaryIngress,
  claimSyncIngress,
  claimSyncUser,
  RateLimitError,
} from './rate-limit';
import { verifyCloudinarySignature } from './signature';
import { handleMedia } from './media';
import type { Env } from './types';
import { isApiErrorCode } from '../generated/api-errors';

const AUTH_SCOPED_LIST_CACHE_TTL_SECONDS = 30;
const CACHEABLE_LIST_ACTIONS = new Set(['listAnnouncements', 'listFacilities', 'listIssues', 'searchIssues']);

function clientIp(request: Request) {
  return request.headers.get('cf-connecting-ip')?.trim() || 'unknown';
}

function originUrl(env: Env, role: string) {
  const base = env.SUPABASE_FUNCTIONS_BASE_URL.replace(/\/+$/u, '');
  if (env.LOCAL_TEST_MODE === 'true') {
    const localFunction = { api: 'backendAction', media: 'cloudinaryWebhook', sync: 'syncUser' }[role];
    if (!localFunction) throw new Error('not-found');
    return `${base}/${localFunction}`;
  }
  return `${base}/n${env.EDGE_FUNCTION_NAMESPACE}-${role}`;
}

function upstreamHeaders(request: Request, env: Env, requestId: string) {
  const headers = new Headers();
  for (const name of ['authorization', 'content-type', 'x-cld-signature', 'x-cld-timestamp']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('x-novae-origin-secret', env.EDGE_ORIGIN_SECRET);
  headers.set('x-request-id', requestId);
  return headers;
}

async function forward(request: Request, env: Env, role: string, body: Uint8Array, requestId: string) {
  const upstreamBody = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
  const upstream = await fetch(originUrl(env, role), {
    method: 'POST',
    headers: upstreamHeaders(request, env, requestId),
    body: upstreamBody,
    signal: AbortSignal.timeout(30_000),
  });
  const headers = new Headers(upstream.headers);
  for (const name of [
    'access-control-allow-headers',
    'access-control-allow-methods',
    'access-control-allow-origin',
    'access-control-max-age',
  ]) {
    headers.delete(name);
  }
  for (const [name, value] of Object.entries(corsHeaders(request, env))) headers.set(name, value);
  headers.set('cache-control', 'no-store');
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

async function digestHex(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function actionCacheKey(request: Request, uid: string, action: string, body: Uint8Array) {
  const origin = request.headers.get('origin') ?? '';
  const bodyText = new TextDecoder().decode(body);
  const digest = await digestHex(`${uid}\u0000${origin}\u0000${bodyText}`);
  return new Request(`https://novae-action-cache.invalid/${encodeURIComponent(action)}/${digest}`, { method: 'GET' });
}

function responseForBrowser(response: Response) {
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store');
  headers.set('x-novae-worker-cache', 'hit');
  return new Response(response.body, { headers, status: response.status, statusText: response.statusText });
}

async function forwardCachedListAction(
  request: Request,
  env: Env,
  body: Uint8Array,
  requestId: string,
  uid: string,
  action: string,
) {
  const workerCache = (caches as CacheStorage & { default?: Cache }).default;
  if (!workerCache) return await forward(request, env, 'api', body, requestId);
  const cacheKey = await actionCacheKey(request, uid, action, body);
  const cached = await workerCache.match(cacheKey).catch(() => undefined);
  if (cached) return responseForBrowser(cached);

  const response = await forward(request, env, 'api', body, requestId);
  if (response.ok) {
    const cacheHeaders = new Headers(response.headers);
    cacheHeaders.set('cache-control', `public, max-age=${AUTH_SCOPED_LIST_CACHE_TTL_SECONDS}`);
    cacheHeaders.set('x-novae-worker-cache', 'miss');
    await workerCache.put(cacheKey, new Response(response.clone().body, {
      headers: cacheHeaders,
      status: response.status,
      statusText: response.statusText,
    })).catch(() => undefined);
  }
  return response;
}

async function handleAction(request: Request, env: Env, requestId: string) {
  if (!isAllowedBrowserRequest(request, env)) return apiErrorResponse(request, env, requestId, 'origin-denied');
  const body = await readBody(request);
  const parsed = parseJsonRecord(body);
  const action = typeof parsed.action === 'string' ? parsed.action : '';
  if (!action) return apiErrorResponse(request, env, requestId, 'invalid-action');
  await claimActionIngress(env, clientIp(request));
  const uid = await requireFirebaseUid(request, env);
  await claimActionRateLimit(env, uid, action);
  if (CACHEABLE_LIST_ACTIONS.has(action) && env.LOCAL_TEST_MODE !== 'true') {
    return await forwardCachedListAction(request, env, body, requestId, uid, action);
  }
  return await forward(request, env, 'api', body, requestId);
}

async function handleSync(request: Request, env: Env, requestId: string) {
  if (!isAllowedBrowserRequest(request, env)) return apiErrorResponse(request, env, requestId, 'origin-denied');
  const body = await readBody(request);
  parseJsonRecord(body);
  await claimSyncIngress(env, clientIp(request));
  const uid = await requireFirebaseUid(request, env);
  await claimSyncUser(env, uid);
  return await forward(request, env, 'sync', body, requestId);
}

async function handleCloudinary(request: Request, env: Env, requestId: string) {
  const body = await readBody(request);
  if (!await verifyCloudinarySignature(request, body, env.CLOUDINARY_WEBHOOK_SECRET)) {
    return apiErrorResponse(request, env, requestId, 'invalid-signature');
  }
  await claimCloudinaryIngress(env, clientIp(request));
  return await forward(request, env, 'media', body, requestId);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const pathname = new URL(request.url).pathname;
    const mediaMatch = pathname.match(/^\/v1\/media\/([^/]+)\/([^/]+)$/u);
    if (mediaMatch && (request.method === 'GET' || request.method === 'HEAD')) {
      return await handleMedia(request, env, mediaMatch[1], mediaMatch[2]);
    }
    if (request.method === 'OPTIONS') {
      if (!isAllowedBrowserRequest(request, env)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    if (request.method !== 'POST') return apiErrorResponse(request, env, requestId, 'method-not-allowed', undefined, { allow: 'POST, OPTIONS' });

    try {
      if (pathname === '/v1/actions') return await handleAction(request, env, requestId);
      if (pathname === '/v1/auth/sync') return await handleSync(request, env, requestId);
      if (pathname === '/v1/webhooks/cloudinary') return await handleCloudinary(request, env, requestId);
      return apiErrorResponse(request, env, requestId, 'not-found');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'internal-error';
      console.error({ message, requestId, path: new URL(request.url).pathname });
      if (error instanceof RateLimitError) {
        const code = isApiErrorCode(error.message) ? error.message : 'internal-error';
        return apiErrorResponse(request, env, requestId, code, error.retryAfterSeconds);
      }
      const code = isApiErrorCode(message) ? message : 'upstream-unavailable';
      return apiErrorResponse(request, env, requestId, code);
    }
  },
};
