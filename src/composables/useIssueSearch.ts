import { computed, onBeforeUnmount, reactive, ref, watch, type Ref } from 'vue';
import { normalizeSearchText } from '@/lib/search';
import { getDerivedIssueStatus } from '@/lib/issue-status';
import { sortIssuesByOption } from '@/lib/issue-timeline';
import { fetchIssuesForTitleSearch } from '@/services/issues';
import type { IssueFilter, IssueRecord, IssueSortOption, IssueStatusBucket } from '@/types';

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
    issues: [] as IssueRecord[],
  });

  let debounceTimer: ReturnType<typeof window.setTimeout> | null = null;
  let requestToken = 0;
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
  }

  function resetSearchResults() {
    cancelPendingSearch();
    searchState.issues = [];
    searchState.loading = false;
    searchState.error = '';
    searchState.limited = false;
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
    searchState.issues = sortIssuesByOption(searchPool.filter((issue) =>
      normalizeSearchText(issue.title).includes(query)
    ), options.sortOption.value, options.statusBucket.value);
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

      try {
        searchState.loading = true;
        const result = await fetchIssuesForTitleSearch(uid, filter, statusBucket, titleQuery, {
          isAdmin: nextIsAdmin,
          sort,
          supportedIssueIds: options.supportedIssueIds.value,
        });
        if (currentToken !== requestToken) return;
        searchPool = result.issues;
        searchState.limited = result.limited;
        applySearchFilter(titleQuery);
        searchState.error = '';
      } catch {
        if (currentToken !== requestToken) return;
        searchState.error = '搜尋失敗，請稍後再試。';
      } finally {
        if (currentToken === requestToken) {
          searchState.loading = false;
        }
      }
    },
  );

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
    filterIssues,
    patchSearchIssue,
    addSearchIssue,
    removeSearchIssue,
    resetSearchResults,
    resetSearchPool,
  };
}
