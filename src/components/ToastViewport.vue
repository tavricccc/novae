<template>
  <Teleport to="body">
    <TransitionGroup
      v-if="toasts.length > 0"
      name="toast"
      tag="div"
      class="toast-viewport pointer-events-none fixed left-1/2 z-[70] flex w-[calc(100%-2rem)] max-w-[26rem] -translate-x-1/2 flex-col gap-2.5"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast-card pointer-events-auto relative flex cursor-default select-none items-center gap-3 overflow-hidden rounded-2xl border px-3.5 py-3 font-sans shadow-elevated backdrop-blur-xl"
        :class="toastClass(toast.kind)"
        role="status"
      >
        <span class="toast-icon grid h-8 w-8 shrink-0 place-items-center rounded-full" aria-hidden="true">
          <LoadingSpinner v-if="toast.kind === 'loading'" :size="5" />
          <span v-else class="material-symbols-outlined text-[19px] leading-none">{{ toastIcon(toast.kind) }}</span>
        </span>
        <p class="min-w-0 flex-1 text-sm font-semibold leading-5">
          {{ toast.message }}
        </p>
        <button
          v-if="toast.kind !== 'loading'"
          type="button"
          class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-current opacity-55 transition hover:bg-current/10 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
          aria-label="關閉通知"
          @click="dismissToast(toast.id)"
        >
          <span class="material-symbols-outlined text-[17px] leading-none" aria-hidden="true">close</span>
        </button>
        <span v-if="toast.kind === 'loading'" class="toast-progress absolute inset-x-0 bottom-0 h-0.5" aria-hidden="true" />
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<script setup lang="ts">
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue';
import { useToast, type ToastKind } from '@/composables/useToast';

const { dismissToast, toasts } = useToast();

function toastClass(kind: ToastKind) {
  if (kind === 'success') {
    return 'border-primary/25 bg-white/88 text-on-primary-container dark:bg-ink-900/88 dark:text-primary';
  }
  if (kind === 'error') {
    return 'border-error/25 bg-white/88 text-error dark:bg-ink-900/88 dark:text-error';
  }
  if (kind === 'loading') {
    return 'border-primary/30 bg-white/92 text-on-primary-container dark:bg-ink-900/92 dark:text-primary';
  }
  return 'border-secondary/25 bg-white/88 text-on-secondary-container dark:bg-ink-900/88 dark:text-secondary';
}

function toastIcon(kind: ToastKind) {
  if (kind === 'success') {
    return 'check_circle';
  }
  if (kind === 'error') {
    return 'error';
  }
  return 'info';
}
</script>

<style scoped>
.toast-card {
  box-shadow: 0 16px 42px rgb(15 23 42 / 0.16), 0 2px 10px rgb(15 23 42 / 0.08);
}

.toast-icon {
  background: color-mix(in srgb, currentColor 11%, transparent);
}

.toast-progress {
  background: linear-gradient(90deg, transparent, currentColor 40%, currentColor 60%, transparent);
  animation: toast-progress 1.35s ease-in-out infinite;
  transform: translateX(-70%);
}

@keyframes toast-progress {
  to { transform: translateX(70%); }
}

@media (prefers-reduced-motion: reduce) {
  .toast-progress { animation: none; transform: none; }
}
</style>
