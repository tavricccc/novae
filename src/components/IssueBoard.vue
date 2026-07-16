<template>
  <section class="relative flex min-h-0 flex-col gap-5">
    <BoardControls
      v-model:status-tab="statusTab"
      v-model:search-query="searchQuery"
      v-model:sort-option="sortOption"
      :active-filter="activeFilter"
      :active-category-label="activeCategoryLabel"
      :create-label="createLabel"
      :search-hint="searchHint"
      @create="openComposerForActiveCategory"
      @submit-search="submitSearch"
      @clear-search="clearSearch"
    />

    <div ref="boardScrollRef" class="scroll-shadow-bleed scrollbar-none min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain pb-4">
      <Transition name="panel-switch" mode="out-in">
        <div :key="boardPanelKey" class="space-y-4">
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

          <EmptyStatePanel
            v-else-if="currentIssues.length === 0"
            title="沒有符合條件的提案"
            :description="emptyStateDescription"
            icon="inbox"
          />

          <template v-else>
            <IssueBoardTable
              :issues="currentIssues"
              :loading="false"
              error=""
              :show-author="showAuthorCol"
              :highlight-query="committedSearchQuery"
              @open-details="openIssueDetails"
              @support-changed="handleSupportChanged"
              @issue-updated="handleIssueUpdatedFromList"
              @issue-deleted="handleIssueDeleted"
            />

            <div v-if="currentError" class="rounded-xl border border-error/20 bg-error-container px-4 py-3 text-sm font-semibold text-on-error-container">
              {{ currentError }}
            </div>

            <FeedLoadMoreControl
              :has-more="hasMoreCurrentData"
              :loading="currentLoadingMore"
              :error="Boolean(currentError)"
              @load-more="loadMoreCurrentData"
            />
            <div ref="loadMoreSentinel" class="h-1" aria-hidden="true"></div>
          </template>
        </div>
      </Transition>
    </div>
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
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import BoardControls from '@/components/BoardControls.vue';
import IssueBoardTable from '@/components/IssueBoardTable.vue';
import IssueComposer from '@/components/IssueComposer.vue';
import EmptyStatePanel from '@/components/ui/EmptyStatePanel.vue';
import FeedLoadMoreControl from '@/components/ui/FeedLoadMoreControl.vue';
import PageLoadFailure from '@/components/ui/PageLoadFailure.vue';
import { useIssueBoardData } from '@/composables/useIssueBoardData';
import { useInfiniteScroll } from '@/composables/useInfiniteScroll';
import { useMinimumLoading } from '@/composables/useMinimumLoading';
import { useLoadingTimeout } from '@/composables/useLoadingTimeout';
import { useSession } from '@/composables/useSession';
import { useActionFeedback } from '@/composables/useActionFeedback';
import { registerActiveNavigationRefreshHandler } from '@/composables/useActiveNavigationRefresh';
import { DEFAULT_ISSUE_CATEGORY, ISSUE_CATEGORY_LABELS, isIssueCategory, issueIsPrivateToOwner, issueStoresAuthorPrivately } from '@/constants/categories';
import { resetAppConnection } from '@/lib/reconnect';
import type { IssueCategory, IssueRecord } from '@/types';

type IssueDetailsOpenPayload = {
  issue: IssueRecord;
  initialTab: 'details' | 'comments';
};

let savedIssueBoardScrollKey = '';
let savedIssueBoardScrollTop = 0;

const props = defineProps<{
  isFormOpen?: boolean;
}>();

const emit = defineEmits<{
  'toggle-form': [];
}>();

const { canManageIssueCategory } = useSession();
const { show, start } = useActionFeedback();
const router = useRouter();
const route = useRoute();
const composerCategory = ref<IssueCategory>(DEFAULT_ISSUE_CATEGORY);
const boardScrollRef = ref<HTMLElement | null>(null);
const restoreBoardScrollPending = ref(false);
const manualRefreshing = ref(false);
const composerCategoryLabel = computed(() => ISSUE_CATEGORY_LABELS[composerCategory.value]);

