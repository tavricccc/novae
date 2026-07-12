import { computed, reactive, watch, type Ref } from 'vue';
import { useNetworkStatus } from '@/composables/useNetworkStatus';
import { getIssueStatusBucket } from '@/lib/issue-timeline';
import { sortIssues } from '@/lib/issue-sort';
import { fetchIssuesPageByStatus } from '@/services/issues';
import { isContentCacheFresh } from '@/services/content-read-cache';
import type { IssueCursor, IssueFilter, IssueRecord, IssueSortOption, IssueStatusBucket } from '@/types';

interface BucketState {
  cursor: IssueCursor | null;
  error: string;
  hasMore: boolean;
  initialized: boolean;
  issues: IssueRecord[];
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  updatedAt: number;
}

interface BucketDeps {
  user: Ref<{ uid: string } | null>;
  activeFilter: Ref<string>;
  isAdmin: Ref<boolean>;
  supportedIssueIds: Ref<Set<string>>;
  currentPageSize: Ref<number>;
  sortOption: Ref<IssueSortOption>;
}

const globalBucketCache = new Map<string, BucketState>();
const globalBucketVersions = new WeakMap<BucketState, number>();

function createBucketState(): BucketState {
  return reactive({
    cursor: null,
    error: '',
    hasMore: true,
    initialized: false,
    issues: [],
    loading: false,
    loadingMore: false,
    refreshing: false,
    updatedAt: 0,
  });
}

function mergeIssues(
  existing: IssueRecord[],
  incoming: IssueRecord[],
  statusBucket: IssueStatusBucket,
  sortOption: IssueSortOption,
) {
  const issueMap = new Map(existing.map((issue) => [issue.id, issue]));
  incoming.forEach((issue) => issueMap.set(issue.id, issue));
  return sortIssues(Array.from(issueMap.values()), statusBucket, sortOption);
}

