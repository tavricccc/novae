import { computed, reactive, ref, toRef, watch, type Ref } from 'vue';
import { useMarkdownImageUpload } from '@/composables/useMarkdownImageUpload';
import { useSession } from '@/composables/useSession';
import { useToast } from '@/composables/useToast';
import { createIssue } from '@/services/issues';
import type { IssueRecord, WritableIssueCategory } from '@/types';
import { RATE_LIMITS } from '@/generated/rate-limits';

interface IssueComposerFormOptions {
  category: Ref<WritableIssueCategory>;
  onClose: () => void;
  onSubmitted: (issue: IssueRecord) => void;
}

export function useIssueComposerForm(open: Ref<boolean>, options: IssueComposerFormOptions) {
  const { user } = useSession();
  const { showProgressToast, showToast } = useToast();
  const form = reactive({
    title: '',
    content: '',
  });
  const {
    fileInputRef,
    handleImagePicked,
    contentWithImages,
    deleteUploadedImages,
    discardImages,
    imageUrls,
    removeImage,
    resetImages,
    textareaRef: contentTextareaRef,
    uploadError,
    uploadImagesAndBuildContent,
    uploading,
  } = useMarkdownImageUpload(toRef(form, 'content'), {
    maxImages: RATE_LIMITS.imageUploads.issueMaxImages,
  });

  const submitting = ref(false);
  const showPreview = ref(false);
  const error = ref('');
  const titleCount = computed(() => form.title.length);
  const contentCount = computed(() => form.content.length);

  watch(open, (isOpen) => {
    if (!isOpen) {
      resetForm();
    }
  });

  function resetForm() {
    form.title = '';
    form.content = '';
    resetImages();
    showPreview.value = false;
    error.value = '';
  }

  async function handleClose() {
    if (submitting.value || uploading.value) {
      return;
    }

    try {
      await discardImages();
      options.onClose();
    } catch {
      uploadError.value = '圖片刪除失敗，請稍後再試。';
      showToast(uploadError.value, 'error');
    }
  }

  async function submit() {
    if (!user.value?.email || !user.value.displayName) {
      error.value = '請先使用完整的校內 Google 帳號登入。';
      showToast(error.value, 'error');
      return;
    }

    if (form.title.trim().length === 0) {
      error.value = '請輸入提案標題。';
      showToast(error.value, 'error');
      return;
    }

    if (!contentWithImages.value.trim()) {
      error.value = '請輸入提案內容或加入圖片。';
      showToast(error.value, 'error');
      return;
    }

    submitting.value = true;
    const progressToast = showProgressToast('正在送出提案...');
    let uploadedImages: Awaited<ReturnType<typeof uploadImagesAndBuildContent>>['uploadedImages'] = [];

    try {
      if (imageUrls.value.length > 0) progressToast.update('正在上傳圖片...');
      const uploadResult = await uploadImagesAndBuildContent();
      uploadedImages = uploadResult.uploadedImages;
      progressToast.update('正在建立提案...');

      const issue = await createIssue({
        title: form.title,
        content: uploadResult.content,
        category: options.category.value,
      });

      resetForm();
      options.onSubmitted(issue);
      options.onClose();
      progressToast.succeed('提案已送出。');
    } catch (caught) {
      if (uploadedImages.length) {
        await deleteUploadedImages(uploadedImages);
      }
      error.value = caught instanceof Error ? caught.message : '送出失敗，請稍後再試。';
      progressToast.fail(error.value);
    } finally {
      submitting.value = false;
    }
  }

  return {
    form,
    fileInputRef,
    handleImagePicked,
    contentWithImages,
    imageUrls,
    removeImage,
    contentTextareaRef,
    uploadError,
    uploading,
    submitting,
    showPreview,
    error,
    titleCount,
    contentCount,
    handleClose,
    submit,
  };
}
