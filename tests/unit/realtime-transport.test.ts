import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ user: { uid: 'a' } as { uid: string } | null, role: 'user' }));
vi.mock('@/lib/firebase', () => ({ auth: { get currentUser() { return state.user; } } }));
vi.mock('@/lib/auth-token', () => ({ getFirebaseIdToken: async () => 'private-token' }));
vi.mock('@/lib/backend-security', () => ({ backendSecurityHeaders: async () => ({}) }));
vi.mock('@/lib/api-gateway', () => ({ apiGatewayUrl: (url: string) => url }));
vi.mock('@/lib/request', () => ({ withRequestTimeout: (work: (signal: AbortSignal) => unknown) => work(new AbortController().signal) }));
vi.mock('@/services/session-role', () => ({ getCachedSessionRole: () => state.role }));
vi.mock('@/services/realtime-heartbeat', () => ({ startHeartbeat: vi.fn(), stopHeartbeat: vi.fn(), noteHeartbeatResponse: vi.fn() }));

class FakeSocket {
  static CLOSING = 2;
  static instances: FakeSocket[] = [];
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { FakeSocket.instances.push(this); }
  close() { this.readyState = 3; this.onclose?.(); }
}
const ticketResponse = () => ({ ok: true, json: async () => ({ success: true, data: { ticket: 'secret-ticket', url: 'wss://example.test' } }) });
let cleanup: (() => void) | undefined;
async function settle() { for (let i = 0; i < 15; i++) await Promise.resolve(); }
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers();
  state.user = { uid: 'a' }; state.role = 'user';
  FakeSocket.instances.length = 0;
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('BroadcastChannel', undefined);
  vi.stubGlobal('fetch', vi.fn(async () => ticketResponse()));
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => {
  cleanup?.(); cleanup = undefined;
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
it('invalidates pending ticket requests across session restarts', async () => {
  const pending: Array<(value: ReturnType<typeof ticketResponse>) => void> = [];
  vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => pending.push(resolve))));
  const transport = await import('@/services/realtime-transport');
  transport.startRealtimeSession(); await settle();
  transport.stopRealtimeSession(); transport.startRealtimeSession();
  cleanup = transport.stopRealtimeSession;
  await settle(); expect(pending).toHaveLength(2);
  pending[0](ticketResponse()); await settle();
  expect(FakeSocket.instances).toHaveLength(0);
  pending[1](ticketResponse()); await settle();
  expect(FakeSocket.instances).toHaveLength(1);
});
it('deduplicates messages and resynchronizes after a hidden tab resumes', async () => {
  const transport = await import('@/services/realtime-transport');
  const onMessage = vi.fn(); const onResync = vi.fn();
  cleanup = transport.subscribeRealtimeTopic('school', 'changed', onMessage, { onResync });
  await settle(); const socket = FakeSocket.instances[0]; socket.onopen?.();
  const data = JSON.stringify({ id: 'one', topic: 'school', event: 'changed', payload: { count: 2 } });
  socket.onmessage?.({ data }); socket.onmessage?.({ data });
  expect(onMessage).toHaveBeenCalledOnce();
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  document.dispatchEvent(new Event('visibilitychange'));
  expect(socket.readyState).toBe(3);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  document.dispatchEvent(new Event('visibilitychange')); await settle();
  FakeSocket.instances[1].onopen?.();
  expect(onResync).toHaveBeenCalledOnce();
});
it('rejects events from the previous role and stops on logout', async () => {
  const transport = await import('@/services/realtime-transport');
  const onMessage = vi.fn();
  cleanup = transport.subscribeRealtimeTopic('school', 'changed', onMessage);
  await settle(); const socket = FakeSocket.instances[0];
  state.role = 'admin';
  socket.onmessage?.({ data: JSON.stringify({ id: 'one', topic: 'school', event: 'changed', payload: {} }) });
  await settle();
  expect(onMessage).not.toHaveBeenCalled(); expect(socket.readyState).toBe(3);
  expect(FakeSocket.instances).toHaveLength(2);
  state.user = null; transport.stopRealtimeSession();
  expect(FakeSocket.instances[1].readyState).toBe(3);
});