const {
  activeFilter,
  statusTab,
  searchQuery,
  committedSearchQuery,
  submitSearch,
  clearSearch,
  sortOption,
  composerMessage,
  activeCategoryLabel,
  currentState,
  currentIssues,
  currentLoading,
  currentLoadingMore,
  currentError,
  isSearching,
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
const isAdmin = computed(() => activeFilter.value !== 'my-proposals' && canManageIssueCategory(activeFilter.value));
const createLabel = computed(() => isIssueCategory(activeFilter.value)
  ? `新增到${activeCategoryLabel.value}`
  : undefined);

const showAuthorCol = computed(() => isAdmin.value || !issueStoresAuthorPrivately(activeFilter.value));
const contentContextKey = computed(() => [
  activeFilter.value,
  statusTab.value,
  isSearching.value ? 'search' : 'browse',
].join(':'));
const boardPanelKey = computed(() => [
  activeFilter.value,
  statusTab.value,
  sortOption.value,
  isSearching.value ? committedSearchQuery.value.trim() : '',
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
  || Boolean(currentError.value)
);
async function retryCurrentData() {
  await resetAppConnection();
  await refreshCurrentData();
}
async function handleManualRefresh() {
  if (manualRefreshing.value) return;
  manualRefreshing.value = true;
  const feedbackHandle = start('正在更新提案');
  try {
    await refreshCurrentData();
    feedbackHandle.succeed('提案已更新');
  } catch {
    feedbackHandle.fail('提案更新失敗，請稍後再試');
  } finally {
    manualRefreshing.value = false;
  }
}
registerActiveNavigationRefreshHandler(handleManualRefresh);
const { sentinel: loadMoreSentinel } = useInfiniteScroll({
  disabled: infiniteScrollDisabled,
  onLoadMore: loadMoreCurrentData,
  root: boardScrollRef,
});
const emptyStateDescription = computed(() => {
  if (showEmptySearchResult.value) {
    return `沒有找到與關鍵字「${committedSearchQuery.value}」相關的提案。`;
  }
  if (issueIsPrivateToOwner(activeFilter.value) && !isAdmin.value) {
    return `${activeCategoryLabel.value}分類只會顯示你自己提出的提案；你目前還沒有符合目前狀態的提案。`;
  }
  const statusLabel = statusTab.value === 'active' ? '進行中' : '已結案';
  return `目前在「${activeCategoryLabel.value}」分類中沒有${statusLabel}提案。`;
});
function issueBoardScrollKey() {
  return [
    activeFilter.value,
    statusTab.value,
    sortOption.value,
    committedSearchQuery.value,
  ].join(':');
}

function issueStatusQuery() {
  return statusTab.value === 'closed' ? { status: 'closed' } : {};
}

async function openIssueDetails(payload: IssueDetailsOpenPayload) {
  savedIssueBoardScrollKey = issueBoardScrollKey();
  savedIssueBoardScrollTop = boardScrollRef.value?.scrollTop ?? 0;
  await router.push({
    name: 'issue-detail',
    params: {
      filter: activeFilter.value,
      issueId: payload.issue.id,
    },
    query: {
      ...issueStatusQuery(),
      ...(payload.initialTab === 'comments' ? { tab: 'comments' } : {}),
    },
  });
}

function restoreIssueBoardScroll() {
  if (!restoreBoardScrollPending.value || currentLoading.value) return;
  const scrollElement = boardScrollRef.value;
  if (!scrollElement) return;

  restoreBoardScrollPending.value = false;
  void nextTick(() => {
    scrollElement.scrollTo({ top: savedIssueBoardScrollTop, left: 0, behavior: 'auto' });
  });
}

function handleIssueUpdatedFromList(issue: IssueRecord) {
  void handleIssueUpdated(issue);
}

function openComposerForCategory(category: IssueCategory) {
  composerCategory.value = category;
  if (!props.isFormOpen) {
    emit('toggle-form');
  }
}

function openComposerForActiveCategory() {
  if (isIssueCategory(activeFilter.value)) openComposerForCategory(activeFilter.value);
}

watch(
  () => route.query.status,
  (status) => {
    const nextStatus = status === 'closed' ? 'closed' : 'active';
    if (statusTab.value !== nextStatus) {
      statusTab.value = nextStatus;
    }
  },
  { immediate: true },
);

onMounted(() => {
  restoreBoardScrollPending.value = savedIssueBoardScrollKey === issueBoardScrollKey();
  restoreIssueBoardScroll();
});

watch(
  () => [currentLoading.value, currentIssues.value.length] as const,
  restoreIssueBoardScroll,
);

watch(statusTab, (tab) => {
  if (route.name !== 'issues') return;
  const query = { ...route.query };
  if (tab === 'closed') {
    query.status = 'closed';
  } else {
    delete query.status;
  }
  void router.replace({ query });
});

watch(composerMessage, (message) => {
  if (message) {
    show(message, 'success');
  }
});
</script>
