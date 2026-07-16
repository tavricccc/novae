<template>
  <DialogOverlay :open="open" @close="handleClose">
    <section
      ref="dialogRef"
      class="entry-composer panel panel-pad flex h-full w-full flex-col overflow-hidden rounded-none border-none md:fixed md:inset-0 md:h-screen md:max-h-screen md:rounded-none md:border-none"
      data-dialog-root
      tabindex="-1"
    >
      <!-- Composer header -->
      <div class="flex items-center justify-between border-b border-ink-200 dark:border-ink-800 pb-4 shrink-0">
        <div class="min-w-0">
          <span class="text-xs font-semibold tracking-wide text-ink-500 dark:text-ink-400">發布新的校內公告</span>
          <h2 class="mt-1 text-xl font-semibold tracking-[0.015em] text-ink-950 dark:text-ink-50">公告內容</h2>
        </div>
        <button
          type="button"
          class="button-dialog-close shrink-0"
          :disabled="submitting || uploading"
          title="關閉"
          aria-label="關閉"
          @click="handleClose"
        >
          <AppIcon name="close" :size="5" :stroke-width="2.5" />
        </button>
      </div>

      <!-- Unified Form Layout (Responsive Single Column) -->
      <form class="entry-composer__scroll flex-1 flex flex-col min-h-0 mt-5 space-y-5 overflow-y-auto md:overflow-hidden" autocomplete="off" @submit.prevent="submit">
        <!-- Title Field -->
        <div class="space-y-1.5 shrink-0">
          <label for="announcement-title" class="field-label">公告標題</label>
          <input
            id="announcement-title"
            v-model="title"
            autocomplete="off"
            class="field text-base py-3"
            :maxlength="INPUT_LIMITS.title"
            placeholder="請輸入公告標題..."
            data-autofocus
            :disabled="submitting"
            required
          />
          <div class="flex justify-between items-center text-xs text-ink-500 dark:text-ink-400">
            <span>必填</span>
            <span class="font-medium" :class="{ 'text-error': title.length > 27 }">
              {{ titleCount }} / {{ INPUT_LIMITS.title }}
            </span>
          </div>
        </div>

        <MarkdownImageEditor
          v-model:content="content"
          v-model:show-preview="showPreview"
          class="flex min-h-[220px] flex-1 flex-col min-h-0"
          textarea-id="announcement-content"
          label="內容說明"
          placeholder="在此輸入公告詳細內容..."
          :images="editorImages"
          :max-images="maxImages"
          max-images-label="公告"
          :max-length="INPUT_LIMITS.content"
          :warning-length="900"
          :preview-content="content"
          :uploading="uploading"
          :disabled="submitting"
          :busy-label="submitting ? '圖片上傳中...' : '圖片壓縮中...'"
          editor-class="flex-1 min-h-[180px]"
          textarea-class="h-full min-h-[180px]"
          preview-class="flex-1 min-h-[180px]"
          :split="true"
          @image-picked="handleEditorImagePicked"
          @remove-image="removeEditorImage"
        />

        <!-- Error display -->
        <p v-if="error || uploadError" class="mt-2 shrink-0 text-xs font-semibold text-error">
          錯誤：{{ error || uploadError }}
        </p>

        <!-- Footer Actions -->
        <div class="entry-composer__footer">
          <p class="entry-composer__hint">
            公告將即時發布予所有使用者。
          </p>
          <div class="entry-composer__actions">
            <button
              type="button"
              class="entry-composer__action button-secondary"
              :disabled="submitting || uploading"
              @click="handleClose"
            >
              取消
            </button>
            <button
              type="submit"
              class="entry-composer__action button-secondary"
              :disabled="submitting || uploading || !title.trim() || (!content.trim() && editorImages.length === 0)"
              :aria-busy="submitting || undefined"
            >
              <BusyButtonContent :busy="submitting" label="發布公告" busy-label="發布中" />
            </button>
          </div>
        </div>
      </form>
    </section>
  </DialogOverlay>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import DialogOverlay from '@/components/ui/DialogOverlay.vue';
