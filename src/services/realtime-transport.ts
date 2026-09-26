import { getFirebaseIdToken } from '@/lib/auth-token';
import { apiGatewayUrl } from '@/lib/api-gateway';
import { auth } from '@/lib/firebase';
import { withRequestTimeout } from '@/lib/request';
import { backendSecurityHeaders } from '@/lib/backend-security';
import { realtimeIdleRemaining } from '@/lib/realtime-timing';
import { noteHeartbeatResponse, startHeartbeat, stopHeartbeat } from '@/services/realtime-heartbeat';
import { createRealtimeTabCoordinator } from '@/services/realtime-tab-coordinator';
import { getCachedSessionRole } from '@/services/session-role';

interface RealtimeTicketEnvelope {
  data?: {
    expiresAtMs?: number;
    ticket?: string;
    url?: string;
  };
  success?: boolean;
}

interface RealtimeMessage {
  event: string;
  id: string;
  payload: Record<string, unknown>;
  topic: string;
}

interface RealtimeListener {
  event: string;
  onError?: (error: Error) => void;
  onMessage: (payload: Record<string, unknown>) => void;
  onResync?: () => void;
  topic: string;
}

const REALTIME_PROTOCOL = 'novae.realtime.v1';
const listeners = new Map<number, RealtimeListener>();
const deliveredIds = new Set<string>();
const deliveredIdOrder: string[] = [];
let listenerSerial = 0;
let socket: WebSocket | null = null;
let connecting = false;
let reconnectAttempt = 0;
let reconnectTimer = 0;
let connectedBefore = false;
let sessionActive = false;
let activityTracking = false;
let idleSuspended = false;
let idleTimer = 0;
let lastActivityAt = 0;
let connectionGeneration = 0;
let coordinator: ReturnType<typeof createRealtimeTabCoordinator> | null = null;
let coordinatorScope = '';
let isLeader = false;

const activityEvents = ['keydown', 'pointerdown', 'scroll', 'touchstart'] as const;

function hasRealtimeInterest() {
  return sessionActive || listeners.size > 0;
}

function shouldConnect() {
  return hasRealtimeInterest() && !idleSuspended
    && document.visibilityState !== 'hidden' && navigator.onLine !== false;
}

function currentScope() {
  const uid = auth?.currentUser?.uid;
  return uid ? JSON.stringify([uid, getCachedSessionRole()]) : '';
}

function notifyResync() {
  const callbacks = new Set(Array.from(listeners.values(), (listener) => listener.onResync));
  callbacks.forEach((callback) => callback?.());
}

function deliverMessage(value: unknown) {
  if (!coordinatorScope || coordinatorScope !== currentScope()) {
    ensureRealtimeConnection();
    return;
  }
  const message = normalizeMessage(value);
  if (!message || !rememberDelivery(message.id)) return;
  listeners.forEach((listener) => {
    if (listener.topic === message.topic && listener.event === message.event) {
      listener.onMessage(message.payload);
    }
  });
}

function rememberDelivery(id: string) {
  if (!id || deliveredIds.has(id)) return false;
  deliveredIds.add(id);
  deliveredIdOrder.push(id);
  while (deliveredIdOrder.length > 500) {
    const oldest = deliveredIdOrder.shift();
    if (oldest) deliveredIds.delete(oldest);
  }
  return true;
}

function notifyError(error: Error) {
  listeners.forEach((listener) => listener.onError?.(error));
}

function scheduleReconnect() {
  if (!shouldConnect() || reconnectTimer) return;
  const delay = Math.min(30_000, 1_000 * 2 ** reconnectAttempt);
  reconnectAttempt += 1;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = 0;
    ensureRealtimeConnection();
  }, delay);
}

function closeSocket() {
  connectionGeneration += 1;
  window.clearTimeout(reconnectTimer);
  reconnectTimer = 0;
  connecting = false;
  stopHeartbeat();
  const activeSocket = socket;
  socket = null;
  if (activeSocket && activeSocket.readyState < WebSocket.CLOSING) activeSocket.close(1000, 'idle');
}

function scheduleIdleCheck() {
  window.clearTimeout(idleTimer);
  idleTimer = 0;
  if (!hasRealtimeInterest()) return;
  const remaining = realtimeIdleRemaining(lastActivityAt);
  if (remaining === 0) {
    idleSuspended = true;
    ensureRealtimeConnection();
    return;
  }
  idleTimer = window.setTimeout(scheduleIdleCheck, remaining);
}

function recordRealtimeActivity() {
  if (document.visibilityState === 'hidden') return;
  lastActivityAt = Date.now();
  if (idleSuspended) {
    idleSuspended = false;
    ensureRealtimeConnection();
  }
  if (!idleTimer) scheduleIdleCheck();
}

function handleVisibilityChange() {
  if (document.visibilityState !== 'visible') {
    ensureRealtimeConnection();
    return;
  }
  if (realtimeIdleRemaining(lastActivityAt) === 0) {
    idleSuspended = true;
    closeSocket();
  }
  recordRealtimeActivity();
  ensureRealtimeConnection();
}

function handlePageHide() {
  coordinator?.setEligible(false);
  closeSocket();
}

function startActivityTracking() {
  if (activityTracking) return;
  activityTracking = true;
  idleSuspended = false;
  lastActivityAt = Date.now();
  activityEvents.forEach((event) =>
    window.addEventListener(event, recordRealtimeActivity, { passive: true }),
  );
  window.addEventListener('focus', recordRealtimeActivity);
  window.addEventListener('online', ensureRealtimeConnection);
  window.addEventListener('offline', ensureRealtimeConnection);
  window.addEventListener('pagehide', handlePageHide);
  window.addEventListener('pageshow', handleVisibilityChange);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  scheduleIdleCheck();
}

