<template>
  <DialogOverlay :open="open" padded>
    <section
      ref="dialogRef"
      class="panel panel-pad dialog-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-update-title"
      data-dialog-root
      tabindex="-1"
    >
      <div class="flex items-start gap-4">
        <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-container text-primary dark:bg-primary-container/40" aria-hidden="true">
          <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M20 12a8 8 0 1 1-2.34-5.66M20 4v6h-6" />
          </svg>
        </div>
        <div class="min-w-0 flex-1">
          <p class="dialog-eyebrow">應用程式更新</p>
          <h2 id="app-update-title" class="dialog-title">有新版本可用</h2>
          <p class="dialog-description">目前版本已停止使用，請重新載入以取得最新內容並繼續操作。</p>
        </div>
      </div>
      <div class="dialog-actions">
        <button type="button" class="button-primary" :disabled="busy" data-autofocus @click="emit('reload')">
          <LoadingSpinner v-if="busy" :size="4" />
          <span>{{ busy ? '重新載入中' : '重新載入' }}</span>
        </button>
      </div>
    </section>
  </DialogOverlay>
</template>

<script setup lang="ts">
import { toRef } from 'vue';
import DialogOverlay from '@/components/ui/DialogOverlay.vue';
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue';
import { useBodyScrollLock } from '@/composables/useBodyScrollLock';
import { useDialogFocus } from '@/composables/useDialogFocus';

const props = defineProps<{
  busy?: boolean;
  open: boolean;
}>();

const emit = defineEmits<{
  reload: [];
}>();

useBodyScrollLock(toRef(props, 'open'));
const { dialogRef } = useDialogFocus(toRef(props, 'open'), {
  onClose: () => undefined,
});
</script>
