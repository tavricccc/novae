import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { registerAppResumeHandler } from '@/composables/useAppResume';
import { ISSUE_FILTER_OPTIONS } from '@/constants/categories';
import { APP_NAME } from '@/constants/app';
import { useDocumentTitle } from '@/composables/useDocumentTitle';
import { useFilter } from '@/composables/useFilter';
import { useIssueBoardPagination } from '@/composables/useIssueBoardPagination';
import { useIssueBuckets } from '@/composables/useIssueBuckets';
import { useIssueSearch } from '@/composables/useIssueSearch';
import { useNetworkStatus } from '@/composables/useNetworkStatus';
import { useSession } from '@/composables/useSession';
import { useTimedMessage } from '@/composables/useTimedMessage';
import { useUserIssuesData } from '@/composables/useUserIssuesData';
import {
  markContentRealtimeReliable,
  markContentRealtimeUnreliable,
  markContentWentOffline,
  shouldRefreshContentAfterResume,
} from '@/services/content-read-cache';
import { subscribeContentRealtimeEvents } from '@/services/realtime-events';
import { fetchIssueRecordById } from '@/services/issues';
import type { IssueRecord, IssueSortOption } from '@/types';

export function useIssueBoardData() {
  const { user, isAdmin, isAllowedUser, mySupportedIssueIds, roleLoading } = useSession();
  const { isOnline } = useNetworkStatus();
  const { activeFilter } = useFilter();

  const statusTab = ref<'active' | 'closed'>('active');
  const sortOption = ref<IssueSortOption>('latest');
  const defaultDocumentTitle = APP_NAME;
  const userUid = computed(() => user.value?.uid ?? '');
  const { message: composerMessage, showMessage: showComposerMessage } = useTimedMessage();

  const filterOptions = computed(() => [
    ...ISSUE_FILTER_OPTIONS,
    { value: 'my-proposals' as const, label: '我的提案' },
  ]);

  const activeCategoryLabel = computed(() => {
    if (activeFilter.value === 'my-proposals') {
      return '我的提案';
    }
    return filterOptions.value.find((option) => option.value === activeFilter.value)?.label ?? '提案';
  });

  const { restoreDocumentTitle } = useDocumentTitle(activeCategoryLabel, defaultDocumentTitle);

  const supportedIssueIds = mySupportedIssueIds;
  const currentPageSize = computed(() => 20);

  const {
    activeState,
    closedState,
    activateBucket,
    refreshBucket,
    loadMoreBucket,
    addIssueToBucket,
    removeIssueFromBuckets,
    invalidateIssueBuckets,
    upsertIssueAcrossBuckets,
    patchCachedIssues,
  } = useIssueBuckets({ user, activeFilter, isAdmin, supportedIssueIds, currentPageSize, sortOption });

  const {
    searchQuery,
    isSearching,
    canSearchGlobally,
    searchHint,
    searchState,
    filterIssues,
    addSearchIssue,
    removeSearchIssue,
    patchSearchIssue,
    resetSearchResults,
  } = useIssueSearch({
    activeFilter,
    statusBucket: statusTab,
    userUid,
    isAdmin,
    sortOption,
    supportedIssueIds,
  });

  const {
    userIssuesState,
    hasMoreUserIssues,
    loadMoreUserIssues,
    visibleUserIssues,
    addUserIssue,
    removeUserIssue,
    bumpUserIssuesRequestToken,
    stopUserIssuesRequest,
    loadCurrentUserIssues,
  } = useUserIssuesData(activeFilter, userUid, isAllowedUser, supportedIssueIds, sortOption, currentPageSize);

  const {
    globalPage,
    isGlobalMode,
    globalTotalPages,
    globalCurrentPageIssues,
  } = useIssueBoardPagination({
    activeFilter,
    statusTab,
    searchQuery,
    canSearchGlobally,
    isSearching,
    searchIssues: computed(() => searchState.issues),
    userIssues: visibleUserIssues,
    pageSize: currentPageSize,
    filterIssues,
  });
  let realtimeUnsubscribe: (() => void) | null = null;
  const LIST_REVALIDATE_INTERVAL_MS = 60_000;
  const unregisterResumeHandler = registerAppResumeHandler(() => {
    if (!isAllowedUser.value) return;
    const updatedAt = activeFilter.value === 'my-proposals'
      ? userIssuesState.updatedAt
      : currentState.value.updatedAt;
    if (!shouldRefreshContentAfterResume(updatedAt)) return;
    void refreshCurrentData();
  });

  const filteredActiveIssues = computed(() => {
    if (isGlobalMode.value && statusTab.value === 'active') {
      return globalCurrentPageIssues.value;
    }
    return filterIssues(activeState.value.issues);
  });

  const filteredClosedIssues = computed(() => {
    if (isGlobalMode.value && statusTab.value === 'closed') {
      return globalCurrentPageIssues.value;
    }
    return filterIssues(closedState.value.issues);
  });

  const currentState = computed(() => statusTab.value === 'active' ? activeState.value : closedState.value);
  const currentIssues = computed(() => statusTab.value === 'active'
    ? filteredActiveIssues.value
    : filteredClosedIssues.value
  );
  const currentLoading = computed(() => {
    if (activeFilter.value === 'my-proposals') return userIssuesState.loading;
    if (isSearching.value && isGlobalMode.value) return searchState.loading;
    return currentState.value.loading;
  });
  const currentLoadingMore = computed(() => {
    if (activeFilter.value === 'my-proposals') return userIssuesState.loadingMore;
    return currentState.value.loadingMore;
  });
  const currentError = computed(() => {
    if (activeFilter.value === 'my-proposals') return userIssuesState.error;
    if (isSearching.value && isGlobalMode.value) return searchState.error;
    return currentState.value.error;
  });

  const showEmptySearchResult = computed(() =>
    isSearching.value &&
    !currentLoading.value &&
    !currentError.value &&
    currentIssues.value.length === 0
  );

  function patchIssueAcrossBuckets(issueId: string, updater: (issue: IssueRecord) => IssueRecord) {
    patchCachedIssues(issueId, updater);
    patchSearchIssue(issueId, updater);
    userIssuesState.allIssues = userIssuesState.allIssues.map((issue) =>
      issue.id === issueId ? updater(issue) : issue
    );
  }

  function handleSupportChanged(payload: { issueId: string; supported: boolean; supportCount?: number }) {
    const nextIds = new Set(supportedIssueIds.value);
    if (payload.supported) {
      nextIds.add(payload.issueId);
    } else {
      nextIds.delete(payload.issueId);
    }
    supportedIssueIds.value = nextIds;

    patchIssueAcrossBuckets(payload.issueId, (issue) => ({
      ...issue,
      currentUserSupported: payload.supported,
      support_count: typeof payload.supportCount === 'number' ? payload.supportCount : issue.support_count,
    }));
  }

  function handleIssueSubmitted(issue: IssueRecord) {
    showComposerMessage('提案已送出。');
    addIssueToBucket(issue);
    addSearchIssue(issue);
    addUserIssue(issue);
  }

  function handleIssueUpdated(issue: IssueRecord) {
    upsertIssueAcrossBuckets(issue);
    removeSearchIssue(issue.id);
    addSearchIssue(issue);
    if (issue.author_uid === userUid.value) {
      addUserIssue(issue);
    } else {
      removeUserIssue(issue.id);
    }
  }

  function handleIssueDeleted(issueId: string) {
    removeIssueFromBuckets(issueId);
    removeSearchIssue(issueId);
    removeUserIssue(issueId);
  }

  watch(
    () => [
      user.value?.uid ?? '',
      activeFilter.value,
      isAdmin.value,
      isAllowedUser.value,
      currentPageSize.value,
      sortOption.value,
    ] as const,
    () => {
      activateBucket(statusTab.value);
    },
    { immediate: true },
  );

  watch(statusTab, (newTab) => {
    if (newTab === 'closed' && sortOption.value !== 'latest') {
      sortOption.value = 'latest';
      return;
    }
    activateBucket(newTab);
  });

  watch(sortOption, () => {
    activateBucket(statusTab.value);
  });

  watch(activeFilter, () => {
    searchQuery.value = '';
  });

  watch(
    () => [
      isAllowedUser.value,
      roleLoading.value,
      user.value?.uid ?? '',
      activeFilter.value,
      statusTab.value,
    ] as const,
    ([allowed, waitingForRole, uid]) => {
      realtimeUnsubscribe?.();
      realtimeUnsubscribe = null;
      if (!allowed || waitingForRole || !uid) return;

      realtimeUnsubscribe = subscribeContentRealtimeEvents(
        `issues:${uid}:${activeFilter.value}:${statusTab.value}`,
        (event) => {
          if (event.eventType === 'issue_support_changed') {
            if (event.supportCount === null) return;
            if (activeFilter.value !== 'my-proposals' && event.category !== activeFilter.value) return;
            patchIssueAcrossBuckets(event.targetId, (issue) => ({
              ...issue,
              support_count: event.supportCount ?? issue.support_count,
            }));
            if (sortOption.value === 'most-supported') void refreshCurrentData();
            return;
          }
          if (event.eventType !== 'issue_changed') return;
          invalidateIssueBuckets();
          if (event.op === 'delete') {
            handleIssueDeleted(event.targetId);
            return;
          }
          if (activeFilter.value !== 'my-proposals' && event.category !== activeFilter.value) {
            removeIssueFromBuckets(event.targetId);
            invalidateIssueBuckets();
            return;
          }
          void fetchIssueRecordById(event.targetId, {
            cacheScope: `realtime:${userUid.value}`,
            forceRefresh: true,
          }).then(handleIssueUpdated).catch(() => {
            handleIssueDeleted(event.targetId);
          });
        },
        () => {
          markContentRealtimeUnreliable();
          void refreshCurrentData();
        },
      );
    },
    { immediate: true },
  );

  async function refreshCurrentData() {
    document.documentElement.classList.add('no-transitions');
    resetSearchResults();
    stopUserIssuesRequest();

    if (activeFilter.value === 'my-proposals') {
      bumpUserIssuesRequestToken();
      await loadCurrentUserIssues({ silent: true });
    } else {
      await refreshBucket(statusTab.value);
    }
    markContentRealtimeReliable();

    setTimeout(() => {
      document.documentElement.classList.remove('no-transitions');
    }, 500);
  }

  function loadMoreCurrentData() {
    if (activeFilter.value === 'my-proposals') {
      void loadMoreUserIssues();
      return;
    }
    if (isGlobalMode.value) return;
    loadMoreBucket(statusTab.value);
  }

  const hasMoreCurrentData = computed(() => {
    if (activeFilter.value === 'my-proposals') return hasMoreUserIssues.value;
    if (isGlobalMode.value) return globalPage.value < globalTotalPages.value;
    return currentState.value.hasMore;
  });

  onBeforeUnmount(() => {
    realtimeUnsubscribe?.();
    unregisterResumeHandler();
    restoreDocumentTitle();
    bumpUserIssuesRequestToken();
    resetSearchResults();
    stopUserIssuesRequest();
  });

  watch(isOnline, (online) => {
    if (!online) {
      markContentWentOffline();
      return;
    }
    const updatedAt = activeFilter.value === 'my-proposals'
      ? userIssuesState.updatedAt
      : currentState.value.updatedAt;
    if (shouldRefreshContentAfterResume(updatedAt)) void refreshCurrentData();
  });

  const revalidateTimer = window.setInterval(() => {
    if (
      document.visibilityState !== 'visible'
      || !isOnline.value
      || !isAllowedUser.value
      || currentLoading.value
      || currentLoadingMore.value
      || searchQuery.value.trim()
    ) return;
    void refreshCurrentData();
  }, LIST_REVALIDATE_INTERVAL_MS);

  onBeforeUnmount(() => {
    window.clearInterval(revalidateTimer);
  });

  return {
    activeFilter,
    statusTab,
    searchQuery,
    sortOption,
    composerMessage,
    activeCategoryLabel,
    searchHint,
    globalPage,
    isSearching,
    isGlobalMode,
    globalTotalPages,
    currentState,
    currentIssues,
    currentLoading,
    currentLoadingMore,
    currentError,
    hasMoreCurrentData,
    loadMoreCurrentData,
    showEmptySearchResult,
    handleSupportChanged,
    handleIssueSubmitted,
    handleIssueUpdated,
    handleIssueDeleted,
    refreshCurrentData,
  };
}
