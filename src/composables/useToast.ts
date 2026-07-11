import { readonly, ref } from 'vue';

export type ToastKind = 'info' | 'loading' | 'success' | 'error';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

export interface ProgressToast {
  dismiss: () => void;
  fail: (message: string) => void;
  succeed: (message: string) => void;
  update: (message: string) => void;
}

const toasts = ref<ToastItem[]>([]);
let nextToastId = 1;
const toastTimers = new Map<number, number>();

function clearToastTimer(id: number) {
  const timer = toastTimers.get(id);
  if (timer !== undefined) window.clearTimeout(timer);
  toastTimers.delete(id);
}

export function useToast() {
  function dismissToast(id: number) {
    clearToastTimer(id);
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }

  function scheduleDismiss(id: number, duration: number) {
    clearToastTimer(id);
    toastTimers.set(id, window.setTimeout(() => dismissToast(id), duration));
  }

  function updateToast(id: number, message: string, kind: ToastKind) {
    const trimmed = message.trim();
    if (!trimmed) return;
    toasts.value = toasts.value.map((toast) => (
      toast.id === id ? { ...toast, kind, message: trimmed } : toast
    ));
    if (kind !== 'loading') scheduleDismiss(id, kind === 'error' ? 5000 : 3500);
  }

  function showToast(message: string, kind: ToastKind = 'info') {
    const trimmed = message.trim();
    if (!trimmed) return 0;

    const id = nextToastId++;
    toasts.value = [
      { id, kind, message: trimmed },
      ...toasts.value.filter((toast) => toast.message !== trimmed),
    ].slice(0, 3);

    if (kind !== 'loading') scheduleDismiss(id, kind === 'error' ? 5000 : 3500);
    return id;
  }

  function showProgressToast(message: string): ProgressToast {
    const id = showToast(message, 'loading');
    return {
      dismiss: () => dismissToast(id),
      fail: (nextMessage) => updateToast(id, nextMessage, 'error'),
      succeed: (nextMessage) => updateToast(id, nextMessage, 'success'),
      update: (nextMessage) => updateToast(id, nextMessage, 'loading'),
    };
  }

  return {
    toasts: readonly(toasts),
    showToast,
    showProgressToast,
    dismissToast,
  };
}
