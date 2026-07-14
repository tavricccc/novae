<template>
  <div class="relative" :class="{ 'z-50': isDropdownOpen }" role="listitem">
    <article
      class="issue-card list-row-trigger relative overflow-hidden"
      data-list-row-trigger
      @click="openDetails()"
    >
      <header class="flex min-w-0 items-center gap-2">
        <span class="tag-sm shrink-0 font-semibold" :class="statusClass">
          {{ statusLabel }}
        </span>
        <span class="ml-auto truncate text-xs text-ink-400 dark:text-ink-500">
          {{ primaryTimeValueLabel }}
        </span>
        <div v-if="isAdmin" class="shrink-0" @click.stop="stopCardActionClick">
          <IssueAdminMenu
            :issue="issue"
            :compact="true"
            class="!space-y-0"
            @dropdown-open="(open) => isDropdownOpen = open"
            @message="(msg) => showActionFeedback(msg, 'success')"
            @error="(err) => showActionFeedback(err, 'error')"
            @status-changed="emit('issue-updated', $event)"
            @delete="confirmDelete"
          />
        </div>
      </header>

      <div class="mt-3 flex min-w-0 items-center gap-2.5">
        <UserAvatar
          v-if="issue.canViewAuthor"
          :photo-url="displayPhotoUrl"
          :name="displayAuthorName"
          size="sm"
          :alt-text="`${displayAuthorName} 的頭像`"
          class="shrink-0"
        />
        <div class="min-w-0 flex-1">
          <h3 class="line-clamp-2 text-[15px] font-semibold leading-6 tracking-[0.01em] text-ink-950 dark:text-ink-50 sm:text-base">
            <SearchHighlight :text="issue.title" :query="highlightQuery" />
          </h3>
          <p v-if="issue.canViewAuthor" class="mt-0.5 truncate text-xs text-ink-500 dark:text-ink-400">
            {{ displayAuthorName }}
          </p>
        </div>
      </div>

      <div v-if="issue.support_enabled" class="mt-4 rounded-xl bg-ink-50/85 px-3 py-2.5 dark:bg-ink-900/55">
        <div class="flex items-center justify-between gap-3 text-xs">
          <span class="font-semibold tabular-nums text-ink-700 dark:text-ink-300">
            {{ supportCount }} / {{ issue.support_goal ?? 0 }} 附議
          </span>
          <span v-if="supportRemainingLabel" class="text-ink-400 dark:text-ink-500">
            {{ supportRemainingLabel }}
          </span>
        </div>
        <div class="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-200/80 dark:bg-ink-700" aria-hidden="true">
          <div
            class="h-full rounded-full bg-ink-900 transition-all duration-500 dark:bg-ink-100"
            :style="supportProgressStyle"
          ></div>
        </div>
      </div>
      <p v-else class="mt-4 text-xs text-ink-400 dark:text-ink-500">此提案不開放附議</p>

      <footer class="mt-3 flex items-center justify-end gap-1.5" @click.stop="stopCardActionClick">
        <button
          type="button"
          class="button-toolbar h-8 w-8 rounded-full p-0"
          title="查看留言"
          aria-label="查看留言"
          @click.stop="openDetails('comments')"
        >
          <AppIcon name="comment" />
        </button>
        <VoteButtons
          v-if="issue.support_enabled"
          :issue-id="issue.id"
          :current-user-supported="currentUserSupported"
          :support-count="supportCount"
          :support-closed="supportClosed"
          :status-label="statusLabel"
          :compact="true"
          @supported="handleSupport"
        />
      </footer>
    </article>

    <ConfirmDialog
      :open="isDeleteDialogOpen"
      title="確定要刪除這筆提案嗎？"
      message="刪除後這筆提案將無法復原。"
      confirm-label="確認刪除"
      :busy="isDeleting"
      @cancel="isDeleteDialogOpen = false"
      @confirm="performDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { toRef } from 'vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import IssueAdminMenu from '@/components/IssueAdminMenu.vue';
import VoteButtons from '@/components/VoteButtons.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import SearchHighlight from '@/components/ui/SearchHighlight.vue';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import { useIssueItemController } from '@/composables/useIssueItemController';
import type { IssueRecord } from '@/types';

const props = withDefaults(defineProps<{
  issue: IssueRecord;
  highlightQuery?: string;
}>(), {
  highlightQuery: '',
});

const emit = defineEmits<{
  'support-changed': [payload: { issueId: string; supported: boolean; supportCount: number }];
  'open-details': [payload: { issue: IssueRecord; initialTab: 'details' | 'comments' }];
  'issue-updated': [issue: IssueRecord];
  'issue-deleted': [issueId: string];
}>();

const {
  displayAuthorName,
  displayPhotoUrl,
  statusLabel,
  primaryTimeValueLabel,
  isAdmin,
  currentUserSupported,
  supportCount,
  isDropdownOpen,
  statusClass,
  supportClosed,
  supportProgressStyle,
  supportRemainingLabel,
  isDeleteDialogOpen,
  isDeleting,
  handleSupport,
  openDetails,
  confirmDelete,
  performDelete,
  showActionFeedback,
} = useIssueItemController(
  toRef(props, 'issue'),
  'table-row',
  (payload) => emit('support-changed', payload),
  (payload) => emit('open-details', payload),
  (issue) => emit('issue-updated', issue),
  (issueId) => emit('issue-deleted', issueId),
);

const stopCardActionClick = () => undefined;
</script>
