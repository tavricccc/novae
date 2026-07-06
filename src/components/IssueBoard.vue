<template>
  <section class="relative flex min-h-0 flex-col gap-5">
    <BoardControls
      v-model:status-tab="statusTab"
      v-model:search-query="searchQuery"
      v-model:sort-option="sortOption"
      :active-filter="activeFilter"
      :show-toggle="showToggle"
      :active-category-label="activeCategoryLabel"
      :search-hint="searchHint"
      :refreshing="currentRefreshing"
      @refresh="refreshCurrentData"
      @toggle-form="emit('toggle-form')"
    />

    <ListUpdatePrompt
      :show="showIssueUpdatePrompt"
      message="提案列表有更新"
      action-label="查看最新提案"
      loading-label="更新中..."
      :loading="currentRefreshing"
      @action="refreshCurrentData"
    />

    <div class="scrollbar-none min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pb-4">
      <PageLoadFailure
        v-if="contentLoadingHasProblem"
        :title="contentProblemTitle"
        :description="contentProblemDescription"
        :retry-disabled="!contentOnline"
        @retry="retryCurrentData"
      />

      <template v-else-if="visibleContentLoading">
        <IssueBoardTable
          :issues="[]"
          :loading="true"
          error=""
          :show-author="showAuthorCol"
        />
      </template>

      <EmptyStatePanel
        v-else-if="currentError && currentIssues.length === 0"
        title="提案讀取失敗"
        :description="currentError"
        icon="warning"
        tone="danger"
        action-label="重新整理"
        @action="retryCurrentData"
      />

      <Transition v-else-if="currentIssues.length === 0" name="board-content" appear>
        <EmptyStatePanel
          title="沒有符合條件的提案"
          :description="emptyStateDescription"
          icon="inbox"
        />
      </Transition>

      <template v-else>
        <IssueBoardTable
          :issues="currentIssues"
          :loading="false"
          error=""
          :show-author="showAuthorCol"
          :highlight-query="searchQuery"
          @open-details="openIssueDetails"
          @support-changed="handleSupportChanged"
          @issue-updated="handleIssueUpdatedFromList"
          @issue-deleted="handleIssueDeleted"
        />

        <div v-if="currentError" class="rounded-xl border border-error/20 bg-error-container px-4 py-3 text-sm font-semibold text-on-error-container">
          {{ currentError }}
        </div>

        <SkeletonTable
          v-if="currentLoadingMore"
          :rows="3"
          :show-author="showAuthorCol"
          :is-admin="isAdmin"
        />

        <div ref="loadMoreSentinel" class="h-1" aria-hidden="true"></div>
      </template>
    </div>
  </section>

  <IssueComposer
    :open="isFormOpen"
    :category="activeFilter === 'my-proposals' ? DEFAULT_ISSUE_CATEGORY : activeFilter"
    :category-label="activeCategoryLabel"
    @close="emit('toggle-form')"
    @submitted="handleIssueSubmitted"
  />

  <IssueDetailsDialog
    v-if="routeIssue"
    :open="true"
    :issue="routeIssue"
    :current-user-supported="Boolean(routeIssue.currentUserSupported)"
    :support-count="routeIssue.support_count"
    :support-closed="routeIssueSupportClosed"
    :initial-tab="routeIssueInitialTab"
    @close="closeIssueDetails"
    @content-unavailable="handleRouteIssueUnavailable"
    @delete="confirmRouteIssueDelete"
    @issue-updated="handleIssueUpdatedFromList"
    @share="copyRouteIssueUrl"
    @supported="handleRouteIssueSupport"
  />

  <ConfirmDialog
    :open="isRouteIssueDeleteDialogOpen"
    title="確定要刪除這筆提案嗎？"
    message="刪除後這筆提案將無法復原。"
    confirm-label="確認刪除"
    busy-label="刪除中..."
    :busy="isRouteIssueDeleting"
    @cancel="closeRouteIssueDeleteDialog"
    @confirm="performRouteIssueDelete"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import BoardControls from '@/components/BoardControls.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import IssueBoardTable from '@/components/IssueBoardTable.vue';
import IssueComposer from '@/components/IssueComposer.vue';
import IssueDetailsDialog from '@/components/IssueDetailsDialog.vue';
import ListUpdatePrompt from '@/components/ListUpdatePrompt.vue';
import EmptyStatePanel from '@/components/ui/EmptyStatePanel.vue';
import PageLoadFailure from '@/components/ui/PageLoadFailure.vue';
import SkeletonTable from '@/components/ui/SkeletonTable.vue';
import { useIssueBoardData } from '@/composables/useIssueBoardData';
import { useDeleteIssue } from '@/composables/useDeleteIssue';
import { useIssueRouteDialog } from '@/composables/useIssueRouteDialog';
import { useInfiniteScroll } from '@/composables/useInfiniteScroll';
import { useMinimumLoading } from '@/composables/useMinimumLoading';
import { useLoadingTimeout } from '@/composables/useLoadingTimeout';
import { useSession } from '@/composables/useSession';
import { useShareUrl } from '@/composables/useShareUrl';
import { useToast } from '@/composables/useToast';
import { DEFAULT_ISSUE_CATEGORY, issueIsPrivateToOwner, issueStoresAuthorPrivately } from '@/constants/categories';
import { resetAppConnection } from '@/lib/reconnect';
import type { IssueRecord } from '@/types';

type IssueDetailsOpenPayload = {
  issue: IssueRecord;
  initialTab: 'details' | 'comments';
};

defineProps<{
  isFormOpen?: boolean;
  showToggle?: boolean;
}>();

const emit = defineEmits<{
  'toggle-form': [];
}>();

