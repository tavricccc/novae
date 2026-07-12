<template>
  <DialogOverlay :open="open" padded z-index-class="z-[100]" @close="handleCancel">
    <section
      ref="dialogRef"
      class="panel panel-pad w-full max-w-lg"
      data-dialog-root
      role="dialog"
      aria-modal="true"
      :aria-busy="busy ? 'true' : undefined"
      :aria-labelledby="title || eyebrow ? 'confirm-dialog-title' : undefined"
      aria-describedby="confirm-dialog-message"
      tabindex="-1"
    >
      <div v-if="title || eyebrow" class="min-w-0">
        <p v-if="eyebrow && !title" id="confirm-dialog-title" class="dialog-title !mt-0">{{ eyebrow }}</p>
        <p v-else-if="eyebrow" class="dialog-eyebrow">{{ eyebrow }}</p>
        <h3 v-if="title" id="confirm-dialog-title" class="dialog-title">{{ title }}</h3>
      </div>

      <p
        id="confirm-dialog-message"
        class="dialog-description"
        :class="title || eyebrow ? '' : '!mt-0'"
      >
        {{ message }}
      </p>

      <div class="dialog-actions">
        <button
          type="button"
          class="button-secondary"
          :disabled="busy"
          data-autofocus
          @click="handleCancel"
        >
          {{ cancelLabel }}
        </button>
        <button
          type="button"
          class="button-secondary border-error/30 text-error hover:text-error"
          :disabled="busy"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </section>
  </DialogOverlay>
</template>

<script setup lang="ts">
import { toRef } from 'vue';
import DialogOverlay from '@/components/ui/DialogOverlay.vue';
import { useBodyScrollLock } from '@/composables/useBodyScrollLock';
import { useDialogFocus } from '@/composables/useDialogFocus';

const props = withDefaults(defineProps<{
  open: boolean;
  title?: string;
  message: string;
  eyebrow?: string;
  cancelLabel?: string;
  confirmLabel?: string;
  busy?: boolean;
}>(), {
  title: '',
  eyebrow: '',
  cancelLabel: '取消',
  confirmLabel: '確認',
  busy: false,
});

useBodyScrollLock(toRef(props, 'open'));

const emit = defineEmits<{
  cancel: [];
  confirm: [];
}>();

const { dialogRef } = useDialogFocus(toRef(props, 'open'), {
  onClose: handleCancel,
});

function handleCancel() {
  if (!props.busy) {
    emit('cancel');
  }
}
</script>
