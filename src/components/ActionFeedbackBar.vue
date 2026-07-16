<template>
  <Teleport to="body">
    <Transition name="action-feedback">
      <div
        v-if="feedback"
        class="action-feedback-viewport pointer-events-none fixed z-[9999] flex justify-center md:justify-end"
        aria-live="polite"
        aria-atomic="true"
      >
        <div
          class="action-feedback-card pointer-events-auto flex min-h-14 w-full items-center gap-3 rounded-[1.125rem] bg-surface/96 px-3.5 py-3 text-ink-800 shadow-floating backdrop-blur-xl dark:bg-surface/96 dark:text-ink-100"
          :class="toneClass"
          role="status"
        >
          <span class="action-feedback-icon grid h-8 w-8 shrink-0 place-items-center rounded-full" aria-hidden="true">
            <LoadingSpinner v-if="feedback.tone === 'progress'" :size="4" />
            <AppIcon v-else :name="toneIcon" :size="4" :stroke-width="2" />
          </span>
          <p class="min-w-0 flex-1 text-sm font-semibold leading-5 tracking-[0.01em]">
            {{ feedback.message }}
          </p>
          <button
            v-if="feedback.action"
            type="button"
            class="button-toolbar shrink-0 px-3 text-current"
            @click="handleAction"
          >
            {{ feedback.action.label }}
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AppIcon, { type AppIconName } from '@/components/ui/AppIcon.vue';
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue';
import { useActionFeedback } from '@/composables/useActionFeedback';

const { dismiss, feedback } = useActionFeedback();

const toneClass = computed(() => {
  if (!feedback.value) return '';
  return {
    error: 'text-error',
    info: 'text-info',
    progress: 'text-processing',
    success: 'text-success',
    warning: 'text-warning',
  }[feedback.value.tone];
});

const toneIcon = computed<AppIconName>(() => {
  if (feedback.value?.tone === 'success') return 'check-circle';
  if (feedback.value?.tone === 'error' || feedback.value?.tone === 'warning') return 'circle-alert';
  return 'info';
});

function handleAction() {
  const action = feedback.value?.action;
  if (!action) return;
  dismiss(feedback.value?.id);
  action.run();
}
</script>

<style scoped>
.action-feedback-icon {
  background: color-mix(in srgb, currentColor 13%, transparent);
}
</style>