const { isAdmin, mySupportedIssueIds } = useSession();
const { showToast } = useToast();
const { copyShareUrl } = useShareUrl();
const router = useRouter();
const routeIssueInitialTab = ref<'details' | 'comments'>('details');

const {
  activeFilter,
  statusTab,
  searchQuery,
  sortOption,
  composerMessage,
  activeCategoryLabel,
  currentState,
  currentIssues,
  currentLoading,
  currentLoadingMore,
  currentRefreshing,
  currentError,
  showIssueUpdatePrompt,
  isSearching,
  isGlobalMode,
  searchHint,
  showEmptySearchResult,
  hasMoreCurrentData,
  loadMoreCurrentData,
  handleSupportChanged,
  handleIssueSubmitted,
  handleIssueUpdated,
  handleIssueDeleted,
  refreshCurrentData,
} = useIssueBoardData();

const {
  routeIssue,
  routeIssueSupportClosed,
  closeRouteIssue,
  prefillRouteIssue,
  patchRouteIssue,
  updateRouteIssueSupport,
} = useIssueRouteDialog(mySupportedIssueIds, currentIssues);

const showAuthorCol = computed(() => isAdmin.value || !issueStoresAuthorPrivately(activeFilter.value));
const routeIssueId = computed(() => routeIssue.value?.id ?? '');
const {
  isDeleteDialogOpen: isRouteIssueDeleteDialogOpen,
  isDeleting: isRouteIssueDeleting,
  actionError: routeIssueDeleteError,
  confirmDelete: openRouteIssueDeleteDialog,
  closeDeleteDialog: closeRouteIssueDeleteDialog,
  performDelete: deleteRouteIssue,
} = useDeleteIssue(routeIssueId);
const contentContextKey = computed(() => [
  activeFilter.value,
  statusTab.value,
  isSearching.value ? 'search' : 'browse',
].join(':'));
const rawContentLoading = computed(() => currentLoading.value);
const { visibleLoading: visibleContentLoading } = useMinimumLoading(rawContentLoading, {
  trigger: contentContextKey,
});
const {
  hasProblem: contentLoadingHasProblem,
  isOnline: contentOnline,
  problemDescription: contentProblemDescription,
  problemTitle: contentProblemTitle,
} = useLoadingTimeout(rawContentLoading, 5_000);
const infiniteScrollDisabled = computed(() =>
  !hasMoreCurrentData.value
  || currentLoading.value
  || currentLoadingMore.value
  || (isGlobalMode.value && activeFilter.value !== 'my-proposals')
);
async function retryCurrentData() {
  await resetAppConnection();
  await refreshCurrentData();
}
const { sentinel: loadMoreSentinel } = useInfiniteScroll({
  disabled: infiniteScrollDisabled,
  onLoadMore: loadMoreCurrentData,
});
const emptyStateDescription = computed(() => {
  if (showEmptySearchResult.value) {
    return `沒有找到與關鍵字「${searchQuery.value}」相關的提案。`;
  }
  if (issueIsPrivateToOwner(activeFilter.value) && !isAdmin.value) {
    return `${activeCategoryLabel.value}分類只會顯示你自己提出的提案；你目前還沒有符合目前狀態的提案。`;
  }
  const statusLabel = statusTab.value === 'active' ? '進行中' : '已結案';
  return `目前在「${activeCategoryLabel.value}」分類中沒有${statusLabel}提案。`;
});

async function openIssueDetails(payload: IssueDetailsOpenPayload) {
  routeIssueInitialTab.value = payload.initialTab;
  prefillRouteIssue(payload.issue);

  try {
    await router.push({
      name: 'issue-detail',
      params: {
        filter: activeFilter.value,
        issueId: payload.issue.id,
      },
    });
  } catch {
    closeRouteIssue();
  }
}

function getIssueShareUrl(issueId: string) {
  const href = router.resolve({
    name: 'issue-detail',
    params: {
      filter: activeFilter.value,
      issueId,
    },
  }).href;
  return new URL(href, window.location.origin).toString();
}

function copyRouteIssueUrl() {
  if (!routeIssue.value) return;
  copyShareUrl(getIssueShareUrl(routeIssue.value.id));
}

function closeIssueDetails() {
  routeIssueInitialTab.value = 'details';
  closeRouteIssue();
}

function confirmRouteIssueDelete() {
  if (!routeIssue.value) return;
  openRouteIssueDeleteDialog();
}

async function performRouteIssueDelete() {
  const deletedIssueId = await deleteRouteIssue();
  if (routeIssueDeleteError.value) {
    showToast(routeIssueDeleteError.value, 'error');
    return;
  }

  showToast('提案已刪除。', 'success');
  if (deletedIssueId) {
    handleIssueDeleted(deletedIssueId);
  }
  closeRouteIssueDeleteDialog();
  closeIssueDetails();
}

function handleRouteIssueSupport(payload: { supported: boolean; supportCount: number }) {
  if (!routeIssue.value) return;
  updateRouteIssueSupport(payload.supported, payload.supportCount);
  handleSupportChanged({
    issueId: routeIssue.value.id,
    supported: payload.supported,
    supportCount: routeIssue.value.support_count,
  });
}

function handleRouteIssueUnavailable(issueId: string) {
  handleIssueDeleted(issueId);
  if (routeIssue.value?.id === issueId) {
    closeIssueDetails();
  }
}

function handleIssueUpdatedFromList(issue: IssueRecord) {
  handleIssueUpdated(issue);
  patchRouteIssue(issue);
}

watch(routeIssue, (issue) => {
  if (!issue) {
    routeIssueInitialTab.value = 'details';
  }
});

watch(composerMessage, (message) => {
  if (message) {
    showToast(message, 'success');
  }
});
</script>
