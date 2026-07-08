import { computed, onBeforeUnmount, reactive, watch, type Ref } from 'vue';
import { useNetworkStatus } from '@/composables/useNetworkStatus';
import { getIssueStatusBucket, sortIssuesByOption } from '@/lib/issue-timeline';
import { fetchIssuesPageByStatus } from '@/services/issues';
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
}

interface BucketDeps {
  user: Ref<{ uid: string } | null>;
  activeFilter: Ref<string>;
  isAdmin: Ref<boolean>;
  supportedIssueIds: Ref<Set<string>>;
  currentPageSize: Ref<number>;
  sortOption: Ref<IssueSortOption>;
}

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
  });
}

function mergeIssues(existing: IssueRecord[], incoming: IssueRecord[]) {
  const issueMap = new Map(existing.map((issue) => [issue.id, issue]));
  incoming.forEach((issue) => issueMap.set(issue.id, issue));
  return Array.from(issueMap.values());
}

export function useIssueBuckets(deps: BucketDeps) {
  const { user, activeFilter, isAdmin, supportedIssueIds, currentPageSize, sortOption } = deps;
  const { isOnline } = useNetworkStatus();
  const bucketCache = new Map<string, BucketState>();
  const bucketVersions = new WeakMap<BucketState, number>();

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
    const cachedBucket = bucketCache.get(key);
    if (cachedBucket) return cachedBucket;

    const bucket = createBucketState();
    bucketCache.set(key, bucket);
    return bucket;
  }

  const activeState = computed(() => getBucketState('active'));
  const closedState = computed(() => getBucketState('closed'));

  function getBucketVersion(bucket: BucketState) {
    return bucketVersions.get(bucket) ?? 0;
  }

  function bumpBucketVersion(bucket: BucketState) {
    bucketVersions.set(bucket, getBucketVersion(bucket) + 1);
  }

  async function loadBucket(statusBucket: IssueStatusBucket, options: { append?: boolean; silent?: boolean } = {}) {
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
          pageSize: currentPageSize.value,
          sort: sortOption.value,
          supportedIssueIds: supportedIssueIds.value,
        },
      );
      if (version !== getBucketVersion(bucket)) return;
      bucket.issues = options.append ? mergeIssues(bucket.issues, result.issues) : result.issues;
      bucket.cursor = result.cursor;
      bucket.hasMore = result.hasMore;
      bucket.initialized = true;
      bucket.error = '';
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
    void loadBucket(statusBucket, { silent: bucket.initialized });
  }

  function refreshBucket(statusBucket: IssueStatusBucket) {
    const bucket = getBucketState(statusBucket);
    bumpBucketVersion(bucket);
    bucket.cursor = null;
    bucket.hasMore = true;
    return loadBucket(statusBucket, { silent: true });
  }

  function loadMoreBucket(statusBucket: IssueStatusBucket) {
    void loadBucket(statusBucket, { append: true });
  }

  function patchCachedIssues(issueId: string, updater: (issue: IssueRecord) => IssueRecord) {
    bucketCache.forEach((bucket) => {
      bucket.issues = bucket.issues.map((issue) => issue.id === issueId ? updater(issue) : issue);
    });
  }

  function addIssueToBucket(issue: IssueRecord) {
    if (activeFilter.value === 'my-proposals') return;
    const statusBucket = getIssueStatusBucket(issue);
    if (issue.category !== activeFilter.value) return;
    const bucket = getBucketState(statusBucket);
    bucket.issues = sortIssuesByOption(mergeIssues(bucket.issues, [issue]), sortOption.value, statusBucket);
    bucket.initialized = true;
  }

  function removeIssueFromBuckets(issueId: string) {
    bucketCache.forEach((bucket) => {
      bucket.issues = bucket.issues.filter((issue) => issue.id !== issueId);
    });
  }

  function upsertIssueAcrossBuckets(issue: IssueRecord) {
    removeIssueFromBuckets(issue.id);
    addIssueToBucket(issue);
  }

  watch(supportedIssueIds, (ids) => {
    bucketCache.forEach((bucket) => {
      bucket.issues = bucket.issues.map((issue) => ({
        ...issue,
        currentUserSupported: issue.currentUserSupported || ids.has(issue.id),
      }));
    });
  });

  onBeforeUnmount(() => {
    bucketCache.clear();
  });

  return {
    activeState,
    closedState,
    activateBucket,
    refreshBucket,
    loadMoreBucket,
    addIssueToBucket,
    removeIssueFromBuckets,
    upsertIssueAcrossBuckets,
    patchCachedIssues,
  };
}
