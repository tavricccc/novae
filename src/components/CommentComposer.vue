<template>
  <form
    class="absolute inset-x-0 bottom-0 z-20 space-y-3 rounded-[1.25rem] border border-ink-200 bg-white/95 p-3 shadow-2xl shadow-ink-900/10 backdrop-blur-md dark:border-ink-700/80 dark:bg-ink-900/95 dark:shadow-black/30"
    autocomplete="off"
    @submit.prevent="submit"
  >
    <button
      type="button"
      class="button-icon-filled absolute right-2 top-2 !h-8 !w-8"
      :disabled="submitting || uploading"
      title="關閉"
      aria-label="關閉留言輸入"
      @click="handleClose"
    >
      <AppIcon name="close" :stroke-width="2.5" />
    </button>

    <div class="min-h-8 pr-10">
      <div class="flex items-center gap-2">
        <img
          v-if="myPhotoUrl"
          :src="myPhotoUrl"
          alt="當前頭像"
          class="h-7 w-7 rounded-full border border-ink-200 object-cover shadow-sm dark:border-ink-800"
        />
        <span class="text-sm font-semibold text-ink-600 dark:text-ink-300">{{ parentCommentId ? '新增回覆' : '新增留言' }}</span>
      </div>
    </div>

    <div
      class="overflow-hidden rounded-2xl border transition-all duration-300 focus-within:border-secondary focus-within:ring-2 focus-within:ring-secondary/20"
      :class="'border-ink-200 bg-white dark:border-ink-800 dark:bg-ink-950/40'"
    >
      <div v-if="!showPreview">
        <div v-if="imageUrls.length" class="flex gap-3 px-5 pt-4">
          <div
            v-for="(url, index) in imageUrls"
            :key="url"
            class="relative h-24 w-24 overflow-hidden rounded-xl border border-ink-200 bg-ink-50 dark:border-ink-800 dark:bg-ink-900"
          >
            <img :src="url" alt="留言附加圖片預覽" class="h-full w-full object-cover" />
            <button
              type="button"
              class="button-remove-image"
              aria-label="移除圖片"
              @click="removeImage(index)"
            >
              <AppIcon name="close" :size="3" :stroke-width="2.5" />
            </button>
          </div>
        </div>
        <textarea
          :id="`comment-content-${composerId}`"
          ref="commentTextareaRef"
          v-model="commentContent"
          class="min-h-[96px] w-full resize-none border-none bg-transparent px-5 py-4 font-sans text-base text-ink-800 outline-none placeholder:text-ink-400 focus:ring-0 dark:text-ink-100 dark:placeholder:text-ink-500 md:text-sm"
          autocomplete="off"
          maxlength="2000"
          :placeholder="parentCommentId ? '留下你的回覆...' : '留下你的留言討論...'"
          :disabled="submitting"
        ></textarea>
      </div>
      <div
        v-else
        class="max-h-[400px] min-h-[96px] w-full overflow-y-auto px-5 py-4 font-sans text-base text-ink-800 dark:text-ink-100 md:text-sm"
      >
        <MarkdownRenderer v-if="contentWithImages.trim()" :content="contentWithImages" />
        <span v-else class="italic text-ink-400">沒有可預覽的內容</span>
      </div>

      <div class="flex items-center justify-between gap-2 border-t border-ink-200 bg-ink-50/50 px-3 py-3 dark:border-ink-800/80 dark:bg-ink-950 sm:px-5">
        <div class="flex min-w-0 items-center gap-2">
          <img
            v-if="myPhotoUrl"
            :src="myPhotoUrl"
            alt="當前頭像"
            class="h-6 w-6 rounded-full border border-ink-200 object-cover shadow-sm dark:border-ink-800"
          />
          <span class="min-w-0 truncate text-xs font-medium text-ink-500 dark:text-ink-400">
            {{ parentCommentId ? '回覆' : '留言' }}
          </span>
        </div>

        <div class="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
          <button
            type="button"
            class="button-toolbar h-10 min-h-10 w-10 rounded-full p-0 sm:h-8 sm:min-h-8 sm:w-8"
            :disabled="uploading || imageUrls.length >= RATE_LIMITS.imageUploads.commentMaxImages"
            :title="uploading ? '圖片處理中...' : imageUrls.length >= RATE_LIMITS.imageUploads.commentMaxImages ? `留言最多 ${RATE_LIMITS.imageUploads.commentMaxImages} 張圖片` : '加入圖片'"
            aria-label="插入圖片"
            @click="commentFileInputRef?.click()"
          >
            <AppIcon name="image" />
          </button>
          <input
            ref="commentFileInputRef"
            type="file"
            accept="image/*"
            autocomplete="off"
            class="hidden"
            multiple
            @change="handleImagePicked"
          />
          <span v-if="uploading" class="hidden text-xs text-ink-400 sm:inline">{{ props.submitting ? '圖片上傳中…' : '圖片壓縮中…' }}</span>
          <span v-else class="hidden text-xs text-ink-400 sm:inline">
            {{ imageUrls.length }} / {{ RATE_LIMITS.imageUploads.commentMaxImages }}
          </span>
          <button
            type="button"
            class="button-secondary h-10 min-h-10 px-3 text-xs font-semibold sm:h-9 sm:min-h-9"
            title="切換預覽模式"
            @click="showPreview = !showPreview"
          >
            {{ showPreview ? '繼續編輯' : '預覽' }}
          </button>
          <button
            type="submit"
            class="button-icon-filled h-10 min-h-10 w-10 sm:h-8 sm:min-h-8 sm:w-8"
            :class="'bg-ink-900 hover:bg-ink-800 dark:bg-ink-100 dark:text-ink-900 dark:hover:bg-ink-200'"
            :disabled="submitting || uploading || (!commentContent.trim() && imageUrls.length === 0)"
            :title="submitting ? '傳送中...' : '送出留言'"
            aria-label="送出留言"
          >
            <LoadingSpinner v-if="submitting" :size="4" />
            <AppIcon v-else name="send" />
          </button>
        </div>
      </div>
    </div>

    <p v-if="error || uploadError" class="pl-1.5 text-xs font-semibold text-error">
      錯誤：{{ error || uploadError }}
    </p>
  </form>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import MarkdownRenderer from '@/components/MarkdownRenderer.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue';
