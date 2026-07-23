import type { Env } from './types';

type MediaVariant = 'avatar' | 'full' | 'thumbnail';

interface MediaPayload {
  expiresAt: number;
  private: boolean;
  publicId: string;
  version: 1;
}

const MEDIA_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
const PUBLIC_BROWSER_CACHE_TTL_SECONDS = 365 * 24 * 60 * 60;
const TOKEN_PATTERN = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/u;
const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_./-]{1,500}$/u;
const VARIANTS = new Set<MediaVariant>(['avatar', 'full', 'thumbnail']);

function fromUrlSafeBase64(value: string) {
  const base64 = value.replace(/-/gu, '+').replace(/_/gu, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toUrlSafeBase64(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

async function verifyMediaToken(token: string, secret: string) {
  const match = token.match(TOKEN_PATTERN);
  if (!match) return null;
  const [, encodedPayload, encodedSignature] = match;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['verify'],
  );
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    fromUrlSafeBase64(encodedSignature),
    new TextEncoder().encode(`novae-media-v1.${encodedPayload}`),
  ).catch(() => false);
  if (!valid) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromUrlSafeBase64(encodedPayload))) as MediaPayload;
    if (
      payload.version !== 1
      || typeof payload.private !== 'boolean'
      || !Number.isSafeInteger(payload.expiresAt)
      || !PUBLIC_ID_PATTERN.test(payload.publicId)
      || (payload.private && payload.expiresAt <= Math.floor(Date.now() / 1000))
      || (!payload.private && payload.expiresAt !== 0)
    ) return null;
    return payload;
  } catch {
    return null;
  }
}

async function sha1UrlSafeBase64(value: string) {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(value));
  return toUrlSafeBase64(new Uint8Array(digest));
}

async function cloudinarySourceUrl(publicId: string, env: Env) {
  const deliveryPath = `${publicId}.webp`;
  const signature = (await sha1UrlSafeBase64(`${deliveryPath}${env.CLOUDINARY_API_SECRET}`)).slice(0, 8);
  const encodedPublicId = publicId.split('/').map(encodeURIComponent).join('/');
  const baseUrl = env.CLOUDINARY_DELIVERY_BASE_URL?.replace(/\/+$/u, '')
    || `https://res.cloudinary.com/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}`;
  return `${baseUrl}/image/authenticated/s--${signature}--/${encodedPublicId}.webp`;
}

async function mediaCacheKey(publicId: string, variant: MediaVariant) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(publicId));
  return new Request(
    `https://novae-media-cache.invalid/${toUrlSafeBase64(new Uint8Array(digest))}/${variant}`,
  );
}

function browserResponse(response: Response, payload: MediaPayload, cacheStatus: 'hit' | 'miss') {
  const headers = new Headers(response.headers);
  headers.delete('set-cookie');
  headers.set(
    'cache-control',
    payload.private
      ? 'private, no-store'
      : `public, max-age=${PUBLIC_BROWSER_CACHE_TTL_SECONDS}, immutable`,
  );
  headers.set('cross-origin-resource-policy', 'cross-origin');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-novae-media-cache', cacheStatus);
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function imageFetchOptions(variant: MediaVariant) {
  if (variant === 'full') return {};
  const image = variant === 'avatar'
    ? { fit: 'cover', format: 'webp', height: 96, quality: 75, width: 96 }
    : { fit: 'cover', format: 'webp', height: 240, quality: 75, width: 320 };
  return { cf: { image } } as RequestInit;
}

export async function handleMedia(request: Request, env: Env, token: string, rawVariant: string) {
  const clientIp = request.headers.get('cf-connecting-ip')?.trim() || 'unknown';
  const rateLimit = await env.MEDIA_IP_RATE_LIMITER.limit({ key: `media:${clientIp}` });
  if (!rateLimit.success) {
    return new Response(null, { status: 429, headers: { 'retry-after': '60' } });
  }
  const variant = VARIANTS.has(rawVariant as MediaVariant) ? rawVariant as MediaVariant : null;
  const payload = await verifyMediaToken(token, env.EDGE_ORIGIN_SECRET);
  if (!variant || !payload) return new Response(null, { status: 404 });

  const workerCache = (caches as CacheStorage & { default?: Cache }).default;
  const cacheKey = await mediaCacheKey(payload.publicId, variant);
  const cached = await workerCache?.match(cacheKey).catch(() => undefined);
  if (cached) {
    const response = browserResponse(cached, payload, 'hit');
    return request.method === 'HEAD' ? new Response(null, response) : response;
  }

  const upstream = await fetch(
    await cloudinarySourceUrl(payload.publicId, env),
    imageFetchOptions(variant),
  );
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  const cacheHeaders = new Headers(upstream.headers);
  cacheHeaders.delete('set-cookie');
  cacheHeaders.set('cache-control', `public, max-age=${MEDIA_CACHE_TTL_SECONDS}`);
  const cacheable = new Response(upstream.clone().body, {
    headers: cacheHeaders,
    status: upstream.status,
    statusText: upstream.statusText,
  });
  await workerCache?.put(cacheKey, cacheable).catch(() => undefined);
  const response = browserResponse(upstream, payload, 'miss');
  return request.method === 'HEAD' ? new Response(null, response) : response;
}
