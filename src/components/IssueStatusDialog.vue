<template>
  <DialogOverlay :open="open" padded z-index-class="z-[110]" @close="handleClose">
    <section
      class="panel panel-pad w-full max-w-lg"
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-dialog-title"
      tabindex="-1"
    >
      <p class="dialog-eyebrow">提案狀態變更與結果回覆</p>
      <h3 id="status-dialog-title" class="dialog-title">變更提案狀態/結果</h3>
      <p class="dialog-description">
        您可以將提案標記為「處理中」或進行「結案」，並填寫最終的處理結果。
      </p>

      <div class="mt-5 space-y-4">
        <!-- Main Action Selector: Processing or Closed -->
        <div>
          <label class="field-label mb-2">處理狀態</label>
          <div class="grid grid-cols-2 gap-2">
            <button
              type="button"
              class="interactive-surface flex items-center justify-center py-2.5 text-sm font-semibold rounded-2xl border transition-colors"
              :class="actionType === 'processing'
                ? 'border-secondary bg-secondary/5 text-secondary dark:border-secondary dark:bg-secondary/10'
                : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300'"
              @click="actionType = 'processing'"
            >
              處理中
            </button>
            <button
              type="button"
              class="interactive-surface flex items-center justify-center py-2.5 text-sm font-semibold rounded-2xl border transition-colors"
              :class="actionType === 'closed'
                ? 'border-secondary bg-secondary/5 text-secondary dark:border-secondary dark:bg-secondary/10'
                : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300'"
              @click="actionType = 'closed'"
            >
              結案
            </button>
          </div>
        </div>

        <!-- Closed configuration options -->
        <div v-if="actionType === 'closed'" class="space-y-4 pt-4 border-t border-ink-100 dark:border-ink-800/60">
          <div>
            <label class="field-label mb-2">結案結果類型</label>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                class="interactive-surface flex items-center justify-center py-2 text-sm font-semibold rounded-xl border transition-colors"
                :class="closedStatus === 'completed'
                  ? 'border-secondary bg-secondary/5 text-secondary dark:border-secondary dark:bg-secondary/10'
                  : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300'"
                @click="closedStatus = 'completed'"
              >
                已完成
              </button>
              <button
                type="button"
                class="interactive-surface flex items-center justify-center py-2 text-sm font-semibold rounded-xl border transition-colors"
                :class="closedStatus === 'infeasible'
                  ? 'border-secondary bg-secondary/5 text-secondary dark:border-secondary dark:bg-secondary/10'
                  : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-300'"
                @click="closedStatus = 'infeasible'"
              >
                無法實行
              </button>
            </div>
          </div>

          <div class="space-y-2">
            <label class="field-label" for="closed-result-content">提案結果說明</label>
            <div class="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm transition-colors focus-within:border-secondary focus-within:ring-2 focus-within:ring-secondary/20 dark:border-ink-800 dark:bg-ink-900">
              <textarea
                id="closed-result-content"
                v-model="resultContent"
                class="block min-h-36 w-full resize-none bg-transparent px-4 py-3 text-base leading-6 text-ink-800 outline-none placeholder:text-ink-400 disabled:cursor-not-allowed disabled:text-ink-500 dark:text-ink-100 dark:placeholder:text-ink-500 md:text-sm"
                maxlength="2000"
                placeholder="請輸入提案結果說明（例如實行方式、預計時程或無法辦理的原因）"
                :disabled="saving"
              ></textarea>
              <div class="flex items-center justify-end border-t border-ink-100 bg-ink-50/50 px-4 py-2 text-xs font-medium text-ink-500 dark:border-ink-800 dark:bg-ink-950/30 dark:text-ink-400">
                <span :class="{ 'text-error': resultContent.length > 1800 }">{{ resultContent.length }} / 2000</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p v-if="errorMsg" class="mt-3 text-xs font-semibold text-error">{{ errorMsg }}</p>

      <div class="dialog-actions">
        <button type="button" class="button-secondary" :disabled="saving" @click="handleClose">
          取消
        </button>
        <button type="button" class="button-primary" :disabled="saving" @click="save">
          {{ saving ? '儲存中...' : '儲存結果' }}
        </button>
      </div>
    </section>
  </DialogOverlay>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import DialogOverlay from '@/components/ui/DialogOverlay.vue';
import { moderateIssueStatus, updateIssueResult } from '@/services/issues';
import type { IssueRecord } from '@/types';

const props = withDefaults(
  defineProps<{
    open: boolean;
    issue: IssueRecord;
    initialAction?: 'processing' | 'closed';
  }>(),
  {
    initialAction: 'processing',
  }
);

const emit = defineEmits<{
  close: [];
  success: [issue: IssueRecord];
}>();

const actionType = ref<'processing' | 'closed'>(props.initialAction);
const closedStatus = ref<'completed' | 'infeasible'>(
  props.issue.status === 'infeasible' ? 'infeasible' : 'completed'
);
const resultContent = ref(props.issue.result_content ?? '');
const saving = ref(false);
const errorMsg = ref('');

function handleClose() {
  if (saving.value) return;
  emit('close');
}

async function save() {
  saving.value = true;
  errorMsg.value = '';
  try {
    if (actionType.value === 'processing') {
      const updated = await moderateIssueStatus(props.issue.id, 'processing');
      let finalIssue = updated;
      if (props.issue.result_content) {
        finalIssue = await updateIssueResult(props.issue.id, '');
      }
      emit('success', finalIssue);
    } else {
      const content = resultContent.value.trim();
      if (!content) {
        errorMsg.value = '請輸入提案結果說明。';
        saving.value = false;
        return;
      }
      // Order: set closed status, then write result explanation
      const updated = await moderateIssueStatus(props.issue.id, closedStatus.value);
      const finalIssue = await updateIssueResult(props.issue.id, content);
      emit('success', finalIssue);
    }
    emit('close');
  } catch (caught) {
    errorMsg.value = caught instanceof Error ? caught.message : '更新失敗，請稍後再試。';
  } finally {
    saving.value = false;
  }
}
</script>
