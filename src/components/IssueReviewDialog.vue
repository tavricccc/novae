<template>
  <DialogOverlay :open="open" padded z-index-class="z-[110]" @close="handleClose">
    <section
      class="panel panel-pad w-full max-w-lg"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-dialog-title"
      tabindex="-1"
    >
      <h3 id="review-dialog-title" class="dialog-title">
        {{ step === 1 ? '審核此提案' : '填寫未通過原因' }}
      </h3>
      <p class="dialog-description">
        {{ step === 1
          ? '請審查提案內容，決定是否通過審核。審核通過後，提案將對外公開並開放附議。'
          : '請簡要說明未通過原因，此原因會發送通知給提案者。' }}
      </p>

      <div class="mt-5 space-y-4">
        <!-- Moderation choice (Step 1) -->
        <div v-if="step === 1">
          <p class="field-label mb-2">審核結果</p>
          <div class="grid gap-2">
            <button
              v-for="option in reviewOptions"
              :key="option.value"
              type="button"
              class="content-trigger flex w-full items-center justify-between gap-3 border px-3 py-3 text-left"
              :class="reviewDecision === option.value
                ? 'button-toolbar--active border-secondary/50'
                : 'border-ink-100 dark:border-ink-800'"
              @click="reviewDecision = option.value"
            >
              <span class="min-w-0">
                <span class="block text-sm font-semibold text-ink-900 dark:text-ink-100">{{ option.label }}</span>
                <span class="mt-0.5 block text-xs leading-5 text-ink-500 dark:text-ink-400">{{ option.description }}</span>
              </span>
              <span
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold"
                :class="reviewDecision === option.value
                  ? 'border-ink-900 bg-ink-900 text-white dark:border-ink-50 dark:bg-ink-50 dark:text-ink-950'
                  : 'border-ink-300 text-transparent dark:border-ink-700'"
                aria-hidden="true"
              >
                ✓
              </span>
            </button>
          </div>
        </div>

        <!-- Rejection reason input (Step 2) -->
        <div v-else-if="step === 2" class="space-y-2">
          <label class="field-label" for="review-rejection-reason">不通過原因</label>
          <div class="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm transition-colors focus-within:border-secondary focus-within:ring-2 focus-within:ring-secondary/20 dark:border-ink-800 dark:bg-ink-900">
            <textarea
              id="review-rejection-reason"
              v-model="rejectionReason"
              class="block min-h-36 w-full resize-none bg-transparent px-4 py-3 text-base leading-6 text-ink-800 outline-none placeholder:text-ink-400 disabled:cursor-not-allowed disabled:text-ink-500 dark:text-ink-100 dark:placeholder:text-ink-500 md:text-sm"
              maxlength="500"
              placeholder="請簡要說明未通過原因，此原因會發送通知給提案者"
              :disabled="saving"
            ></textarea>
            <div class="flex items-center justify-end border-t border-ink-100 bg-ink-50/50 px-4 py-2 text-xs font-medium text-ink-500 dark:border-ink-800 dark:bg-ink-950/30 dark:text-ink-400">
              <span :class="{ 'text-error': rejectionReason.length > 450 }">{{ rejectionReason.length }} / 500</span>
            </div>
          </div>
        </div>
      </div>

      <p v-if="errorMsg" class="mt-3 text-xs font-semibold text-error">{{ errorMsg }}</p>

      <div class="dialog-actions">
        <button type="button" class="button-secondary" :disabled="saving" @click="handleSecondaryClick">
          {{ step === 1 ? '取消' : '返回' }}
        </button>
        <button
          type="button"
          class="button-primary"
          :disabled="saving"
          @click="handlePrimaryClick"
        >
          {{ primaryButtonLabel }}
        </button>
      </div>
    </section>
  </DialogOverlay>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import DialogOverlay from '@/components/ui/DialogOverlay.vue';
import { moderateIssueStatus } from '@/services/issues';
import type { IssueRecord } from '@/types';

const props = defineProps<{
  open: boolean;
  issue: IssueRecord;
}>();

const emit = defineEmits<{
  close: [];
  success: [issue: IssueRecord];
}>();

const reviewOptions = [
  {
    value: 'approved' as const,
    label: '審核通過',
    description: '提案將會公開，並開始接受使用者附議。',
  },
  {
    value: 'rejected' as const,
    label: '審核不通過',
    description: '提案將不會公開，需提供不通過原因通知提案者。',
  },
];

const step = ref(1);
const reviewDecision = ref<'approved' | 'rejected'>('approved');
const rejectionReason = ref(props.issue.review_rejection_reason ?? '');
const saving = ref(false);
const errorMsg = ref('');

const primaryButtonLabel = computed(() => {
  if (saving.value) return '儲存中...';
  if (step.value === 1) {
    return reviewDecision.value === 'approved' ? '確認' : '下一步';
  }
  return '儲存審核結果';
});

function handleClose() {
  if (saving.value) return;
  emit('close');
}

function handlePrimaryClick() {
  if (step.value === 1) {
    if (reviewDecision.value === 'approved') {
      submitReview();
    } else {
      step.value = 2;
    }
  } else if (step.value === 2) {
    submitReview();
  }
}

function handleSecondaryClick() {
  if (step.value === 1) {
    handleClose();
  } else {
    step.value = 1;
    errorMsg.value = '';
  }
}

async function submitReview() {
  saving.value = true;
  errorMsg.value = '';
  try {
    if (reviewDecision.value === 'approved') {
      const updated = await moderateIssueStatus(props.issue.id, 'pending');
      emit('success', updated);
      emit('close');
    } else {
      const reason = rejectionReason.value.replace(/\s+/g, ' ').trim();
      if (!reason) {
        errorMsg.value = '請輸入審核未通過原因。';
        saving.value = false;
        return;
      }
      const updated = await moderateIssueStatus(props.issue.id, 'review-rejected', reason);
      emit('success', updated);
      emit('close');
    }
  } catch (caught) {
    errorMsg.value = caught instanceof Error ? caught.message : '審核處理失敗，請稍後再試。';
  } finally {
    saving.value = false;
  }
}

watch(
  () => props.open,
  (newOpen) => {
    if (newOpen) {
      step.value = 1;
      reviewDecision.value = 'approved';
      rejectionReason.value = props.issue.review_rejection_reason ?? '';
      errorMsg.value = '';
    }
  }
);
</script>
