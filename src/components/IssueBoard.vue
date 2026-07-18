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

    <div ref="boardScrollRef" class="route-scroll-through scroll-shadow-bleed scrollbar-none min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain">
      <ContentListState
        :empty="currentIssues.length === 0"
        :empty-description="emptyStateDescription"
        empty-title="issue.noEligibleProposals"
        :error="currentError"
        error-title="issue.proposalReadingFailed"
        :has-more="hasMoreCurrentData"
        :loading="visibleContentLoading"
        :loading-has-problem="contentLoadingHasProblem"
        :loading-more="currentLoadingMore"
        :panel-key="boardPanelKey"
        :problem-description="contentProblemDescription"
        :problem-title="contentProblemTitle"
        :retry-disabled="!contentOnline"
        @load-more="loadMoreCurrentData"
        @retry="retryCurrentData"
      >
        <template #loading>
          <IssueBoardTable
            :issues="[]"
            :loading="true"
            error=""
            :show-author="showAuthorCol"
          />
        </template>

        <template #loading-more>
          <IssueBoardTable
            :issues="[]"
            :loading="true"
            error=""
            :show-author="showAuthorCol"
          />
        </template>

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

        <template #sentinel>
          <div ref="loadMoreSentinel" class="h-1" aria-hidden="true"></div>
        </template>
      </ContentListState>
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
import ContentListState from '@/components/ui/organisms/ContentListState.vue';
import { useIssueBoardData } from '@/composables/useIssueBoardData';
import { useContentListRuntime } from '@/composables/useContentListRuntime';
import { useSession } from '@/composables/useSession';
import { useActionFeedback } from '@/composables/useActionFeedback';
import { DEFAULT_ISSUE_CATEGORY, ISSUE_CATEGORY_LABELS, isIssueCategory, issueIsPrivateToOwner, issueStoresAuthorPrivately } from '@/constants/categories';
import type { IssueCategory, IssueRecord } from '@/types';
import { useI18n } from '@/i18n';

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
const { show } = useActionFeedback();
const { t } = useI18n();
const router = useRouter();
const route = useRoute();
const composerCategory = ref<IssueCategory>(DEFAULT_ISSUE_CATEGORY);
const boardScrollRef = ref<HTMLElement | null>(null);
const restoreBoardScrollPending = ref(false);
const composerCategoryLabel = computed(() => t(ISSUE_CATEGORY_LABELS[composerCategory.value]));

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
  ? t('issue.addToCategory', { category: t(activeCategoryLabel.value) })
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
const {
  isOnline: contentOnline,
  loadMoreSentinel,
  loadingHasProblem: contentLoadingHasProblem,
  problemDescription: contentProblemDescription,
  problemTitle: contentProblemTitle,
  retry: retryCurrentData,
  visibleLoading: visibleContentLoading,
} = useContentListRuntime({
  error: currentError,
  hasMore: hasMoreCurrentData,
  loadMore: loadMoreCurrentData,
  loading: rawContentLoading,
  loadingMore: currentLoadingMore,
  loadingTrigger: contentContextKey,
  refresh: refreshCurrentData,
  refreshFeedback: {
    error: 'issue.proposalUpdateFailedPleaseTryAgainLater',
    loading: 'issue.updatingProposal',
    success: 'issue.proposalUpdated',
  },
  scrollRoot: boardScrollRef,
});
const emptyStateDescription = computed(() => {
  if (showEmptySearchResult.value) {
    return t('issue.noProposalsMatchQuery', { query: committedSearchQuery.value });
  }
  if (issueIsPrivateToOwner(activeFilter.value) && !isAdmin.value) {
    return t('issue.onlyYouCanViewYourProposalsInCategory', { category: t(activeCategoryLabel.value) });
  }
  const statusLabel = t(statusTab.value === 'active' ? 'issue.inProgress' : 'facility.caseClosed');
  return t('issue.noCategoryProposalsInStatus', {
    category: t(activeCategoryLabel.value),
    status: statusLabel,
  });
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