import { useMarkdownImageUpload } from '@/composables/useMarkdownImageUpload';
import { useSession } from '@/composables/useSession';
import { useToast } from '@/composables/useToast';
import { RATE_LIMITS } from '@/generated/rate-limits';

const props = defineProps<{
  error: string;
  issueId?: string;
  parentCommentId?: string | null;
  submitting: boolean;
  targetId?: string;
}>();

const emit = defineEmits<{
  close: [];
  submit: [payload: { content: string; parentCommentId: string | null }];
}>();

const { user, customPhotoUrl } = useSession();
const { showToast } = useToast();
const myPhotoUrl = computed(() => customPhotoUrl.value || user.value?.photoURL || null);
const composerId = computed(() => props.issueId ?? props.targetId ?? 'default');

const commentContent = ref('');
const showPreview = ref(false);
const {
  fileInputRef: commentFileInputRef,
  handleImagePicked,
  contentWithImages,
  deleteUploadedImages,
  discardImages,
  imageUrls,
  removeImage,
  resetImages,
  textareaRef: commentTextareaRef,
  uploadError,
  uploadImagesAndBuildContent,
  uploading,
} = useMarkdownImageUpload(commentContent, {
  maxImages: RATE_LIMITS.imageUploads.commentMaxImages,
});
const submittedImages = ref<Awaited<ReturnType<typeof uploadImagesAndBuildContent>>['uploadedImages']>([]);

nextTick(() => {
  commentTextareaRef.value?.focus();
});

async function submit() {
  try {
    const uploadResult = await uploadImagesAndBuildContent();
    submittedImages.value = uploadResult.uploadedImages;

    emit('submit', {
      content: uploadResult.content,
      parentCommentId: props.parentCommentId ?? null,
    });
  } catch {
    uploadError.value = '圖片上傳失敗，請稍後再試。';
    showToast(uploadError.value, 'error');
  }
}

async function handleClose() {
  if (props.submitting || uploading.value) {
    return;
  }

  try {
    await discardImages();
    emit('close');
  } catch {
    uploadError.value = '圖片刪除失敗，請稍後再試。';
    showToast(uploadError.value, 'error');
  }
}

watch(
  () => props.submitting,
  (isSubmitting, wasSubmitting) => {
    if (!isSubmitting && wasSubmitting && !props.error) {
      commentContent.value = '';
      resetImages();
      submittedImages.value = [];
      showPreview.value = false;
    }
    if (!isSubmitting && wasSubmitting && props.error && submittedImages.value.length) {
      deleteUploadedImages(submittedImages.value);
      submittedImages.value = [];
    }
  },
);
</script>
