<template>
  <section class="relative flex min-h-0 flex-col gap-5">
    <BoardControls
      v-model:status-tab="statusTab"
      v-model:search-query="searchQuery"
      v-model:sort-option="sortOption"
      :active-filter="activeFilter"
      :active-category-label="activeCategoryLabel"
      :search-hint="searchHint"
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

    <IssueCreateFab
      :visible="showToggle && activeFilter !== 'my-proposals'"
      :default-category="defaultComposerCategory"
      @create="openComposerForCategory"
    />
  </section>

  <IssueComposer
    :open="isFormOpen"
    :category="composerCategory"
    :category-label="composerCategoryLabel"
    @close="emit('toggle-form')"
    @submitted="handleIssueSubmitted"
  />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import BoardControls from '@/components/BoardControls.vue';
import IssueCreateFab from '@/components/IssueCreateFab.vue';
import IssueBoardTable from '@/components/IssueBoardTable.vue';
import IssueComposer from '@/components/IssueComposer.vue';
import EmptyStatePanel from '@/components/ui/EmptyStatePanel.vue';
import PageLoadFailure from '@/components/ui/PageLoadFailure.vue';
import SkeletonTable from '@/components/ui/SkeletonTable.vue';
import { useIssueBoardData } from '@/composables/useIssueBoardData';
import { useInfiniteScroll } from '@/composables/useInfiniteScroll';
import { useMinimumLoading } from '@/composables/useMinimumLoading';
import { useLoadingTimeout } from '@/composables/useLoadingTimeout';
import { useSession } from '@/composables/useSession';
import { useToast } from '@/composables/useToast';
import { DEFAULT_ISSUE_CATEGORY, ISSUE_CATEGORY_LABELS, issueIsPrivateToOwner, issueStoresAuthorPrivately } from '@/constants/categories';
import { resetAppConnection } from '@/lib/reconnect';
import type { IssueCategory, IssueRecord } from '@/types';

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

const { isAdmin } = useSession();
const { showToast } = useToast();
const router = useRouter();
const composerCategory = ref<IssueCategory>(DEFAULT_ISSUE_CATEGORY);
const composerCategoryLabel = computed(() => ISSUE_CATEGORY_LABELS[composerCategory.value]);

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
  currentError,
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

const showAuthorCol = computed(() => isAdmin.value || !issueStoresAuthorPrivately(activeFilter.value));
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
const defaultComposerCategory = computed(() =>
  activeFilter.value === 'my-proposals' ? DEFAULT_ISSUE_CATEGORY : activeFilter.value
);

async function openIssueDetails(payload: IssueDetailsOpenPayload) {
  await router.push({
    name: 'issue-detail',
    params: {
      filter: activeFilter.value,
      issueId: payload.issue.id,
    },
    query: payload.initialTab === 'comments' ? { tab: 'comments' } : undefined,
  });
}

function handleIssueUpdatedFromList(issue: IssueRecord) {
  handleIssueUpdated(issue);
}

function openComposerForCategory(category: IssueCategory) {
  composerCategory.value = category;
  emit('toggle-form');
}

watch(composerMessage, (message) => {
  if (message) {
    showToast(message, 'success');
  }
});
</script>
