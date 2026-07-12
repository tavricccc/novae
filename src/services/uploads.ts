import { invokeBackendAction } from '@/services/backend-action';
import { createRequestId } from '@/lib/request-id';
import { LONG_REQUEST_TIMEOUT_MS, READ_REQUEST_TIMEOUT_MS, withRequestTimeout } from '@/lib/request';
import { toReadableBackendError } from './issues-core';

interface ResolvedUploadCacheEntry {
  expiresAtMs: number;
  url: string;
}

const resolvedUploadCache = new Map<string, ResolvedUploadCacheEntry>();
const resolvedUploadRefreshBufferMs = 60 * 1000;

export function clearResolvedUploadCache() {
  resolvedUploadCache.clear();
}

interface ImageUploadPolicy {
  height: number;
  uploadId: string;
  storagePath: string;
  width: number;
}

interface ImageUploadSession {
  apiKey: string;
  allowedFormats?: string;
  cloudName: string;
  folder?: string;
  maxFileSize?: string;
  overwrite?: string;
  notificationUrl?: string;
  publicId: string;
  signature: string;
  timestamp: number;
  type?: string;
  uploadId: string;
}

interface CloudinaryUploadResponse {
  public_id?: string;
  signature?: string;
  version?: number;
}

interface CloudinaryErrorResponse {
  error?: {
    message?: string;
  };
}

export interface ImageUploadInput {
  file: File;
  height: number;
  width: number;
}

function toReadableUploadError(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  const uploadMessage = message.replace(/^FirebaseError:\s*/u, '').trim();

  if (uploadMessage && /圖片|WebP|JPEG|UPLOAD-/u.test(uploadMessage)) {
    return new Error(uploadMessage);
  }

  return toReadableBackendError(error);
}

async function createCloudinaryUploadError(response: Response) {
  let providerMessage = '';
  try {
    const payload = await response.json() as CloudinaryErrorResponse;
    providerMessage = payload.error?.message?.trim() ?? '';
  } catch {
    // Cloudinary 偶爾會回傳非 JSON 錯誤頁；只依狀態碼提供安全訊息。
  }

  if (response.status === 401) {
    if (/timestamp|stale/i.test(providerMessage)) {
      return new Error('圖片上傳驗證已逾時，請重新選擇圖片後再試。');
    }
    return new Error('圖片服務驗證失敗，請聯絡管理員檢查 Cloudinary 金鑰設定。');
  }
  if (response.status === 413 || /file size|too large/i.test(providerMessage)) {
    return new Error('圖片大小超過上傳限制。');
  }
  if (response.status === 400 && /format|allowed_formats/i.test(providerMessage)) {
    return new Error('圖片格式不受支援，請重新選擇圖片。');
  }
  return new Error(`圖片上傳失敗（${response.status}），請稍後再試。`);
}

