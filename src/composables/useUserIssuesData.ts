import { computed, reactive, watch, type Ref } from 'vue';
import { fetchUserIssues } from '@/services/issues';
import { createContentCacheKey, isContentCacheFresh } from '@/services/content-read-cache';
import { sortIssues } from '@/lib/issue-sort';
import { getIssueStatusBucket } from '@/lib/issue-timeline';
import type { IssueCursor, IssueFilter, IssueRecord, IssueSortOption, IssueStatusBucket } from '@/types';
import { isAbortFailure } from '@/lib/request';

type IssueBoardFilter = IssueFilter | 'my-proposals';
interface UserIssuesSnapshot {
  allIssues: IssueRecord[];
  cursor: IssueCursor | null;
  hasMore: boolean;
  updatedAt: number;
}

const userIssuesCache = new Map<string, UserIssuesSnapshot>();

export function useUserIssuesData(
  activeFilter: Ref<IssueBoardFilter>,
  userUid: Ref<string>,
  isAllowedUser: Ref<boolean>,
  supportedIssueIds: Ref<Set<string>>,
  sortOption: Ref<IssueSortOption>,
  statusBucket: Ref<IssueStatusBucket>,
  pageSize: Ref<number>,
) {
  const userIssuesState = reactive({
    allIssues: [] as IssueRecord[],
    error: '',
    cursor: null as IssueCursor | null,
    hasMore: false,
    loading: false,
    loadingMore: false,
    refreshing: false,
    updatedAt: 0,
  });

  let requestToken = 0;
  let requestController: AbortController | null = null;

  const visibleIssues = computed(() => userIssuesState.allIssues);
  const hasMore = computed(() => userIssuesState.hasMore);

  function getCacheKey() {
    return createContentCacheKey([
      'user-issues-state',
      userUid.value,
      statusBucket.value,
      sortOption.value,
      pageSize.value,
    ]);
  }

  function saveSnapshot() {
    if (!userUid.value) return;
    userIssuesCache.set(getCacheKey(), {
      allIssues: userIssuesState.allIssues,
      cursor: userIssuesState.cursor,
      hasMore: userIssuesState.hasMore,
      updatedAt: Date.now(),
    });
  }

  function hydrateSnapshot() {
    const cached = userIssuesCache.get(getCacheKey());
    if (!cached || !isContentCacheFresh(cached.updatedAt)) return false;
    userIssuesState.allIssues = cached.allIssues;
    userIssuesState.cursor = cached.cursor;
    userIssuesState.hasMore = cached.hasMore;
    userIssuesState.updatedAt = cached.updatedAt;
    userIssuesState.error = '';
    userIssuesState.loading = false;
    userIssuesState.loadingMore = false;
    userIssuesState.refreshing = false;
    return true;
  }

  function addUserIssue(issue: IssueRecord) {
    if (getIssueStatusBucket(issue) !== statusBucket.value) {
      removeUserIssue(issue.id);
      return;
    }
    const issueMap = new Map(userIssuesState.allIssues.map((entry) => [entry.id, entry]));
    issueMap.set(issue.id, {
      ...issue,
      currentUserSupported: issue.currentUserSupported || supportedIssueIds.value.has(issue.id),
    });
    userIssuesState.allIssues = sortIssues(Array.from(issueMap.values()), statusBucket.value, sortOption.value);
    saveSnapshot();
  }

  function removeUserIssue(issueId: string) {
    userIssuesState.allIssues = userIssuesState.allIssues.filter((issue) => issue.id !== issueId);
    saveSnapshot();
  }

  function stopUserIssuesRequest() {
    requestToken += 1;
    requestController?.abort();
    requestController = null;
    userIssuesState.loading = false;
    userIssuesState.loadingMore = false;
    userIssuesState.refreshing = false;
  }

  function resetUserIssues() {
    stopUserIssuesRequest();
    userIssuesState.allIssues = [];
    userIssuesState.error = '';
    userIssuesState.cursor = null;
    userIssuesState.hasMore = false;
  }

  function bumpUserIssuesRequestToken() {
    requestToken += 1;
  }

  async function loadCurrentUserIssues(options: { silent?: boolean } = {}) {
    const uid = userUid.value;
    if (activeFilter.value !== 'my-proposals' || !isAllowedUser.value || !uid) {
      userIssuesState.loading = false;
      return;
    }

    if (!options.silent && hydrateSnapshot()) return;

    const currentToken = ++requestToken;
    requestController?.abort();
    const controller = new AbortController();
    requestController = controller;
    userIssuesState.error = '';
    if (options.silent && userIssuesState.allIssues.length > 0) {
      userIssuesState.refreshing = true;
    } else {
      userIssuesState.loading = true;
    }

    try {
      const page = await fetchUserIssues(uid, null, {
        pageSize: pageSize.value,
        forceRefresh: options.silent === true,
        sort: sortOption.value,
        statusBucket: statusBucket.value,
        supportedIssueIds: supportedIssueIds.value,
        signal: controller.signal,
      });
      if (currentToken !== requestToken) return;
      userIssuesState.allIssues = sortIssues(page.issues, statusBucket.value, sortOption.value);
      userIssuesState.cursor = page.cursor;
      userIssuesState.hasMore = page.hasMore;
      userIssuesState.updatedAt = Date.now();
      userIssuesState.error = '';
      saveSnapshot();
    } catch (caught) {
      if (isAbortFailure(caught)) return;
      if (currentToken === requestToken && userIssuesState.allIssues.length === 0) {
        userIssuesState.error = '提案載入失敗，請稍後再試。';
      }
    } finally {
      if (currentToken === requestToken) {
        userIssuesState.loading = false;
        userIssuesState.refreshing = false;
      }
      if (requestController === controller) requestController = null;
    }
  }

  async function loadMoreUserIssues() {
    if (!hasMore.value || userIssuesState.loadingMore) return;
    const currentToken = requestToken;
    requestController?.abort();
    const controller = new AbortController();
    requestController = controller;
    userIssuesState.loadingMore = true;
    try {
      const page = await fetchUserIssues(userUid.value, userIssuesState.cursor, {
        pageSize: pageSize.value,
        sort: sortOption.value,
        statusBucket: statusBucket.value,
        supportedIssueIds: supportedIssueIds.value,
        signal: controller.signal,
      });
      if (currentToken !== requestToken) return;
      const ids = new Set(userIssuesState.allIssues.map((issue) => issue.id));
      userIssuesState.allIssues = sortIssues([
        ...userIssuesState.allIssues,
        ...page.issues.filter((issue) => !ids.has(issue.id)),
      ], statusBucket.value, sortOption.value);
      userIssuesState.cursor = page.cursor;
      userIssuesState.hasMore = page.hasMore;
      userIssuesState.updatedAt = Date.now();
      userIssuesState.error = '';
      saveSnapshot();
    } catch (caught) {
      if (isAbortFailure(caught)) return;
      userIssuesState.error = '載入更多提案失敗，請稍後再試。';
    } finally {
      if (currentToken === requestToken) userIssuesState.loadingMore = false;
      if (requestController === controller) requestController = null;
    }
  }

  watch([activeFilter, userUid, isAllowedUser, statusBucket], () => {
    void loadCurrentUserIssues();
  }, { immediate: true });

  watch(supportedIssueIds, (newIds) => {
    userIssuesState.allIssues = userIssuesState.allIssues.map((issue) => ({
      ...issue,
      currentUserSupported: issue.currentUserSupported || newIds.has(issue.id),
    }));
    saveSnapshot();
  });

  watch(sortOption, () => void loadCurrentUserIssues());

  return {
    userIssuesState,
    hasMoreUserIssues: hasMore,
    visibleUserIssues: visibleIssues,
    bumpUserIssuesRequestToken,
    loadMoreUserIssues,
    addUserIssue,
    removeUserIssue,
    resetUserIssues,
    stopUserIssuesRequest,
    loadCurrentUserIssues,
  };
}
