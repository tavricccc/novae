<template>
  <DialogOverlay :open="open" @close="close">
    <section ref="dialogRef" class="entry-composer panel panel-pad flex h-full w-full flex-col overflow-hidden rounded-none border-none md:fixed md:inset-0 md:h-screen" data-dialog-root tabindex="-1">
      <div class="flex items-center justify-between border-b border-ink-200 pb-4 dark:border-ink-800">
        <div><p class="text-xs font-semibold text-ink-500">新增</p><h2 class="mt-1 text-xl font-semibold">設備</h2></div>
        <button class="button-dialog-close" aria-label="關閉" :disabled="submitting" @click="close"><AppIcon name="close" :size="5" /></button>
      </div>
      <form class="entry-composer__scroll mt-5 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto" @submit.prevent="submit">
        <label class="space-y-1.5"><span class="field-label">問題標題</span><input v-model="form.title" class="field" maxlength="30" placeholder="簡短描述設備問題" /></label>
        <label class="space-y-1.5"><span class="field-label">地點</span><input v-model="form.location" class="field" maxlength="120" placeholder="例如：教學大樓 3 樓 301 教室" /></label>
        <MarkdownImageEditor
          v-model:content="form.content" v-model:show-preview="showPreview" class="flex min-h-[260px] flex-1 flex-col"
          textarea-id="facility-content" label="詳細說明" placeholder="描述目前情況..."
          :images="editorImages" :max-images="RATE_LIMITS.imageUploads.facilityMaxImages" max-images-label="設備"
          :max-length="INPUT_LIMITS.content" :warning-length="900" :preview-content="form.content"
          :uploading="images.uploading.value" :disabled="submitting" :split="true"
          @image-picked="images.handleImagePicked" @remove-image="removeImage"
        />
        <p v-if="error || images.uploadError.value" class="text-xs font-semibold text-error">{{ error || images.uploadError.value }}</p>
        <div class="entry-composer__footer">
          <p class="entry-composer__hint">請確認問題地點與說明後再送出。</p>
          <div class="entry-composer__actions">
            <button type="button" class="entry-composer__action button-secondary" @click="close">取消</button>
            <button type="submit" class="entry-composer__action button-secondary" :disabled="submitting || images.uploading.value"><BusyButtonContent :busy="submitting" label="確認送出" busy-label="送出中" /></button>
          </div>
        </div>
      </form>
    </section>
  </DialogOverlay>
</template>

<script setup lang="ts">
import { toRef } from 'vue';
import DialogOverlay from '@/components/ui/DialogOverlay.vue';
import MarkdownImageEditor from '@/components/ui/MarkdownImageEditor.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import BusyButtonContent from '@/components/ui/BusyButtonContent.vue';
import { useDialogFocus } from '@/composables/useDialogFocus';
import { useBodyScrollLock } from '@/composables/useBodyScrollLock';
import { useFacilityComposerForm } from '@/composables/useFacilityComposerForm';
import { RATE_LIMITS } from '@/generated/rate-limits';
import { INPUT_LIMITS } from '@/constants/input-limits';
import type { FacilityRecord } from '@/types';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; submitted: [facility: FacilityRecord] }>();
useBodyScrollLock(toRef(props, 'open'));
const { editorImages, error, form, images, showPreview, submitting, close, submit } = useFacilityComposerForm(
  toRef(props, 'open'), () => emit('close'), (facility) => emit('submitted', facility),
);
const { dialogRef } = useDialogFocus(toRef(props, 'open'), { onClose: close });
function removeImage(key: string) { const index = editorImages.value.findIndex((image) => image.key === key); if (index >= 0) void images.removeImage(index); }
</script>
