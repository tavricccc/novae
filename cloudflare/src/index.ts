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
import type { Env } from './types';
import { isApiErrorCode } from '../generated/api-errors';

function clientIp(request: Request) {
  return request.headers.get('cf-connecting-ip')?.trim() || 'unknown';
}

function originUrl(env: Env, role: string) {
  const base = env.SUPABASE_FUNCTIONS_BASE_URL.replace(/\/+$/u, '');
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

async function handleAction(request: Request, env: Env, requestId: string) {
  if (!isAllowedBrowserRequest(request, env)) return apiErrorResponse(request, env, requestId, 'origin-denied');
  const body = await readBody(request);
  const parsed = parseJsonRecord(body);
  const action = typeof parsed.action === 'string' ? parsed.action : '';
  if (!action) return apiErrorResponse(request, env, requestId, 'invalid-action');
  await claimActionIngress(env, clientIp(request));
  const uid = await requireFirebaseUid(request, env);
  await claimActionRateLimit(env, uid, action);
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
    if (request.method === 'OPTIONS') {
      if (!isAllowedBrowserRequest(request, env)) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    if (request.method !== 'POST') return apiErrorResponse(request, env, requestId, 'method-not-allowed', undefined, { allow: 'POST, OPTIONS' });

    try {
      const pathname = new URL(request.url).pathname;
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
