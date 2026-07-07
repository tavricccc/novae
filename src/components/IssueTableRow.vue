<template>
  <div
    class="relative"
    :class="{ 'z-50': isDropdownOpen }"
  >
    <div class="issue-row-mobile list-row-trigger md:hidden">
      <div class="flex min-w-0 items-center gap-2 w-full">
        <span class="tag shrink-0 px-2 py-0.5 text-xs" :class="statusClass">
          {{ statusLabel }}
        </span>
        <UserAvatar v-if="isOwnIssue" :photo-url="displayPhotoUrl" :name="displayAuthorName" size="sm" :alt-text="`${displayAuthorName} 的頭像`" class="shrink-0" />
        <button
          class="list-row-title-trigger -my-1 flex min-h-10 flex-1 items-center text-left"
          type="button"
          @click.stop="openDetails()"
        >
          <span class="line-clamp-1 font-semibold text-sm tracking-normal text-ink-900 dark:text-ink-50 hover:underline">
            <SearchHighlight :text="issue.title" :query="highlightQuery" />
          </span>
        </button>
      </div>
      <div class="mt-1.5 flex w-full items-center gap-2">
        <div class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden text-xs text-ink-500 dark:text-ink-400">
          <span class="min-w-0 truncate font-normal text-ink-400 dark:text-ink-500">
            {{ primaryTimeValueLabel }}
          </span>
          <template v-if="issue.support_enabled">
            <span class="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-ink-100/70 text-ink-700 font-medium dark:bg-ink-900/60 dark:text-ink-300">
              {{ supportCount }}/{{ issue.support_goal ?? 0 }} 附議
            </span>
          </template>
        </div>
        <div class="flex shrink-0 items-center justify-end gap-1.5">
          <!-- comment button -->
          <button
            type="button"
            class="button-toolbar h-10 w-10 rounded-full p-0 md:h-7 md:w-7"
            title="查看詳情"
            aria-label="查看詳情"
            @click.stop="openDetails('comments')"
          >
            <AppIcon name="comment" />
          </button>

          <VoteButtons
            v-if="issue.support_enabled"
            class="shrink-0"
            :issue-id="issue.id"
            :current-user-supported="currentUserSupported"
            :support-count="supportCount"
            :support-closed="supportClosed"
            :status-label="statusLabel"
            :compact="true"
            @supported="handleSupport"
          />

          <IssueAdminMenu
            v-if="isAdmin"
            :issue="issue"
            :compact="true"
            class="!space-y-0"
            @dropdown-open="(open) => isDropdownOpen = open"
            @message="(msg) => showActionToast(msg, 'success')"
            @error="(err) => showActionToast(err, 'error')"
            @status-changed="emit('issue-updated', $event)"
            @delete="confirmDelete"
          />
        </div>
      </div>
    </div>

    <!-- Desktop full row (hidden below md) -->
    <div
      class="issue-table-row hidden md:grid"
      data-list-row-trigger
      :style="{ 'grid-template-columns': tableCols }"
      role="row"
    >
      <div class="flex items-center w-24 shrink-0">
        <span class="tag" :class="statusClass">
          {{ statusLabel }}
        </span>
      </div>

      <div v-if="showAuthorCol" class="flex items-center gap-2 w-32 shrink-0 pr-2">
        <UserAvatar
          :photo-url="displayPhotoUrl"
          :name="displayAuthorName"
          size="sm"
          :alt-text="`${displayAuthorName} 的頭像`"
          class="author-avatar"
        />
        <span class="truncate text-xs font-normal text-ink-500 dark:text-ink-400" :title="displayAuthorName">
          {{ displayAuthorName }}
        </span>
      </div>

      <div class="flex items-center gap-2 flex-1 min-w-0 pr-3">
        <UserAvatar v-if="isOwnIssue && issueStoresAuthorPrivately(issue.category) && !isAdmin" :photo-url="displayPhotoUrl" :name="displayAuthorName" size="sm" :alt-text="`${displayAuthorName} 的頭像`" class="shrink-0" />
        <button
          type="button"
          class="list-row-title-trigger w-full py-1 text-left text-sm font-semibold tracking-tight text-ink-900 hover:text-ink-950 hover:underline dark:text-ink-100 dark:hover:text-white sm:text-base truncate"
          :title="issue.title"
          @click="openDetails()"
        >
          <SearchHighlight :text="issue.title" :query="highlightQuery" />
        </button>
      </div>

      <div class="flex items-center w-36 shrink-0 text-xs text-ink-400/90 dark:text-ink-500/90 whitespace-nowrap">
        {{ primaryTimeValueLabel }}
      </div>

      <div class="flex items-center w-36 shrink-0 pr-2">
        <div v-if="issue.support_enabled" class="w-full space-y-1 text-xs text-ink-500 dark:text-ink-400">
          <div class="flex items-center justify-between">
            <span class="font-medium text-ink-700 dark:text-ink-300">{{ supportCount }} / {{ issue.support_goal ?? 0 }}</span>
            <span v-if="supportRemainingLabel" class="font-medium text-ink-400 dark:text-ink-500">{{ supportRemainingLabel }}</span>
          </div>
          <div class="h-1.5 w-full overflow-hidden rounded-full bg-ink-200 dark:bg-ink-700" aria-hidden="true">
            <div
              class="h-full rounded-full bg-ink-900 transition-all duration-500 dark:bg-ink-100"
              :style="supportProgressStyle"
            ></div>
          </div>
        </div>
        <span v-else class="text-xs text-ink-400 dark:text-ink-500">不開放附議</span>
      </div>

      <div class="flex items-center gap-1 w-28 shrink-0">
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
        <button
          type="button"
          class="button-toolbar h-7 w-7 rounded-full p-0"
          title="查看詳情"
          aria-label="查看詳情"
          @click="openDetails('comments')"
        >
          <AppIcon name="comment" />
        </button>
      </div>

      <div class="flex items-center w-10 shrink-0">
        <IssueAdminMenu
          v-if="isAdmin"
          :issue="issue"
          :compact="true"
          class="!space-y-0"
          @dropdown-open="(open) => isDropdownOpen = open"
          @message="(msg) => showActionToast(msg, 'success')"
          @error="(err) => showActionToast(err, 'error')"
          @status-changed="emit('issue-updated', $event)"
          @delete="confirmDelete"
        />
      </div>
    </div>

    <ConfirmDialog
      :open="isDeleteDialogOpen"
      title="確定要刪除這筆提案嗎？"
      message="刪除後這筆提案將無法復原。"
      confirm-label="確認刪除"
      busy-label="刪除中..."
      :busy="isDeleting"
      @cancel="isDeleteDialogOpen = false"
      @confirm="performDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, toRef } from 'vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import IssueAdminMenu from '@/components/IssueAdminMenu.vue';
import VoteButtons from '@/components/VoteButtons.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import SearchHighlight from '@/components/ui/SearchHighlight.vue';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import { useIssueItemController } from '@/composables/useIssueItemController';
import { issueStoresAuthorPrivately } from '@/constants/categories';
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
  isOwnIssue,
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
  showActionToast,
} = useIssueItemController(
  toRef(props, 'issue'),
  'table-row',
  (payload) => emit('support-changed', payload),
  (payload) => emit('open-details', payload),
  (issue) => emit('issue-updated', issue),
  (issueId) => emit('issue-deleted', issueId),
);

const showAuthorCol = computed(() => !issueStoresAuthorPrivately(props.issue.category) || isAdmin.value);
const tableCols = computed(() => {
  const cols = ['6rem'];
  if (showAuthorCol.value) cols.push('8rem');
  cols.push('1fr', '8rem', '9rem', '7rem');
  if (isAdmin.value) cols.push('2.5rem');
  return cols.join(' ');
});
</script>
