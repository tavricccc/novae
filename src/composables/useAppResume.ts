import { onScopeDispose } from 'vue';
import { resetRouteRequestScope } from '@/lib/route-request';

type AppResumeReason = 'pageshow' | 'visibility';
type ResumeHandler = (reason: AppResumeReason) => void | Promise<void>;

const handlers = new Set<ResumeHandler>();
let initialized = false;
let hiddenAt = 0;
let lastResumeAt = 0;

function emitResume(reason: AppResumeReason) {
  const now = Date.now();
  if (now - lastResumeAt < 500) return;
  lastResumeAt = now;
  resetRouteRequestScope();
  handlers.forEach((handler) => void handler(reason));
}

export function initializeAppResume() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) emitResume('pageshow');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt > 0) emitResume('visibility');
    hiddenAt = 0;
  });
}

export function useAppResume(handler: ResumeHandler) {
  const unregister = registerAppResumeHandler(handler);
  onScopeDispose(unregister);
}

export function registerAppResumeHandler(handler: ResumeHandler) {
  handlers.add(handler);
  return () => handlers.delete(handler);
}
