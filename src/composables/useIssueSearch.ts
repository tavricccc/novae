import { computed, onBeforeUnmount, reactive, ref, watch, type Ref } from 'vue';
import { normalizeSearchText } from '@/lib/search';
import { getDerivedIssueStatus } from '@/lib/issue-status';
import { fetchIssuesForTitleSearch } from '@/services/issues';
import type { IssueCursor, IssueFilter, IssueRecord, IssueSortOption, IssueStatusBucket } from '@/types';
import { sortIssues } from '@/lib/issue-sort';
import { isAbortFailure } from '@/lib/request';

const SEARCH_DEBOUNCE_MS = 700;
const MIN_GLOBAL_SEARCH_LENGTH = 3;

export function useIssueSearch(options: {
  activeFilter: Ref<IssueFilter | 'my-proposals'>;
  statusBucket: Ref<IssueStatusBucket>;
  userUid: Ref<string>;
  isAdmin: Ref<boolean>;
  sortOption: Ref<IssueSortOption>;
  supportedIssueIds: Ref<Set<string>>;
}) {
  const searchQuery = ref('');
  const debouncedSearchQuery = ref('');
  const searchState = reactive({
    loading: false,
    error: '',
    limited: false,
    cursor: null as IssueCursor | null,
    hasMore: false,
    loadingMore: false,
    issues: [] as IssueRecord[],
  });

  let debounceTimer: ReturnType<typeof window.setTimeout> | null = null;
  let requestToken = 0;
  let requestController: AbortController | null = null;
  let searchPool: IssueRecord[] = [];

  const normalizedSearchQuery = computed(() => normalizeSearchText(searchQuery.value));
  const normalizedDebouncedSearchQuery = computed(() => normalizeSearchText(debouncedSearchQuery.value));
  const isSearching = computed(() => normalizedSearchQuery.value.length > 0);
  const canSearchGlobally = computed(
    () => normalizedDebouncedSearchQuery.value.length >= MIN_GLOBAL_SEARCH_LENGTH,
  );
  const searchResultCount = computed(() => searchState.issues.length);
  const searchHint = computed(() => {
    if (!isSearching.value) return '';
    if (normalizedSearchQuery.value.length < MIN_GLOBAL_SEARCH_LENGTH) {
      return '輸入至少 3 個字可搜尋更多提案，目前只搜尋本頁。';
    }
    if (searchState.loading) return '搜尋中...';
    if (searchState.limited) return `找到 ${searchResultCount.value} 筆，已優先檢查最相關的索引候選。`;
    return `共 ${searchResultCount.value} 筆標題結果`;
  });

  function cancelPendingSearch() {
    requestToken += 1;
    requestController?.abort();
    requestController = null;
  }

  function resetSearchResults() {
    cancelPendingSearch();
    searchState.issues = [];
    searchState.loading = false;
    searchState.error = '';
    searchState.limited = false;
    searchState.cursor = null;
    searchState.hasMore = false;
    searchState.loadingMore = false;
  }

  function resetSearchPool() {
    resetSearchResults();
    searchPool = [];
  }

  function filterIssues(issues: IssueRecord[]) {
    const query = normalizedSearchQuery.value;
    if (!query) {
      return issues;
    }

    return issues.filter((issue) => {
      const title = normalizeSearchText(issue.title);
      return title.includes(query);
    });
  }

  function patchSearchIssue(issueId: string, updater: (issue: IssueRecord) => IssueRecord) {
    searchPool = searchPool.map((issue) => issue.id === issueId ? updater(issue) : issue);
    searchState.issues = searchState.issues.map((issue) =>
      issue.id === issueId ? updater(issue) : issue
    );
  }

  function addSearchIssue(issue: IssueRecord) {
    const query = normalizedSearchQuery.value;
    const derivedStatus = getDerivedIssueStatus(issue);
    const isActiveIssue = derivedStatus === 'under-review' || derivedStatus === 'pending' || derivedStatus === 'processing';
    const matchesBucket = options.statusBucket.value === 'active' ? isActiveIssue : !isActiveIssue;
    if (!query || !matchesBucket || !normalizeSearchText(issue.title).includes(query)) {
      return;
    }
    const nextIssue = {
      ...issue,
      currentUserSupported: issue.currentUserSupported || options.supportedIssueIds.value.has(issue.id),
    };
    const issueMap = new Map(searchPool.map((entry) => [entry.id, entry]));
    issueMap.set(nextIssue.id, nextIssue);
    searchPool = Array.from(issueMap.values());
    applySearchFilter(query);
  }

  function removeSearchIssue(issueId: string) {
    searchPool = searchPool.filter((issue) => issue.id !== issueId);
    searchState.issues = searchState.issues.filter((issue) => issue.id !== issueId);
  }

  function refreshSearchSupportState() {
    searchPool = searchPool.map((issue) => ({
      ...issue,
      currentUserSupported: issue.currentUserSupported || options.supportedIssueIds.value.has(issue.id),
    }));
    searchState.issues = searchState.issues.map((issue) => ({
      ...issue,
      currentUserSupported: issue.currentUserSupported || options.supportedIssueIds.value.has(issue.id),
    }));
  }

  function applySearchFilter(query: string) {
    searchState.issues = searchPool.filter((issue) =>
      normalizeSearchText(issue.title).includes(query)
    );
  }

  watch(searchQuery, (value) => {
    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
    }
    debounceTimer = window.setTimeout(() => {
      debouncedSearchQuery.value = value;
      debounceTimer = null;
    }, SEARCH_DEBOUNCE_MS);
  });

  watch(
    () => [
      canSearchGlobally.value,
      normalizedDebouncedSearchQuery.value,
      options.activeFilter.value,
      options.statusBucket.value,
      options.userUid.value,
      options.isAdmin.value,
      options.sortOption.value,
    ] as const,
    async ([ready, titleQuery, filter, statusBucket, uid, nextIsAdmin, sort]) => {
      resetSearchResults();

      if (!ready || filter === 'my-proposals' || !uid || !titleQuery) {
        return;
      }

      const currentToken = ++requestToken;
      requestController?.abort();
      const controller = new AbortController();
      requestController = controller;

      try {
        searchState.loading = true;
        const result = await fetchIssuesForTitleSearch(uid, filter, statusBucket, titleQuery, {
          isAdmin: nextIsAdmin,
          cursor: null,
          signal: controller.signal,
          sort,
          supportedIssueIds: options.supportedIssueIds.value,
        });
        if (currentToken !== requestToken) return;
        searchPool = result.issues;
        searchState.cursor = result.cursor;
        searchState.hasMore = result.hasMore;
        searchState.limited = result.limited;
        applySearchFilter(titleQuery);
        searchState.error = '';
      } catch (caught) {
        if (isAbortFailure(caught)) return;
        if (currentToken !== requestToken) return;
        searchState.error = '搜尋失敗，請稍後再試。';
      } finally {
        if (currentToken === requestToken) {
          searchState.loading = false;
        }
        if (requestController === controller) requestController = null;
      }
    },
  );

  async function loadMoreSearchResults() {
    if (
      searchState.loading
      || searchState.loadingMore
      || !searchState.hasMore
      || !searchState.cursor
    ) return;

    const filter = options.activeFilter.value;
    const uid = options.userUid.value;
    const titleQuery = normalizedDebouncedSearchQuery.value;
    if (filter === 'my-proposals' || !uid || !titleQuery) return;

    const currentToken = requestToken;
    requestController?.abort();
    const controller = new AbortController();
    requestController = controller;
    searchState.loadingMore = true;
    searchState.error = '';
    try {
      const result = await fetchIssuesForTitleSearch(
        uid,
        filter,
        options.statusBucket.value,
        titleQuery,
        {
          cursor: searchState.cursor,
          isAdmin: options.isAdmin.value,
          signal: controller.signal,
          sort: options.sortOption.value,
          supportedIssueIds: options.supportedIssueIds.value,
        },
      );
      if (currentToken !== requestToken) return;
      const issueMap = new Map(searchPool.map((issue) => [issue.id, issue]));
      result.issues.forEach((issue) => issueMap.set(issue.id, issue));
      searchPool = sortIssues(Array.from(issueMap.values()), options.statusBucket.value, options.sortOption.value);
      searchState.cursor = result.cursor;
      searchState.hasMore = result.hasMore;
      searchState.limited = result.limited;
      applySearchFilter(titleQuery);
    } catch (caught) {
      if (isAbortFailure(caught)) return;
      searchState.error = '載入更多搜尋結果失敗，請稍後再試。';
    } finally {
      if (currentToken === requestToken) searchState.loadingMore = false;
      if (requestController === controller) requestController = null;
    }
  }

  watch(options.supportedIssueIds, refreshSearchSupportState);

  onBeforeUnmount(() => {
    if (debounceTimer) {
      window.clearTimeout(debounceTimer);
    }
    resetSearchPool();
  });

  return {
    searchQuery,
    debouncedSearchQuery,
    normalizedSearchQuery,
    normalizedDebouncedSearchQuery,
    isSearching,
    canSearchGlobally,
    searchHint,
    searchResultCount,
    searchState,
    loadMoreSearchResults,
    filterIssues,
    patchSearchIssue,
    addSearchIssue,
    removeSearchIssue,
    resetSearchResults,
    resetSearchPool,
  };
}
