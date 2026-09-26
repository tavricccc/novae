import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Env } from '../../cloudflare/src/types.ts';

const env = { NOTION_TOKEN: 'token' } as Env;
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers();
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), milliseconds);
    return controller.signal;
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function api() {
  const { withRuntimeEnvironment } = await import('../../cloudflare/src/backend/shared/env.ts');
  const notion = await import('../../cloudflare/src/backend/shared/notion-api.ts');
  return {
    ...notion,
    call: () => withRuntimeEnvironment(env, () => notion.callNotionAPI('/pages', 'GET')),
  };
}

it('gives a retry its full network deadline after a long Retry-After', async () => {
  const signals: AbortSignal[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    signals.push(init.signal as AbortSignal);
    expect(init.signal?.aborted).toBe(false);
    return signals.length === 1
      ? new Response('{}', { status: 429, headers: { 'Retry-After': '20' } })
      : Response.json({ success: true });
  }));
  const notion = await api();
  const request = notion.call();
  await vi.advanceTimersByTimeAsync(20_000);
  await expect(request).resolves.toEqual({ success: true });
  expect(signals).toHaveLength(2);
  expect(signals[0].aborted).toBe(true);
  expect(signals[1].aborted).toBe(false);
  expect(notion.notionRequestsMade()).toBe(2);
});

it('starts deadlines after the pacing queue and keeps the 350ms spacing', async () => {
  const started: number[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    expect(init.signal?.aborted).toBe(false);
    started.push(Date.now());
    return Response.json({});
  }));
  const notion = await api();
  const requests = Promise.all(Array.from({ length: 46 }, () => notion.call()));
  await vi.advanceTimersByTimeAsync(16_000);
  await requests;
  expect(started).toHaveLength(46);
  for (let index = 1; index < started.length; index++) {
    expect(started[index] - started[index - 1]).toBe(350);
  }
});

it('keeps the refusal retry ceiling and invocation budget', async () => {
  const fetch = vi.fn(async () => new Response('{"code":"rate_limited"}', { status: 429 }));
  vi.stubGlobal('fetch', fetch);
  const notion = await api();
  const rejected = expect(notion.call()).rejects.toThrow('429');
  await vi.runAllTimersAsync(); await rejected;
  expect(fetch).toHaveBeenCalledTimes(6);
  notion.beginNotionInvocation(1);
  const exhausted = expect(notion.call()).rejects.toThrow('notion-invocation-request-budget-exhausted');
  await vi.runAllTimersAsync(); await exhausted;
  expect(fetch).toHaveBeenCalledTimes(7);
  expect(notion.notionRequestsMade()).toBe(1);
});