import MarkdownImageEditor from '@/components/ui/MarkdownImageEditor.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import BusyButtonContent from '@/components/ui/BusyButtonContent.vue';
import { useBodyScrollLock } from '@/composables/useBodyScrollLock';
import { useDialogFocus } from '@/composables/useDialogFocus';
import { useMarkdownImageUpload } from '@/composables/useMarkdownImageUpload';
import type { UploadedImage } from '@/composables/useImageUpload';
import { RATE_LIMITS } from '@/generated/rate-limits';
import { INPUT_LIMITS } from '@/constants/input-limits';

const props = defineProps<{
  error: string;
  open: boolean;
  submitting: boolean;
}>();

const emit = defineEmits<{
  close: [];
  save: [payload: { title: string; content: string; uploadedImages: UploadedImage[] }];
}>();

const title = ref('');
const content = ref('');
const maxImages = RATE_LIMITS.imageUploads.announcementMaxImages;
const isOpen = computed(() => props.open);
const {
  handleImagePicked,
  imageUrls,
  removeImage,
  resetImages,
  uploadError,
  uploadImagesAndBuildContent,
  uploading,
} = useMarkdownImageUpload(content, {
  getRemainingSlots: () => maxImages - editorImages.value.length,
  maxImages,
});
const showPreview = ref(false);
const titleCount = computed(() => title.value.length);

const editorImages = computed(() => [
  ...imageUrls.value.map((src, index) => ({
    alt: '公告附加圖片預覽',
    index,
    key: `new:${src}:${index}`,
    src,
    type: 'new' as const,
  })),
]);
const contentWithEditorImages = computed(() => {
  const text = content.value.trimEnd();
  const images = editorImages.value
    .map((image) => buildDisplayMarkdownImage(image))
    .join('\n');

  if (!images) {
    return text;
  }

  return text ? `${text}\n\n${images}` : images;
});

useBodyScrollLock(isOpen);
const { dialogRef } = useDialogFocus(isOpen, { onClose: handleClose });

watch(
  () => props.open,
  (open) => {
    if (!open) {
      resetImages();
      return;
    }
    title.value = '';
    content.value = '';
    resetImages();
    showPreview.value = false;
  },
  { immediate: true },
);

function buildMarkdownImage(image: { url: string; width?: number; height?: number }) {
  const size = image.width && image.height ? `|${image.width}x${image.height}` : '';
  return `![image${size}](${image.url})`;
}

function buildDisplayMarkdownImage(image: { src: string; width?: number; height?: number }) {
  return buildMarkdownImage({ url: image.src, width: image.width, height: image.height });
}

function buildAnnouncementContent(uploadedImages: UploadedImage[]) {
  const text = content.value.trimEnd();
  const images = uploadedImages.map(buildMarkdownImage).join('\n');

  if (!images) {
    return text;
  }

  return text ? `${text}\n\n${images}` : images;
}

function removeEditorImage(key: string) {
  const image = editorImages.value.find((candidate) => candidate.key === key);
  if (!image) return;

  void removeImage(image.index);
}

function handleClose() {
  if (props.submitting || uploading.value) {
    return;
  }

  resetImages();
  emit('close');
}

function handleEditorImagePicked(event: Event) {
  const target = event.target as HTMLInputElement;
  if (editorImages.value.length >= maxImages) {
    uploadError.value = `最多只能上傳 ${maxImages} 張圖片。`;
    target.value = '';
    return;
  }

  void handleImagePicked(event);
}

async function submit() {
  const uploadResult = await uploadImagesAndBuildContent();
  emit('save', {
    title: title.value.trim(),
    content: buildAnnouncementContent(uploadResult.uploadedImages),
    uploadedImages: uploadResult.uploadedImages,
  });
}
</script>
