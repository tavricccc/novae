<template>
  <DialogOverlay :open="open" padded z-index-class="z-[110]" @close="handleClose">
    <section
      class="panel panel-pad w-full max-w-lg"
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-dialog-title"
      tabindex="-1"
    >
      <p class="dialog-eyebrow">公共議題審核</p>
      <h3 id="review-dialog-title" class="dialog-title">審核此提案</h3>
      <p class="dialog-description">
        請審查提案內容，決定是否通過審核。審核通過後，提案將對外公開並開放附議。
      </p>

      <!-- Step 1: Choice -->
      <div v-if="step === 'choice'" class="mt-6 flex flex-col gap-3">
        <button
          type="button"
          class="button-primary w-full py-3 text-sm font-semibold"
          :disabled="saving"
          @click="approve"
        >
          {{ saving ? '處理中...' : '審核通過（開放附議）' }}
        </button>
        <button
          type="button"
          class="button-secondary w-full py-3 text-sm font-semibold border-warning/20 text-warning hover:bg-warning/5 dark:border-warning/30"
          :disabled="saving"
          @click="step = 'reject'"
        >
          審核不通過
        </button>
        <button
          type="button"
          class="button-secondary w-full py-3 text-sm font-semibold mt-1"
          :disabled="saving"
          @click="handleClose"
        >
          取消
        </button>
      </div>

      <!-- Step 2: Rejection Reason Input -->
      <div v-else-if="step === 'reject'" class="mt-5 space-y-4">
        <div class="space-y-2">
          <label class="field-label" for="review-rejection-reason">請輸入不通過原因</label>
          <div class="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm transition-colors focus-within:border-secondary focus-within:ring-2 focus-within:ring-secondary/20 dark:border-ink-800 dark:bg-ink-900">
            <textarea
              id="review-rejection-reason"
              v-model="rejectionReason"
              class="block min-h-36 w-full resize-none bg-transparent px-4 py-3 text-base leading-6 text-ink-800 outline-none placeholder:text-ink-400 disabled:cursor-not-allowed disabled:text-ink-500 dark:text-ink-100 dark:placeholder:text-ink-500 md:text-sm"
              maxlength="500"
              placeholder="請簡要說明未通過原因，此原因會發送通知給提案者"
              data-autofocus
              :disabled="saving"
            ></textarea>
            <div class="flex items-center justify-end border-t border-ink-100 bg-ink-50/50 px-4 py-2 text-xs font-medium text-ink-500 dark:border-ink-800 dark:bg-ink-950/30 dark:text-ink-400">
              <span :class="{ 'text-error': rejectionReason.length > 450 }">{{ rejectionReason.length }} / 500</span>
            </div>
          </div>
        </div>

        <p v-if="errorMsg" class="text-xs font-semibold text-error">{{ errorMsg }}</p>

        <div class="dialog-actions">
          <button type="button" class="button-secondary" :disabled="saving" @click="step = 'choice'">
            返回
          </button>
          <button
            type="button"
            class="button-secondary border-warning/30 text-warning hover:text-warning"
            :disabled="saving"
            @click="reject"
          >
            {{ saving ? '送出中...' : '確認不通過' }}
          </button>
        </div>
      </div>
    </section>
  </DialogOverlay>
</template>

<script setup lang="ts">
import { ref } from 'vue';
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

const step = ref<'choice' | 'reject'>('choice');
const rejectionReason = ref(props.issue.review_rejection_reason ?? '');
const saving = ref(false);
const errorMsg = ref('');

function handleClose() {
  if (saving.value) return;
  emit('close');
}

async function approve() {
  saving.value = true;
  errorMsg.value = '';
  try {
    const updated = await moderateIssueStatus(props.issue.id, 'pending');
    emit('success', updated);
    emit('close');
  } catch (caught) {
    errorMsg.value = caught instanceof Error ? caught.message : '審核通過處理失敗，請稍後再試。';
  } finally {
    saving.value = false;
  }
}

async function reject() {
  const reason = rejectionReason.value.replace(/\s+/g, ' ').trim();
  if (!reason) {
    errorMsg.value = '請輸入審核未通過原因。';
    return;
  }
  saving.value = true;
  errorMsg.value = '';
  try {
    const updated = await moderateIssueStatus(props.issue.id, 'review-rejected', reason);
    emit('success', updated);
    emit('close');
  } catch (caught) {
    errorMsg.value = caught instanceof Error ? caught.message : '審核不通過處理失敗，請稍後再試。';
  } finally {
    saving.value = false;
  }
}
</script>
