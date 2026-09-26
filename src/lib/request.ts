import { isApiErrorCode } from '@/generated/api-errors';
import { t } from '@/i18n';
import { ApiRequestError, type ApiErrorResponse } from '@/lib/api-error';
import { getOperationPolicy } from '@/lib/operation-policies';

const BASE_RETRY_DELAY_MS = 300;
const MAX_RETRY_DELAY_MS = 2_000;
const RETRYABLE_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const SAFE_RETRY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const writeTimes = new Map<string, number>();

export async function waitForWriteCooldown(key: string, cooldown: number, signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason;
  const now = Date.now();
  const scheduledAt = Math.max(now,(writeTimes.get(key) ?? 0)+cooldown);
  if(scheduledAt-now > 5000) throw new ApiRequestError({ error: { code:'rate-limit.operation',retryAfterSeconds:Math.max(1,Math.ceil(cooldown/1000)) } });
  writeTimes.set(key,scheduledAt);
  for(const [oldKey,time] of writeTimes) if(now-time > 5000) writeTimes.delete(oldKey);
  if(scheduledAt <= now) return;
  await new Promise<void>((resolve,reject) => {
    const timer = window.setTimeout(() => { signal?.removeEventListener('abort',abort); resolve(); },scheduledAt-now);
    const abort = () => { window.clearTimeout(timer); reject(signal?.reason); };
    signal?.addEventListener('abort',abort,{once:true});
  });
}

export const readRequestTimeoutMs = () => getOperationPolicy('readTimeoutMs');
export const longRequestTimeoutMs = () => getOperationPolicy('longTimeoutMs');

type RequestFailureCode = 'aborted' | 'http' | 'network' | 'timeout' | 'unknown';

export class RequestFailure extends Error {
  readonly code: RequestFailureCode;
  readonly status?: number;
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    code: RequestFailureCode,
    status?: number,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'RequestFailure';
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

interface RequestRetryOptions {
  allowUnsafe?: boolean;
  maxAttempts?: number;
}

interface RequestOptions {
  label?: string;
  retry?: false | RequestRetryOptions;
  signal?: AbortSignal;
  timeoutMs?: number | (() => number);
}

function abortedFailure(signal: AbortSignal, label: string) {
  return signal.reason instanceof RequestFailure
    ? signal.reason
    : new RequestFailure(t('request.aborted', { label: t(label) }), 'aborted');
}

function normalizeRetryAfterSeconds(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.ceil(value)
    : undefined;
}

function parseRetryAfterSeconds(value: string | null) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1, Math.ceil(seconds));
  const retryAt = Date.parse(value);
  if (!Number.isFinite(retryAt)) return undefined;
  return Math.max(1, Math.ceil((retryAt - Date.now()) / 1_000));
}

function retryAfterMessage(message: string, retryAfterSeconds: number | undefined) {
  return retryAfterSeconds
    ? t('common.retryAfterSeconds', { message, seconds: retryAfterSeconds })
    : message;
}

async function apiErrorFromResponse(response: Response) {
  const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get('Retry-After'));
  let body: ApiErrorResponse | null = null;
  try {
    body = await response.json() as ApiErrorResponse;
  } catch {
    return { apiError: null, retryAfterSeconds };
  }
  if (!isApiErrorCode(body?.error?.code)) {
    return { apiError: null, retryAfterSeconds };
  }
  return {
    apiError: new ApiRequestError(body, { retryAfterSeconds }),
    retryAfterSeconds,
  };
}

function retryDelayMs(error: unknown, attempt: number) {
  const retryAfterSeconds = error instanceof ApiRequestError || error instanceof RequestFailure
    ? normalizeRetryAfterSeconds(error.retryAfterSeconds)
    : undefined;
  if (retryAfterSeconds) return retryAfterSeconds * 1_000;
  const exponential = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * (2 ** Math.max(0, attempt - 1)));
  return Math.min(MAX_RETRY_DELAY_MS, exponential + Math.floor(Math.random() * 150));
}

function shouldRetry(error: unknown, retrySafe: boolean) {
  if (error instanceof ApiRequestError) {
    if (error.status === 429) return true;
    if (error.code === 'request-in-progress') return retrySafe;
    return retrySafe && RETRYABLE_HTTP_STATUSES.has(error.status);
  }
  if (!(error instanceof RequestFailure)) return false;
  if (error.code === 'aborted') return false;
  if (error.code === 'network' || error.code === 'timeout') return retrySafe;
  if (error.code !== 'http' || !error.status) return false;
  if (error.status === 429) return true;
  return retrySafe && RETRYABLE_HTTP_STATUSES.has(error.status);
}

