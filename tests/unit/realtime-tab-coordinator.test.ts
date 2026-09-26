import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRealtimeTabCoordinator } from '@/services/realtime-tab-coordinator';

const channels = new Set<FakeChannel>();
class FakeChannel {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  constructor(readonly name: string) { channels.add(this); }
  postMessage(data: unknown) {
    for (const peer of channels) {
      if (peer !== this && peer.name === this.name) queueMicrotask(() => {
        if (channels.has(peer)) peer.onmessage?.({ data });
      });
    }
  }
  close() { channels.delete(this); }
}
const sessions: ReturnType<typeof createRealtimeTabCoordinator>[] = [];
function tab(scope = 'account:user') {
  const callbacks = { onLeadership: vi.fn(), onEvent: vi.fn(), onResync: vi.fn() };
  const session = createRealtimeTabCoordinator(scope, callbacks);
  sessions.push(session);
  return { session, ...callbacks };
}
async function settle() { for (let i = 0; i < 10; i++) await Promise.resolve(); }
beforeEach(() => {
  const tails = new Map<string, Promise<void>>();
  vi.stubGlobal('BroadcastChannel', FakeChannel);
  vi.stubGlobal('navigator', {
    locks: {
      request(name: string, options: { signal: AbortSignal }, callback: () => Promise<void>) {
        const previous = tails.get(name) ?? Promise.resolve();
        const next = previous.then(async () => {
          if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          await callback();
        });
        tails.set(name, next.catch(() => undefined));
        return next;
      },
    },
  });
});
afterEach(() => {
  sessions.splice(0).forEach((session) => session.stop());
  channels.clear();
  vi.unstubAllGlobals();
});
it('elects one owner, forwards events, and transfers ownership on hidden/idle', async () => {
  const first = tab(); const second = tab();
  first.session.setEligible(true); second.session.setEligible(true);
  await settle();
  expect(first.onLeadership).toHaveBeenCalledWith(true);
  expect(second.onLeadership).not.toHaveBeenCalled();
  first.session.connected(); first.session.publish({ id: 'event-1' });
  await settle();
  expect(second.onResync).toHaveBeenCalledOnce();
  expect(second.onEvent).toHaveBeenCalledWith({ id: 'event-1' });
  first.session.setEligible(false);
  await settle();
  expect(first.onLeadership).toHaveBeenLastCalledWith(false);
  expect(second.onLeadership).toHaveBeenLastCalledWith(true);
});
it('synchronizes a joining follower without refreshing existing followers', async () => {
  const owner = tab(); owner.session.setEligible(true); await settle();
  owner.session.connected();
  const follower = tab(); await settle();
  expect(follower.onResync).toHaveBeenCalledOnce();
  const newcomer = tab(); await settle();
  expect(newcomer.onResync).toHaveBeenCalledOnce();
  expect(follower.onResync).toHaveBeenCalledOnce();
});
it('isolates account and role scopes and discards queued ownership after stop', async () => {
  const owner = tab(); const stopped = tab(); const other = tab('account:admin');
  owner.session.setEligible(true); stopped.session.setEligible(true); other.session.setEligible(true);
  await settle(); stopped.session.stop();
  owner.session.publish({ id: 'private' }); await settle();
  expect(other.onEvent).not.toHaveBeenCalled();
  expect(other.onLeadership).toHaveBeenCalledWith(true);
  owner.session.stop(); await settle();
  expect(stopped.onLeadership).not.toHaveBeenCalled();
});
it('can rejoin after eligibility changes while waiting for a lock', async () => {
  const owner = tab(); const follower = tab();
  owner.session.setEligible(true); follower.session.setEligible(true);
  await settle();
  follower.session.setEligible(false); follower.session.setEligible(true);
  owner.session.stop(); await settle();
  expect(follower.onLeadership).toHaveBeenCalledExactlyOnceWith(true);
});
it('falls back if browser APIs are unavailable or blocked', async () => {
  vi.stubGlobal('navigator', {});
  const missing = tab(); missing.session.setEligible(true);
  expect(missing.onLeadership).toHaveBeenCalledWith(true);
  vi.stubGlobal('navigator', { locks: { request: () => Promise.reject(new Error('blocked')) } });
  const blocked = tab(); blocked.session.setEligible(true); await settle();
  expect(blocked.onLeadership).toHaveBeenCalledWith(true);
});
