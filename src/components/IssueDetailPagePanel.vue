<template>
  <DetailPageShell
    :initial-tab="initialTab"
    back-label="返回提案列表"
    details-label="提案內容"
    @back="emit('back')"
  >
    <template #header>
      <span class="tag border-ink-200 bg-ink-100/50 dark:border-ink-800 dark:bg-ink-950/50">
        {{ categoryLabel }}
      </span>
      <span class="tag font-semibold shadow-sm" :class="statusClass">
        {{ statusLabel }}
      </span>
      <span
        v-if="issue.support_enabled && issue.support_met_at"
        class="tag border-primary/30 bg-primary-container/50 font-semibold text-on-primary-container shadow-sm"
      >
        <span class="hidden md:inline">已達附議門檻</span>
        <span class="md:hidden">已達門檻</span>
      </span>
    </template>

    <template #details="{ compact, scrollContent }">
      <IssueDetailContent
        :compact="compact"
        :display-author-name="displayAuthorName"
        :display-photo-url="displayPhotoUrl"
        :issue="issue"
        :primary-time-label="primaryTimeLabel"
        :primary-time-value-label="primaryTimeValueLabel"
        :scroll-content="scrollContent"
        :show-author="showAuthor"
      />
    </template>

    <template #actions="{ compact }">
      <IssueDetailSupportFooter
        :can-manage="isAdmin || isOwnIssue"
        :is-admin="isAdmin"
        :compact="compact"
        :current-user-supported="currentUserSupported"
        :issue="issue"
        :primary-time-label="primaryTimeLabel"
        :primary-time-short-label="primaryTimeShortLabel"
        :primary-time-value-label="primaryTimeValueLabel"
        :response-deadline-label="responseDeadlineLabel"
        :status-label="statusLabel"
        :support-closed="supportClosed"
        :support-count="supportCount"
        :support-deadline-label="supportDeadlineLabel"
        :support-met-label="supportMetLabel"
        :support-progress-style="supportProgressStyle"
        :support-remaining-label="supportRemainingLabel"
        @content-unavailable="emit('contentUnavailable', $event)"
        @delete="emit('delete')"
        @share="emit('share')"
        @supported="emit('supported', $event)"
        @edit-result="openResultDialog"
      />
    </template>

    <template #comments="{ compactHeader }">
      <IssueComments
        v-if="commentsEnabled"
        :can-compose="commentsEnabled"
        :compact-header="compactHeader"
        :issue-id="issue.id"
        class="h-full"
        @content-unavailable="emit('contentUnavailable', $event)"
      />
      <section v-else class="flex h-full min-h-0 flex-col">
        <div
          class="flex shrink-0 items-center justify-between gap-3 border-b border-ink-100 pb-2 dark:border-ink-800"
          :class="{ 'max-md:hidden': compactHeader }"
        >
          <div class="flex min-w-0 items-center gap-2">
            <AppIcon name="comment" class="shrink-0 text-ink-500" />
            <h4 class="truncate whitespace-nowrap text-base font-semibold text-ink-900 dark:text-ink-100">
              討論留言
            </h4>
          </div>
        </div>
        <div class="flex min-h-0 flex-1 items-center py-4 pr-1">
          <EmptyStatePanel
            title="目前不開放留言"
            description="提案完成審核後才會開放留言討論。"
            icon="comment"
          />
        </div>
      </section>
    </template>
  </DetailPageShell>

  <DialogOverlay :open="isResultDialogOpen" padded z-index-class="z-[110]" @close="closeResultDialog">
    <section
      class="panel panel-pad w-full max-w-lg"
      role="dialog"
      aria-modal="true"
      aria-labelledby="issue-result-title"
      tabindex="-1"
    >
      <p class="dialog-eyebrow">提案回覆</p>
      <h3 id="issue-result-title" class="dialog-title">編輯提案結果</h3>
      <p class="dialog-description">
        提案結果會顯示在提案內容上方，供使用者查看目前處理結論。
      </p>
      <div class="mt-5 space-y-2">
        <label class="field-label" for="issue-result-content">提案結果</label>
        <div class="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm transition-colors focus-within:border-secondary focus-within:ring-2 focus-within:ring-secondary/20 dark:border-ink-800 dark:bg-ink-900">
          <textarea
            id="issue-result-content"
            v-model="resultContent"
            class="block min-h-44 w-full resize-none bg-transparent px-4 py-3 text-base leading-6 text-ink-800 outline-none placeholder:text-ink-400 disabled:cursor-not-allowed disabled:text-ink-500 dark:text-ink-100 dark:placeholder:text-ink-500 md:text-sm"
            maxlength="2000"
            placeholder="輸入提案結果"
            data-autofocus
            :disabled="isSavingResult"
          ></textarea>
          <div class="flex items-center justify-end border-t border-ink-100 bg-ink-50/50 px-4 py-2 text-xs font-medium text-ink-500 dark:border-ink-800 dark:bg-ink-950/30 dark:text-ink-400">
            <span :class="{ 'text-error': resultContent.length > 1800 }">{{ resultContent.length }} / 2000</span>
          </div>
        </div>
      </div>
      <p v-if="resultError" class="mt-2 text-xs font-semibold text-error">{{ resultError }}</p>
      <div class="dialog-actions">
        <button type="button" class="button-secondary" :disabled="isSavingResult" @click="closeResultDialog">
          取消
        </button>
        <button type="button" class="button-primary" :disabled="isSavingResult" @click="submitResult">
          {{ isSavingResult ? '儲存中...' : '儲存結果' }}
        </button>
      </div>
    </section>
  </DialogOverlay>
