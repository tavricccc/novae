<template>
  <section class="relative flex min-h-0 flex-col gap-5">
    <BoardControls
      v-model:status-tab="statusTab"
      v-model:search-query="searchQuery"
      v-model:sort-option="sortOption"
      :active-filter="activeFilter"
      :active-category-label="activeCategoryLabel"
      :search-hint="searchHint"
      :refreshing="manualRefreshing"
      @refresh="handleManualRefresh"
    >
      <template #actions>
        <CreateActionMenu
          v-if="showToggle && activeFilter !== 'my-proposals'"
          :can-create-announcement="isAdmin"
          :default-category="defaultComposerCategory"
          @create-announcement="handleCreateAnnouncement"
          @create-issue="openComposerForCategory"
        >
          <template #trigger="{ open }">
            <button
              type="button"
              class="button-icon-filled hidden md:flex !h-9 !w-9 items-center justify-center shrink-0"
              title="新增"
              aria-label="新增"
              @click="open"
            >
              <AppIcon name="plus" :size="4" :stroke-width="2.5" />
            </button>
          </template>
        </CreateActionMenu>
      </template>
    </BoardControls>

    <div ref="boardScrollRef" class="scrollbar-none min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pb-4">
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
import CreateActionMenu from '@/components/CreateActionMenu.vue';
import IssueBoardTable from '@/components/IssueBoardTable.vue';
import IssueComposer from '@/components/IssueComposer.vue';
import EmptyStatePanel from '@/components/ui/EmptyStatePanel.vue';
import PageLoadFailure from '@/components/ui/PageLoadFailure.vue';
import SkeletonTable from '@/components/ui/SkeletonTable.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import { useIssueBoardData } from '@/composables/useIssueBoardData';
import { useInfiniteScroll } from '@/composables/useInfiniteScroll';
import { useMinimumLoading } from '@/composables/useMinimumLoading';
import { useLoadingTimeout } from '@/composables/useLoadingTimeout';
import {
  CREATE_ENTRY_CATEGORY_QUERY_KEY,
  CREATE_ENTRY_QUERY_KEY,
  CREATE_ISSUE_QUERY_VALUE,
  registerCreateIssueHandler,
  requestCreateAnnouncement,
} from '@/composables/useCreateEntryActions';
import { useSession } from '@/composables/useSession';
import { useToast } from '@/composables/useToast';
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
  showToggle?: boolean;
}>();

const emit = defineEmits<{
  'toggle-form': [];
}>();

const { isAdmin } = useSession();
const { showProgressToast, showToast } = useToast();
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
const boardPanelKey = computed(() => [
  activeFilter.value,
  statusTab.value,
  sortOption.value,
  isSearching.value ? searchQuery.value.trim() : '',
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
async function handleManualRefresh() {
  if (manualRefreshing.value) return;
  manualRefreshing.value = true;
  const progressToast = showProgressToast('正在更新提案...');
  try {
    await refreshCurrentData();
    progressToast.succeed('提案已更新。');
  } catch {
    progressToast.fail('提案更新失敗，請稍後再試。');
  } finally {
    manualRefreshing.value = false;
  }
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

function issueBoardScrollKey() {
  return [
    activeFilter.value,
    statusTab.value,
    sortOption.value,
    searchQuery.value,
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

async function handleCreateAnnouncement() {
  await requestCreateAnnouncement(router);
}

async function clearCreateQuery() {
  const query = { ...route.query };
  delete query[CREATE_ENTRY_QUERY_KEY];
  delete query[CREATE_ENTRY_CATEGORY_QUERY_KEY];
  await router.replace({ query });
}

registerCreateIssueHandler(openComposerForCategory);

watch(
  () => [route.query[CREATE_ENTRY_QUERY_KEY], route.query[CREATE_ENTRY_CATEGORY_QUERY_KEY]],
  ([createType, categoryParam]) => {
    if (createType !== CREATE_ISSUE_QUERY_VALUE) return;
    const categoryValue = Array.isArray(categoryParam) ? categoryParam[0] : categoryParam;
    openComposerForCategory(isIssueCategory(categoryValue) ? categoryValue : DEFAULT_ISSUE_CATEGORY);
    void clearCreateQuery();
  },
  { immediate: true },
);

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
    showToast(message, 'success');
  }
});
</script>
