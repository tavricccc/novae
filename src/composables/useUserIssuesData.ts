import { computed, reactive, watch, type Ref } from 'vue';
import { fetchUserIssues } from '@/services/issues';
import type { IssueCursor, IssueFilter, IssueRecord, IssueSortOption } from '@/types';

type IssueBoardFilter = IssueFilter | 'my-proposals';

export function useUserIssuesData(
  activeFilter: Ref<IssueBoardFilter>,
  userUid: Ref<string>,
  isAllowedUser: Ref<boolean>,
  supportedIssueIds: Ref<Set<string>>,
  sortOption: Ref<IssueSortOption>,
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
  });

  let requestToken = 0;

  const visibleIssues = computed(() => userIssuesState.allIssues);
  const hasMore = computed(() => userIssuesState.hasMore);

  function addUserIssue(issue: IssueRecord) {
    const issueMap = new Map(userIssuesState.allIssues.map((entry) => [entry.id, entry]));
    issueMap.set(issue.id, {
      ...issue,
      currentUserSupported: supportedIssueIds.value.has(issue.id),
    });
    userIssuesState.allIssues = Array.from(issueMap.values());
  }

  function removeUserIssue(issueId: string) {
    userIssuesState.allIssues = userIssuesState.allIssues.filter((issue) => issue.id !== issueId);
  }

  function stopUserIssuesRequest() {
    requestToken += 1;
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

    const currentToken = ++requestToken;
    userIssuesState.error = '';
    if (options.silent && userIssuesState.allIssues.length > 0) {
      userIssuesState.refreshing = true;
    } else {
      userIssuesState.loading = true;
    }

    try {
      const page = await fetchUserIssues(uid, null, {
        pageSize: pageSize.value,
        sort: sortOption.value,
        supportedIssueIds: supportedIssueIds.value,
      });
      if (currentToken !== requestToken) return;
      userIssuesState.allIssues = page.issues;
      userIssuesState.cursor = page.cursor;
      userIssuesState.hasMore = page.hasMore;
      userIssuesState.error = '';
    } catch {
      if (currentToken === requestToken && userIssuesState.allIssues.length === 0) {
        userIssuesState.error = '提案載入失敗，請稍後再試。';
      }
    } finally {
      if (currentToken === requestToken) {
        userIssuesState.loading = false;
        userIssuesState.refreshing = false;
      }
    }
  }

  async function loadMoreUserIssues() {
    if (!hasMore.value || userIssuesState.loadingMore) return;
    userIssuesState.loadingMore = true;
    try {
      const page = await fetchUserIssues(userUid.value, userIssuesState.cursor, {
        pageSize: pageSize.value,
        sort: sortOption.value,
        supportedIssueIds: supportedIssueIds.value,
      });
      const ids = new Set(userIssuesState.allIssues.map((issue) => issue.id));
      userIssuesState.allIssues.push(...page.issues.filter((issue) => !ids.has(issue.id)));
      userIssuesState.cursor = page.cursor;
      userIssuesState.hasMore = page.hasMore;
    } finally {
      userIssuesState.loadingMore = false;
    }
  }

  watch([activeFilter, userUid, isAllowedUser], () => {
    void loadCurrentUserIssues();
  }, { immediate: true });

  watch(supportedIssueIds, (newIds) => {
    userIssuesState.allIssues = userIssuesState.allIssues.map((issue) => ({
      ...issue,
      currentUserSupported: newIds.has(issue.id),
    }));
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