async function uploadToCloudinary(file: File, session: ImageUploadSession) {
  const body = new FormData();
  body.set('file', file);
  body.set('api_key', session.apiKey);
  body.set('timestamp', String(session.timestamp));
  body.set('public_id', session.publicId);
  body.set('signature', session.signature);
  if (session.allowedFormats) body.set('allowed_formats', session.allowedFormats);
  if (session.folder) body.set('folder', session.folder);
  if (session.maxFileSize) body.set('max_file_size', session.maxFileSize);
  if (session.overwrite) body.set('overwrite', session.overwrite);
  if (session.notificationUrl) body.set('notification_url', session.notificationUrl);
  if (session.type) body.set('type', session.type);

  return await withRequestTimeout(async () => {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${session.cloudName}/image/upload`,
      { method: 'POST', body },
    );
    if (!response.ok) throw await createCloudinaryUploadError(response);
    return await response.json() as CloudinaryUploadResponse;
  }, { label: '圖片上傳', timeoutMs: LONG_REQUEST_TIMEOUT_MS });
}

export async function createImageUploadPolicies(inputs: ImageUploadInput[]): Promise<ImageUploadPolicy[]> {
  if (inputs.length === 0) return [];
  if (inputs.some(({ file }) => file.type !== 'image/webp')) {
    throw new Error('圖片必須轉換為 WebP 後才能上傳。');
  }

  try {
    const createSession = invokeBackendAction<
      { images: Array<{ contentType: string; height: number; size: number; width: number }>; requestId: string },
      { sessions: ImageUploadSession[] }
    >('createImageUploadSessions');
    const { sessions } = await createSession({
      images: inputs.map(({ file, height, width }) => ({
        contentType: file.type,
        height,
        size: file.size,
        width,
      })),
      requestId: createRequestId(),
    });
    if (sessions.length !== inputs.length) throw new Error('圖片上傳工作建立不完整。');
    const uploadResponses = await Promise.all(
      inputs.map(({ file }, index) => uploadToCloudinary(file, sessions[index]!)),
    );

    const finalize = invokeBackendAction<{
      requestId: string;
      uploads: Array<{ publicId: string; signature: string; uploadId: string; version: number }>;
    }, { uploads: ImageUploadPolicy[] }>('finalizeImageUploads', {
      timeoutMs: LONG_REQUEST_TIMEOUT_MS,
    });
    const result = await finalize({
      requestId: createRequestId(),
      uploads: uploadResponses.map((response, index) => ({
        publicId: response.public_id ?? '',
        signature: response.signature ?? '',
        uploadId: sessions[index]!.uploadId,
        version: response.version ?? 0,
      })),
    });
    return result.uploads;
  } catch (error) {
    throw toReadableUploadError(error);
  }
}

export async function deleteUploadedImages(storagePaths: string[]) {
  const uniquePaths = [...new Set(storagePaths.filter(Boolean))];
  if (uniquePaths.length === 0) return;
  try {
    const fn = invokeBackendAction<
      { requestId: string; storagePaths: string[] },
      { deleted: number; success: boolean }
    >('deleteUploadedImages');
    await fn({ requestId: createRequestId(), storagePaths: uniquePaths });
  } catch (error) {
    throw toReadableBackendError(error);
  }
}

interface ResolveUploadOptions {
  forceRefresh?: boolean;
}

export function invalidateResolvedUploadCache(uploadIds: string[]) {
  uploadIds.forEach((uploadId) => resolvedUploadCache.delete(uploadId));
}

export async function resolveUploadImageUrls(uploadIds: string[], options: ResolveUploadOptions = {}) {
  const uniqueIds = [...new Set(uploadIds)];
  if (options.forceRefresh) {
    invalidateResolvedUploadCache(uniqueIds);
  }

  const now = Date.now();
  const cachedEntries = uniqueIds.flatMap((uploadId) => {
    const entry = resolvedUploadCache.get(uploadId);
    return entry && entry.expiresAtMs - resolvedUploadRefreshBufferMs > now
      ? [[uploadId, entry] as const]
      : [];
  });
  const cachedIds = new Set(cachedEntries.map(([uploadId]) => uploadId));
  const unresolvedIds = uniqueIds.filter((uploadId) => !cachedIds.has(uploadId));

  if (unresolvedIds.length === 0) {
    return {
      errors: {},
      expiresAtByUploadId: Object.fromEntries(cachedEntries.map(([id, entry]) => [id, entry.expiresAtMs])),
      expiresAtMs: Math.min(...cachedEntries.map(([, entry]) => entry.expiresAtMs)),
      urls: Object.fromEntries(cachedEntries.map(([id, entry]) => [id, entry.url])),
    };
  }

  try {
    const fn = invokeBackendAction<
      { uploadIds: string[] },
      {
        errors?: Record<string, string>;
        expiresAtByUploadId?: Record<string, number>;
        expiresAtMs: number;
        urls: Record<string, string>;
      }
    >('resolveUploadImageUrls', {
      timeoutMs: READ_REQUEST_TIMEOUT_MS,
    });
    const result = await fn({ uploadIds: unresolvedIds });
    const fetched = result;
    Object.entries(fetched.urls).forEach(([uploadId, url]) => {
      resolvedUploadCache.set(uploadId, {
        expiresAtMs: fetched.expiresAtByUploadId?.[uploadId] ?? fetched.expiresAtMs,
        url,
      });
    });

    const allEntries = uniqueIds.flatMap((uploadId) => {
      const cachedEntry = resolvedUploadCache.get(uploadId);
      const fetchedUrl = fetched.urls[uploadId];
      const entry = cachedEntry ?? (fetchedUrl ? {
        expiresAtMs: fetched.expiresAtByUploadId?.[uploadId] ?? fetched.expiresAtMs,
        url: fetchedUrl,
      } : undefined);
      return entry ? [[uploadId, entry] as const] : [];
    });
    const allExpirationValues = allEntries.map(([, entry]) => entry.expiresAtMs);
    return {
      errors: fetched.errors ?? {},
      expiresAtByUploadId: Object.fromEntries(allEntries.map(([id, entry]) => [id, entry.expiresAtMs])),
      expiresAtMs: allExpirationValues.length > 0
        ? Math.min(...allExpirationValues)
        : fetched.expiresAtMs,
      urls: Object.fromEntries(allEntries.map(([id, entry]) => [id, entry.url])),
    };
  } catch (error) {
    throw toReadableBackendError(error);
  }
}
