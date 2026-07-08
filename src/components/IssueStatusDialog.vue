<template>
  <DialogOverlay :open="open" padded z-index-class="z-[110]" @close="handleClose">
    <section
      class="panel panel-pad w-full max-w-lg"
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-dialog-title"
      tabindex="-1"
    >
      <h3 id="status-dialog-title" class="dialog-title">更新提案狀態</h3>
      <p class="dialog-description">
        選擇下一個狀態；結案時請填寫使用者看得到的處理結果。
      </p>

      <div class="mt-5 space-y-4">
        <div>
          <label class="field-label mb-2">下一個狀態</label>
          <div class="grid gap-2">
            <button
              v-for="option in availableStatusOptions"
              :key="option.value"
              type="button"
              class="content-trigger flex w-full items-center justify-between gap-3 border px-3 py-3 text-left"
              :class="nextStatus === option.value
                ? 'button-toolbar--active border-secondary/50'
                : 'border-ink-100 dark:border-ink-800'"
              @click="nextStatus = option.value"
            >
              <span class="min-w-0">
                <span class="block text-sm font-semibold text-ink-900 dark:text-ink-100">{{ option.label }}</span>
                <span class="mt-0.5 block text-xs leading-5 text-ink-500 dark:text-ink-400">{{ option.description }}</span>
              </span>
              <span
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold"
                :class="nextStatus === option.value
                  ? 'border-ink-900 bg-ink-900 text-white dark:border-ink-50 dark:bg-ink-50 dark:text-ink-950'
                  : 'border-ink-300 text-transparent dark:border-ink-700'"
                aria-hidden="true"
              >
                ✓
              </span>
            </button>
          </div>
        </div>

        <div v-if="requiresResult" class="space-y-4 pt-4 border-t border-ink-100 dark:border-ink-800/60">
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

        <p
          v-else-if="issue.result_content"
          class="rounded-xl border border-warning/20 bg-warning-container/40 px-3 py-2 text-xs font-semibold leading-5 text-on-warning-container"
        >
          改為處理中會清除目前的提案結果說明。
        </p>
      </div>

      <p v-if="errorMsg" class="mt-3 text-xs font-semibold text-error">{{ errorMsg }}</p>

      <div class="dialog-actions">
        <button type="button" class="button-secondary" :disabled="saving" @click="handleClose">
          取消
        </button>
        <button type="button" class="button-primary" :disabled="saving" @click="save">
          {{ saving ? '儲存中...' : saveLabel }}
        </button>
      </div>
    </section>
  </DialogOverlay>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import DialogOverlay from '@/components/ui/DialogOverlay.vue';
import { moderateIssueStatus, updateIssueResult } from '@/services/issues';
import type { IssueRecord, IssueStatus } from '@/types';

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

type EditableStatus = Extract<IssueStatus, 'processing' | 'completed' | 'infeasible'>;

const statusOptions: Array<{
  description: string;
  label: string;
  value: EditableStatus;
}> = [
  {
    value: 'processing',
    label: '處理中',
    description: '提案已開始處理，尚未有最終結果。',
  },
  {
    value: 'completed',
    label: '已完成',
    description: '提案已實行或已有明確完成結果。',
  },
  {
    value: 'infeasible',
    label: '無法實行',
    description: '提案經評估後無法辦理，需說明原因。',
  },
];
const availableStatusOptions = computed(() =>
  props.issue.status === 'processing'
    ? statusOptions.filter((option) => option.value !== 'processing')
    : statusOptions
);

function initialStatus(): EditableStatus {
  if (props.issue.status === 'processing') {
    return 'completed';
  }
  if (props.initialAction === 'closed') {
    return props.issue.status === 'infeasible' ? 'infeasible' : 'completed';
  }
  if (props.issue.status === 'completed' || props.issue.status === 'infeasible') {
    return props.issue.status;
  }
  return 'processing';
}

const nextStatus = ref<EditableStatus>(initialStatus());
const resultContent = ref(props.issue.result_content ?? '');
const saving = ref(false);
const errorMsg = ref('');
const requiresResult = computed(() => nextStatus.value === 'completed' || nextStatus.value === 'infeasible');
const saveLabel = computed(() => requiresResult.value ? '儲存狀態與結果' : '改為處理中');

function handleClose() {
  if (saving.value) return;
  emit('close');
}

async function save() {
  saving.value = true;
  errorMsg.value = '';
  try {
    if (!requiresResult.value) {
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
      const updated = await moderateIssueStatus(props.issue.id, nextStatus.value);
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

watch(
  () => [props.open, props.issue.id, props.issue.status, props.initialAction] as const,
  () => {
    if (!props.open) return;
    nextStatus.value = initialStatus();
    if (!availableStatusOptions.value.some((option) => option.value === nextStatus.value)) {
      nextStatus.value = availableStatusOptions.value[0]?.value ?? 'completed';
    }
    resultContent.value = props.issue.result_content ?? '';
    errorMsg.value = '';
  },
);
</script>