export function useIssueBuckets(deps: BucketDeps) {
  const { user, activeFilter, isAdmin, supportedIssueIds, currentPageSize, sortOption } = deps;
  const { isOnline } = useNetworkStatus();

  function getBucketKey(statusBucket: IssueStatusBucket) {
    return [
      user.value?.uid ?? '',
      isAdmin.value ? 'admin' : 'user',
      activeFilter.value,
      statusBucket,
      sortOption.value,
      currentPageSize.value,
    ].join(':');
  }

  function getBucketState(statusBucket: IssueStatusBucket) {
    const key = getBucketKey(statusBucket);
    const cachedBucket = globalBucketCache.get(key);
    if (cachedBucket) return cachedBucket;

    const bucket = createBucketState();
    globalBucketCache.set(key, bucket);
    return bucket;
  }

  const activeState = computed(() => getBucketState('active'));
  const closedState = computed(() => getBucketState('closed'));

  function getBucketVersion(bucket: BucketState) {
    return globalBucketVersions.get(bucket) ?? 0;
  }

  function bumpBucketVersion(bucket: BucketState) {
    globalBucketVersions.set(bucket, getBucketVersion(bucket) + 1);
  }

  async function loadBucket(statusBucket: IssueStatusBucket, options: { append?: boolean; force?: boolean; silent?: boolean } = {}) {
    const bucket = getBucketState(statusBucket);
    if (activeFilter.value === 'my-proposals') return;
    if (options.append && (!bucket.hasMore || bucket.loadingMore)) return;
    if (!options.append && (bucket.loading || bucket.refreshing)) return;

    const version = getBucketVersion(bucket);
    const cursor = options.append ? bucket.cursor : null;
    bucket.error = '';
    if (options.append) {
      bucket.loadingMore = true;
    } else if (options.silent && bucket.issues.length > 0) {
      bucket.refreshing = true;
    } else {
      bucket.loading = true;
    }

    try {
      const result = await fetchIssuesPageByStatus(
        user.value?.uid ?? '',
        activeFilter.value as IssueFilter,
        statusBucket,
        cursor,
        {
          isAdmin: isAdmin.value,
          forceRefresh: options.force === true,
          pageSize: currentPageSize.value,
          sort: sortOption.value,
          supportedIssueIds: supportedIssueIds.value,
        },
      );
      if (version !== getBucketVersion(bucket)) return;
      bucket.issues = options.append
        ? mergeIssues(bucket.issues, result.issues, statusBucket, sortOption.value)
        : sortIssues(result.issues, statusBucket, sortOption.value);
      bucket.cursor = result.cursor;
      bucket.hasMore = result.hasMore;
      bucket.initialized = true;
      bucket.error = '';
      bucket.updatedAt = Date.now();
    } catch {
      if (version !== getBucketVersion(bucket)) return;
      if (bucket.issues.length === 0 || options.append) {
        bucket.error = isOnline.value
          ? options.append ? '載入更多提案失敗，請稍後再試。' : '提案載入失敗，請稍後再試。'
          : '目前已離線，請恢復網路連線後重新整理。';
      }
    } finally {
      if (version === getBucketVersion(bucket)) {
        bucket.loading = false;
        bucket.loadingMore = false;
        bucket.refreshing = false;
      }
    }
  }

  function activateBucket(statusBucket: IssueStatusBucket) {
    const bucket = getBucketState(statusBucket);
    if (activeFilter.value === 'my-proposals' || bucket.loading || bucket.refreshing) return;
    if (bucket.initialized && isContentCacheFresh(bucket.updatedAt)) return;
    void loadBucket(statusBucket, { silent: bucket.initialized });
  }

  function refreshBucket(statusBucket: IssueStatusBucket) {
    const bucket = getBucketState(statusBucket);
    if (bucket.loading || bucket.refreshing) return Promise.resolve();
    bumpBucketVersion(bucket);
    bucket.cursor = null;
    bucket.hasMore = true;
    return loadBucket(statusBucket, { force: true, silent: true });
  }

  function loadMoreBucket(statusBucket: IssueStatusBucket) {
    void loadBucket(statusBucket, { append: true });
  }

  function patchCachedIssues(issueId: string, updater: (issue: IssueRecord) => IssueRecord) {
    globalBucketCache.forEach((bucket) => {
      if (!bucket.issues.some((issue) => issue.id === issueId)) return;
      bucket.issues = bucket.issues.map((issue) => issue.id === issueId ? updater(issue) : issue);
      bucket.updatedAt = Date.now();
    });
  }

  function addIssueToBucket(issue: IssueRecord) {
    if (activeFilter.value === 'my-proposals') return;
    const statusBucket = getIssueStatusBucket(issue);
    if (issue.category !== activeFilter.value) return;
    const bucket = getBucketState(statusBucket);
    bucket.issues = mergeIssues(bucket.issues, [issue], statusBucket, sortOption.value);
    bucket.initialized = true;
    bucket.updatedAt = Date.now();
  }

  function removeIssueFromBuckets(issueId: string) {
    globalBucketCache.forEach((bucket) => {
      bucket.issues = bucket.issues.filter((issue) => issue.id !== issueId);
      bucket.updatedAt = Date.now();
    });
  }

  function invalidateIssueBuckets() {
    globalBucketCache.forEach((bucket) => {
      bucket.updatedAt = 0;
    });
  }

  function upsertIssueAcrossBuckets(issue: IssueRecord) {
    removeIssueFromBuckets(issue.id);
    invalidateIssueBuckets();
    addIssueToBucket(issue);
  }

  watch(supportedIssueIds, (ids) => {
    globalBucketCache.forEach((bucket) => {
      bucket.issues = bucket.issues.map((issue) => ({
        ...issue,
        currentUserSupported: issue.currentUserSupported || ids.has(issue.id),
      }));
    });
  });

  return {
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
  };
}
