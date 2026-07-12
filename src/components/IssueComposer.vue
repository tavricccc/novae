<template>
  <DialogOverlay :open="open" @close="handleClose">
    <section
      id="issue-composer"
      ref="dialogRef"
      class="panel panel-pad flex h-full w-full flex-col overflow-hidden rounded-none border-none md:fixed md:inset-0 md:h-screen md:max-h-screen md:rounded-none md:border-none"
      data-dialog-root
      tabindex="-1"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-ink-200 dark:border-ink-800 pb-4 shrink-0">
        <div class="min-w-0">
          <span class="text-xs font-semibold tracking-wide text-ink-500 dark:text-ink-400">發起新提案</span>
          <h2 class="mt-1 text-xl font-bold tracking-tight text-ink-950 dark:text-ink-50">發布分類至「{{ categoryLabel }}」</h2>
        </div>
        <button
          type="button"
          class="button-icon-filled shrink-0"
          :disabled="submitting || uploading"
          title="關閉"
          aria-label="關閉"
          @click="handleClose"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Unified Form Layout (Responsive Single Column) -->
      <form class="flex-1 flex flex-col min-h-0 mt-5 space-y-5 overflow-y-auto md:overflow-hidden pr-1" autocomplete="off" @submit.prevent="submit">
        <!-- Title Field -->
        <div class="space-y-1.5 shrink-0">
          <label for="issue-title" class="field-label">提案標題</label>
          <input
            id="issue-title"
            v-model="form.title"
            autocomplete="off"
            class="field text-base py-3"
            maxlength="120"
            placeholder="為您的提案取個明確的標題..."
            data-autofocus
            :disabled="submitting"
          />
          <div class="flex justify-between items-center text-xs text-ink-500 dark:text-ink-400">
            <span>必填</span>
            <span class="font-medium" :class="{ 'text-error': form.title.length > 110 }">
              {{ titleCount }} / 120
            </span>
          </div>
        </div>

        <MarkdownImageEditor
          v-model:content="form.content"
          v-model:show-preview="showPreview"
          class="flex min-h-[220px] flex-1 flex-col min-h-0"
          textarea-id="issue-content"
          label="詳細說明"
          placeholder="在此輸入詳細說明..."
          :images="editorImages"
          :max-images="RATE_LIMITS.imageUploads.issueMaxImages"
          max-images-label="提案"
          :max-length="5000"
          :warning-length="4800"
          :preview-content="form.content"
          :uploading="uploading"
          :disabled="submitting"
          :busy-label="submitting ? '圖片上傳中...' : '圖片壓縮中...'"
          editor-class="flex-1 min-h-[180px]"
          textarea-class="h-full min-h-[180px]"
          preview-class="flex-1 min-h-[180px]"
          :split="true"
          @image-picked="handleImagePicked"
          @remove-image="removeEditorImage"
        />

        <!-- Error message display -->
        <p v-if="error || uploadError" class="mt-2 shrink-0 text-xs font-semibold text-error">
          錯誤：{{ error || uploadError }}
        </p>

        <!-- Footer Actions -->
        <div class="border-t border-ink-100 dark:border-ink-800 pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between shrink-0 gap-4">
          <p class="text-xs text-ink-500 dark:text-ink-400 font-medium hidden sm:block">
            建議提出精確的提案。
          </p>
          <div class="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              class="button-secondary flex-1 px-5 text-sm font-medium sm:flex-none"
              :disabled="submitting || uploading"
              @click="handleClose"
            >
              取消
            </button>
            <button type="submit" class="button-primary flex-1 px-5 text-sm font-semibold sm:flex-none" :disabled="submitting || uploading">
              確認發布
            </button>
          </div>
        </div>
      </form>
    </section>
  </DialogOverlay>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue';
import { useBodyScrollLock } from '@/composables/useBodyScrollLock';
import { useDialogFocus } from '@/composables/useDialogFocus';
import { useIssueComposerForm } from '@/composables/useIssueComposerForm';
import DialogOverlay from '@/components/ui/DialogOverlay.vue';
import MarkdownImageEditor from '@/components/ui/MarkdownImageEditor.vue';
import type { IssueRecord, WritableIssueCategory } from '@/types';
import { RATE_LIMITS } from '@/generated/rate-limits';

const props = defineProps<{
  open: boolean;
  category: WritableIssueCategory;
  categoryLabel: string;
}>();

useBodyScrollLock(toRef(props, 'open'));

const emit = defineEmits<{
  close: [];
  submitted: [issue: IssueRecord];
}>();

const {
  form,
  handleImagePicked,
  contentWithImages,
  imageUrls,
  removeImage,
  uploadError,
  uploading,
  submitting,
  showPreview,
  error,
  titleCount,
  handleClose,
  submit,
} = useIssueComposerForm(toRef(props, 'open'), {
  category: toRef(props, 'category'),
  onClose: () => emit('close'),
  onSubmitted: (issue) => emit('submitted', issue),
});

const { dialogRef } = useDialogFocus(toRef(props, 'open'), {
  onClose: handleClose,
});

const editorImages = computed(() =>
  imageUrls.value.map((src, index) => ({
    alt: '提案附加圖片預覽',
    key: `${src}:${index}`,
    src,
  })),
);

function removeEditorImage(key: string) {
  const index = editorImages.value.findIndex((image) => image.key === key);
  if (index >= 0) {
    void removeImage(index);
  }
}
</script>
