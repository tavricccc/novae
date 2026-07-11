<template>
  <DialogOverlay :open="open" @close="handleClose">
    <section
      ref="dialogRef"
      class="panel panel-pad flex h-full w-full flex-col overflow-hidden rounded-none border-none md:fixed md:inset-0 md:h-screen md:max-h-screen md:rounded-none md:border-none"
      data-dialog-root
      tabindex="-1"
    >
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-ink-200 dark:border-ink-800 pb-4 shrink-0">
        <div class="min-w-0">
          <span class="text-xs font-semibold tracking-wide text-ink-500 dark:text-ink-400">{{ announcement ? '修改公告內容' : '發布新的校內公告' }}</span>
          <h2 class="mt-1 text-xl font-bold tracking-tight text-ink-950 dark:text-ink-50">公告內容</h2>
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
          <label for="announcement-title" class="field-label">公告標題</label>
          <input
            id="announcement-title"
            v-model="title"
            autocomplete="off"
            class="field text-base py-3"
            maxlength="120"
            placeholder="請輸入公告標題..."
            data-autofocus
            :disabled="submitting"
            required
          />
          <div class="flex justify-between items-center text-xs text-ink-500 dark:text-ink-400">
            <span>必填</span>
            <span class="font-medium" :class="{ 'text-error': title.length > 110 }">
              {{ titleCount }} / 120
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
          :max-length="5000"
          :warning-length="4800"
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
        <div class="border-t border-ink-100 dark:border-ink-800 pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between shrink-0 gap-4">
          <p class="text-xs text-ink-500 dark:text-ink-400 font-medium hidden sm:block">
            公告將即時發布予所有使用者。
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
            <button
              type="submit"
              class="button-primary flex-1 px-5 text-sm font-semibold sm:flex-none"
              :disabled="submitting || uploading || !title.trim() || (!content.trim() && editorImages.length === 0)"
            >
              <BusyButtonContent
                :busy="submitting"
                :label="announcement ? '更新公告' : '發布公告'"
                :busy-label="announcement ? '更新中...' : '發布中...'"
              />
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
import BusyButtonContent from '@/components/ui/BusyButtonContent.vue';
import MarkdownImageEditor from '@/components/ui/MarkdownImageEditor.vue';
import type { AnnouncementRecord, MarkdownImageRecord } from '@/types';
import { useBodyScrollLock } from '@/composables/useBodyScrollLock';
import { useDialogFocus } from '@/composables/useDialogFocus';
import { useMarkdownImageUpload } from '@/composables/useMarkdownImageUpload';
import { useResolvedMarkdown } from '@/composables/useResolvedMarkdown';
import { extractMarkdownImages, stripMarkdownImages } from '@/lib/markdown-images';
import type { UploadedImage } from '@/composables/useImageUpload';
import { RATE_LIMITS } from '@/generated/rate-limits';

const props = defineProps<{
  announcement: AnnouncementRecord | null;
  error: string;
  open: boolean;
  submitting: boolean;
}>();

const emit = defineEmits<{
  close: [];
  save: [payload: { title: string; content: string; uploadedImages: UploadedImage[] }];
}>();

type ExistingEditorImage = MarkdownImageRecord & {
  markdownSrc: string;
};

const title = ref('');
const content = ref('');
const existingImages = ref<ExistingEditorImage[]>([]);
const maxImages = RATE_LIMITS.imageUploads.announcementMaxImages;
const isOpen = computed(() => props.open);
const sourceContent = computed(() => props.open ? props.announcement?.content ?? '' : '');
const { images: resolvedExistingImages } = useResolvedMarkdown(sourceContent);
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
  ...existingImages.value.map((image, index) => ({
    alt: image.alt || '公告附加圖片',
    height: image.height,
    index,
    key: `existing:${image.src}:${index}`,
    markdownSrc: image.markdownSrc,
    src: image.src,
    type: 'existing' as const,
    width: image.width,
  })),
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
  () => [props.open, props.announcement] as const,
  ([open, announcement]) => {
    if (!open) {
      resetImages();
      return;
    }
    title.value = announcement?.title ?? '';
    existingImages.value = announcement
      ? extractMarkdownImages(announcement.content).map((image) => ({
          ...image,
          markdownSrc: image.src,
        }))
      : [];
    content.value = announcement ? stripMarkdownImages(announcement.content) : '';
    resetImages();
    showPreview.value = false;
  },
  { immediate: true },
);

watch(resolvedExistingImages, (images) => {
  if (!props.open) return;

  existingImages.value = existingImages.value.map((image) => {
    const resolvedImage = images.find((candidate) =>
      image.uploadId
        ? candidate.uploadId === image.uploadId
        : candidate.src === image.markdownSrc
    );

    if (!resolvedImage?.src) {
      return image;
    }

    return {
      ...image,
      src: resolvedImage.src,
    };
  });
});

function buildMarkdownImage(image: Pick<MarkdownImageRecord, 'src' | 'alt' | 'width' | 'height'>, src = image.src) {
  const size = image.width && image.height ? `|${image.width}x${image.height}` : '';
  return `![${image.alt || 'image'}${size}](${src})`;
}

function buildDisplayMarkdownImage(image: Pick<MarkdownImageRecord, 'src' | 'alt' | 'width' | 'height'>) {
  return buildMarkdownImage(image, image.src);
}

function buildPersistedMarkdownImage(image: ExistingEditorImage) {
  return buildMarkdownImage(image, image.markdownSrc);
}

function buildAnnouncementContent(uploadedImages: UploadedImage[]) {
  const text = content.value.trimEnd();
  const images = [
    ...existingImages.value.map(buildPersistedMarkdownImage),
    ...uploadedImages.map((image) => buildMarkdownImage({
      alt: 'image',
      height: image.height,
      src: image.url,
      width: image.width,
    })),
  ].join('\n');

  if (!images) {
    return text;
  }

  return text ? `${text}\n\n${images}` : images;
}

function removeEditorImage(key: string) {
  const image = editorImages.value.find((candidate) => candidate.key === key);
  if (!image) return;

  if (image.type === 'existing') {
    existingImages.value = existingImages.value.filter((_, index) => index !== image.index);
    return;
  }

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
