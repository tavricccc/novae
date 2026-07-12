<template>
  <Teleport to="body">
    <TransitionGroup
      v-if="toasts.length > 0"
      name="toast"
      tag="div"
      class="toast-viewport pointer-events-none fixed left-3 right-3 z-[70] flex flex-col items-end gap-2 sm:left-auto sm:right-5 sm:w-auto sm:max-w-[min(24rem,calc(100vw-2.5rem))]"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast-card pointer-events-auto relative flex w-fit min-w-[11rem] max-w-full cursor-default select-none items-center gap-2.5 overflow-hidden rounded-xl border px-3 py-2.5 font-sans shadow-elevated backdrop-blur-xl sm:min-w-[12rem]"
        :class="toastClass(toast.kind)"
        role="status"
      >
        <span class="toast-icon grid h-7 w-7 shrink-0 place-items-center rounded-full" aria-hidden="true">
          <LoadingSpinner v-if="toast.kind === 'loading'" :size="4" />
          <span v-else class="material-symbols-outlined text-[17px] leading-none">{{ toastIcon(toast.kind) }}</span>
        </span>
        <p class="min-w-0 max-w-[18rem] flex-1 text-[13px] font-semibold leading-[1.35rem]">
          {{ toast.message }}
        </p>
        <button
          v-if="toast.kind !== 'loading'"
          type="button"
          class="grid h-6 w-6 shrink-0 place-items-center rounded-full text-current opacity-50 transition hover:bg-current/10 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1"
          aria-label="關閉通知"
          @click="dismissToast(toast.id)"
        >
          <span class="material-symbols-outlined text-[15px] leading-none" aria-hidden="true">close</span>
        </button>
        <span v-if="toast.kind === 'loading'" class="toast-progress absolute bottom-0 left-0 h-0.5" aria-hidden="true" />
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
  box-shadow: 0 12px 30px rgb(15 23 42 / 0.14), 0 2px 8px rgb(15 23 42 / 0.07);
}

.toast-icon {
  background: color-mix(in srgb, currentColor 11%, transparent);
}

.toast-progress {
  width: 42%;
  background: linear-gradient(90deg, transparent, currentColor 40%, currentColor 60%, transparent);
  animation: toast-progress 1.6s linear infinite;
  transform: translateX(-110%);
  will-change: transform;
}

@keyframes toast-progress {
  to { transform: translateX(350%); }
}

@media (prefers-reduced-motion: reduce) {
  .toast-progress { animation: none; transform: none; }
}
</style>