function stopActivityTracking() {
  if (!activityTracking || hasRealtimeInterest()) return;
  activityTracking = false;
  idleSuspended = false;
  lastActivityAt = 0;
  window.clearTimeout(idleTimer);
  idleTimer = 0;
  activityEvents.forEach((event) =>
    window.removeEventListener(event, recordRealtimeActivity),
  );
  window.removeEventListener('focus', recordRealtimeActivity);
  window.removeEventListener('online', ensureRealtimeConnection);
  window.removeEventListener('offline', ensureRealtimeConnection);
  window.removeEventListener('pagehide', handlePageHide);
  window.removeEventListener('pageshow', handleVisibilityChange);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
}

function normalizeMessage(value: unknown): RealtimeMessage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.event !== 'string'
    || typeof record.id !== 'string'
    || typeof record.topic !== 'string'
    || !record.payload
    || typeof record.payload !== 'object'
    || Array.isArray(record.payload)
  ) return null;
  return {
    event: record.event,
    id: record.id,
    payload: record.payload as Record<string, unknown>,
    topic: record.topic,
  };
}

async function requestRealtimeTicket(uid: string) {
  const token = await getFirebaseIdToken();
  if (!token || auth?.currentUser?.uid !== uid) throw new Error('unauthenticated');
  return withRequestTimeout(async (signal) => {
    const response = await fetch(apiGatewayUrl('/v1/realtime/ticket'), {
      method: 'POST',
      headers: {
        ...(await backendSecurityHeaders(token)),
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal,
    });
    const envelope = await response.json().catch(() => null) as RealtimeTicketEnvelope | null;
    const ticket = envelope?.data?.ticket;
    const url = envelope?.data?.url;
    if (!response.ok || envelope?.success !== true || !ticket || !url) {
      throw new Error('notification-realtime-unavailable');
    }
    return { ticket, url };
  }, { label: 'notification.realtimeConnection' });
}

async function connectRealtime() {
  const uid = auth?.currentUser?.uid;
  if (!uid || !isLeader || !shouldConnect() || socket || connecting) return;
  const generation = connectionGeneration;
  connecting = true;
  try {
    const { ticket, url } = await requestRealtimeTicket(uid);
    if (generation !== connectionGeneration || currentScope() !== coordinatorScope
      || auth?.currentUser?.uid !== uid || !isLeader || !shouldConnect()) return;
    const nextSocket = new WebSocket(url, [REALTIME_PROTOCOL, ticket]);
    socket = nextSocket;
    nextSocket.onopen = () => {
      if (socket !== nextSocket) return;
      reconnectAttempt = 0;
      if (connectedBefore) notifyResync();
      connectedBefore = true;
      coordinator?.connected();
      startHeartbeat(nextSocket, () => socket === nextSocket);
    };
    nextSocket.onmessage = (event) => {
      if (socket !== nextSocket || currentScope() !== coordinatorScope) {
        ensureRealtimeConnection();
        return;
      }
      if (typeof event.data !== 'string') return;
      if (event.data === 'pong') {
        noteHeartbeatResponse();
        return;
      }
      let message: RealtimeMessage | null = null;
      try {
        message = normalizeMessage(JSON.parse(event.data) as unknown);
      } catch {
        return;
      }
      if (!message) return;
      coordinator?.publish(message);
      deliverMessage(message);
    };
    nextSocket.onerror = () => {
      if (socket === nextSocket) notifyError(new Error('notification-realtime-unavailable'));
    };
    nextSocket.onclose = () => {
      if (socket !== nextSocket) return;
      socket = null;
      stopHeartbeat();
      if (shouldConnect()) {
        notifyError(new Error('notification-realtime-unavailable'));
        scheduleReconnect();
      }
    };
  } catch (error) {
    if (generation !== connectionGeneration) return;
    notifyError(error instanceof Error ? error : new Error('notification-realtime-unavailable'));
    scheduleReconnect();
  } finally {
    if (generation === connectionGeneration) connecting = false;
  }
}

export function ensureRealtimeConnection() {
  const scope = currentScope();
  if (coordinatorScope !== scope || !hasRealtimeInterest()) {
    coordinator?.stop();
    coordinator = null;
    closeSocket();
    coordinatorScope = scope;
    connectedBefore = false;
    deliveredIds.clear();
    deliveredIdOrder.length = 0;
  }
  if (!scope || !hasRealtimeInterest()) return;
  if (!coordinator) {
    coordinator = createRealtimeTabCoordinator(scope, {
      onLeadership(leader) {
        isLeader = leader;
        if (leader) void connectRealtime();
        else closeSocket();
      },
      onEvent: deliverMessage,
      onResync() {
        if (scope !== currentScope()) { ensureRealtimeConnection(); return; }
        connectedBefore = true;
        notifyResync();
      },
    });
  }
  coordinator.setEligible(shouldConnect());
  if (isLeader) void connectRealtime();
}

export function startRealtimeSession() {
  sessionActive = true;
  startActivityTracking();
  ensureRealtimeConnection();
}

export function stopRealtimeSession() {
  sessionActive = false;
  ensureRealtimeConnection();
  stopActivityTracking();
}

export function subscribeRealtimeTopic(
  topic: string,
  event: string,
  onMessage: (payload: Record<string, unknown>) => void,
  options: Pick<RealtimeListener, 'onError' | 'onResync'> = {},
) {
  const id = listenerSerial += 1;
  listeners.set(id, { event, onMessage, topic, ...options });
  startActivityTracking();
  ensureRealtimeConnection();
  return () => {
    listeners.delete(id);
    ensureRealtimeConnection();
    stopActivityTracking();
  };
}