</template>

<script setup lang="ts">
import { computed, ref, toRef } from 'vue';
import { useIssueDisplay } from '@/composables/useIssueDisplay';
import { useStatusStyling } from '@/composables/useStatusStyling';
import { getSupportProgressPercent, getSupportRemainingLabel } from '@/lib/issue-status';
import type { IssueRecord } from '@/types';

import DetailPageShell from '@/components/ui/DetailPageShell.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import DialogOverlay from '@/components/ui/DialogOverlay.vue';
import EmptyStatePanel from '@/components/ui/EmptyStatePanel.vue';
import IssueDetailContent from '@/components/IssueDetailContent.vue';
import IssueDetailSupportFooter from '@/components/IssueDetailSupportFooter.vue';
import IssueComments from '@/components/IssueComments.vue';
import { useSession } from '@/composables/useSession';
import { issueAllowsCommentsForStatus, issueStoresAuthorPrivately } from '@/constants/categories';
import { updateIssueResult } from '@/services/issues';

const props = withDefaults(
  defineProps<{
    issue: IssueRecord;
    currentUserSupported: boolean;
    supportCount: number;
    supportClosed: boolean;
    initialTab?: 'details' | 'comments';
  }>(),
  {
    initialTab: 'details',
  }
);

const emit = defineEmits<{
  contentUnavailable: [issueId: string];
  back: [];
  delete: [];
  'issue-updated': [issue: IssueRecord];
  share: [];
  supported: [payload: { supported: boolean; supportCount: number }];
}>();

const { isAdmin } = useSession();
const isResultDialogOpen = ref(false);
const isSavingResult = ref(false);
const resultContent = ref('');
const resultError = ref('');

const {
  displayAuthorName,
  displayPhotoUrl,
  derivedStatus,
  categoryLabel,
  statusLabel,
  primaryTimeLabel,
  primaryTimeShortLabel,
  primaryTimeValueLabel,
  supportDeadlineLabel,
  responseDeadlineLabel,
  supportMetLabel,
  remainingDays,
  isOwnIssue,
} = useIssueDisplay(toRef(props, 'issue'));

const { statusClass } = useStatusStyling(derivedStatus, 'dialog');

const supportProgressStyle = computed(() => {
  const progress = getSupportProgressPercent(props.supportCount, props.issue.support_goal);
  return { width: `${progress}%` };
});

const showAuthor = computed(() => !issueStoresAuthorPrivately(props.issue.category) || isAdmin.value || isOwnIssue.value);

const supportRemainingLabel = computed(() => getSupportRemainingLabel(remainingDays.value));
const commentsEnabled = computed(() => issueAllowsCommentsForStatus(props.issue.category, props.issue.status));

function openResultDialog() {
  resultContent.value = props.issue.result_content ?? '';
  resultError.value = '';
  isResultDialogOpen.value = true;
}

function closeResultDialog() {
  if (isSavingResult.value) return;
  isResultDialogOpen.value = false;
  resultError.value = '';
}

async function submitResult() {
  isSavingResult.value = true;
  resultError.value = '';
  try {
    const issue = await updateIssueResult(props.issue.id, resultContent.value);
    emit('issue-updated', issue);
    isResultDialogOpen.value = false;
  } catch (caught) {
    resultError.value = caught instanceof Error ? caught.message : '提案結果儲存失敗，請稍後再試。';
  } finally {
    isSavingResult.value = false;
  }
}
</script>