function waitForRetry(ms: number, signal: AbortSignal | undefined, label: string) {
  if (signal?.aborted) return Promise.reject(abortedFailure(signal, label));
  return new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(timeoutId);
      reject(abortedFailure(signal as AbortSignal, label));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function withRequestTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  options: RequestOptions = {},
): Promise<T> {
  const label = options.label ?? 'common.request';
  const controller = new AbortController();
  const timeoutMs = (typeof options.timeoutMs === 'function' ? options.timeoutMs() : options.timeoutMs) ?? getOperationPolicy('requestTimeoutMs');

  const abortFromParent = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) throw abortedFailure(options.signal, label);
  options.signal?.addEventListener('abort', abortFromParent, { once: true });

  const timeoutId = window.setTimeout(() => {
    controller.abort(new RequestFailure(t('request.timeout', { label: t(label) }), 'timeout'));
  }, timeoutMs);

  const aborted = new Promise<never>((_, reject) => {
    controller.signal.addEventListener(
      'abort',
      () => reject(abortedFailure(controller.signal, label)),
      { once: true },
    );
  });

  let streaming = false;
  const cleanup = () => {
    window.clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', abortFromParent);
  };
  try {
    const result = await Promise.race([operation(controller.signal), aborted]);
    if (result instanceof Response && result.body) {
      const reader = result.body.getReader();
      let settled = false;
      let onAbort: () => void;
      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        controller.signal.removeEventListener('abort', onAbort);
      };
      const body = new ReadableStream<Uint8Array>({
        start(stream) {
          onAbort = () => {
            if (settled) return;
            stream.error(abortedFailure(controller.signal, label));
            finish();
            void reader.cancel(controller.signal.reason).catch(() => undefined);
          };
          controller.signal.addEventListener('abort', onAbort, { once: true });
          if (controller.signal.aborted) onAbort();
        },
        async pull(stream) {
          try {
            const chunk = await reader.read();
            if (settled) return;
            if (chunk.done) { finish(); stream.close(); reader.releaseLock(); }
            else stream.enqueue(chunk.value);
          } catch (error) {
            if (!settled) { finish(); stream.error(error); }
          }
        },
        async cancel(reason) {
          finish();
          await reader.cancel(reason);
        },
      });
      streaming = true;
      return new Response(body, {
        headers: result.headers,
        status: result.status,
        statusText: result.statusText,
      }) as T;
    }
    return result;
  } catch (error) {
    if (error instanceof RequestFailure || error instanceof ApiRequestError) throw error;
    if (controller.signal.aborted) throw abortedFailure(controller.signal, label);
    if (!(error instanceof TypeError)) throw error;
    throw new RequestFailure(
      error.message || t('request.failed', { label: t(label) }),
      'network',
    );
  } finally {
    if (!streaming) cleanup();
  }
}

export async function safeFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: RequestOptions = {},
) {
  const label = options.label ?? 'common.request';
  const request = input instanceof Request ? input : undefined;
  const parentSignal = options.signal
    ?? (init.signal !== undefined ? init.signal : request?.signal)
    ?? undefined;
  const method = (init.method ?? request?.method ?? 'GET').toUpperCase();
  const retrySafe = SAFE_RETRY_METHODS.has(method)
    || (options.retry !== false && options.retry?.allowUnsafe === true);
  const maxAttempts = options.retry === false
    ? 1
    : Math.max(1, options.retry?.maxAttempts ?? getOperationPolicy('retryAttempts'));

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await withRequestTimeout(async (signal) => {
        const response = await fetch(input, {
          ...init,
          cache: init.cache ?? 'no-store',
          signal,
        });
        if (response.ok) return response;

        const { apiError, retryAfterSeconds } = await apiErrorFromResponse(response);
        if (apiError) throw apiError;
        const message = t('request.httpFailed', { status: response.status });
        throw new RequestFailure(
          retryAfterMessage(message, retryAfterSeconds),
          'http',
          response.status,
          retryAfterSeconds,
        );
      }, {
        ...options,
        retry: false,
        signal: parentSignal,
      });
    } catch (error) {
      if (attempt >= maxAttempts || !shouldRetry(error, retrySafe)) throw error;
      const delayMs = retryDelayMs(error, attempt);
      if (delayMs > getOperationPolicy('retryAfterMaxMs')) throw error;
      await waitForRetry(delayMs, parentSignal, label);
    }
  }

  throw new RequestFailure(t('request.failed', { label: t(label) }), 'unknown');
}

export function isAbortFailure(error: unknown) {
  return error instanceof RequestFailure && error.code === 'aborted';
}

export function formatRequestError(error: unknown, fallback = 'common.networkError') {
  if (error instanceof ApiRequestError) return error.message || fallback;
  if (error instanceof RequestFailure) {
    if (error.code === 'aborted') return '';
    if (error.code === 'timeout') return 'common.theNetworkResponseTimeIsTooLongPleaseReload';
    return error.message || fallback;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
