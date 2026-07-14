import type { IssueCursor, IssueFilter, IssueRecord, IssueSortOption, IssueStatusBucket } from '@/types';
import { buildTitleSearchTokens, normalizeSearchText } from '@/lib/search';
import { READ_REQUEST_TIMEOUT_MS } from '@/lib/request';
import { invokeBackendAction } from '@/services/backend-action';
import { createContentCacheKey, getCachedContent, setCachedContent } from '@/services/content-read-cache';
import { TABLE_PAGE_SIZE, normalizeIssueCursor, normalizeIssueRecord, toReadableBackendError, withSupportState } from './issues-core';
import { CONTENT_FEED_PAGE_SIZE } from '@/lib/page-size';

function normalizeIssueList(records: Record<string, unknown>[]) {
  return records.map((record) => normalizeIssueRecord(String(record.id ?? ''), record));
}

export async function fetchIssuesPageByStatus(
  uid: string,
  activeFilter: IssueFilter,
  statusBucket: IssueStatusBucket,
  cursor: IssueCursor | null,
  options?: {
    forceRefresh?: boolean;
    isAdmin?: boolean;
    signal?: AbortSignal;
    pageSize?: number;
    sort?: IssueSortOption;
    supportedIssueIds?: Set<string>;
  },
) {
  const pageSize = options?.pageSize ?? TABLE_PAGE_SIZE;
  const cacheKey = createContentCacheKey([
    'issue-list-page',
    uid,
    options?.isAdmin ? 'admin' : 'user',
    activeFilter,
    statusBucket,
    options?.sort ?? 'latest',
    pageSize,
    cursor?.id ?? 'first',
    cursor?.sort_number ?? '',
    cursor?.sort_date?.getTime() ?? '',
    cursor?.created_at?.getTime() ?? '',
  ]);
  if (!options?.forceRefresh) {
    const cached = getCachedContent<{ cursor: IssueCursor | null; hasMore: boolean; issues: IssueRecord[] }>(cacheKey);
    if (cached) {
      return {
        ...cached,
        issues: withSupportState(cached.issues, options?.supportedIssueIds),
      };
    }
  }

  try {
    const fn = invokeBackendAction<
      {
        activeFilter: IssueFilter;
        cursor: IssueCursor | null;
        isAdmin: boolean;
        pageSize: number;
        sort: IssueSortOption;
        statusBucket: IssueStatusBucket;
        uid: string;
      },
      { cursor: IssueCursor | null; hasMore: boolean; issues: Record<string, unknown>[] }
    >('listIssues', { signal: options?.signal, timeoutMs: READ_REQUEST_TIMEOUT_MS });
    const result = await fn({
      activeFilter,
      cursor,
      isAdmin: options?.isAdmin ?? false,
      pageSize,
      sort: options?.sort ?? 'latest',
      statusBucket,
      uid,
    });
    const page = {
      cursor: normalizeIssueCursor(result.cursor),
      hasMore: result.hasMore,
      issues: withSupportState(normalizeIssueList(result.issues), options?.supportedIssueIds),
    };
    setCachedContent(cacheKey, page);
    return page;
  } catch (error) {
    throw toReadableBackendError(error);
  }
}

export async function fetchIssuesForTitleSearch(
  uid: string,
  activeFilter: IssueFilter,
  statusBucket: IssueStatusBucket,
  titleQuery: string,
  options?: {
    cursor?: IssueCursor | null;
    forceRefresh?: boolean;
    isAdmin?: boolean;
    signal?: AbortSignal;
    sort?: IssueSortOption;
    supportedIssueIds?: Set<string>;
  },
): Promise<{
  cursor: IssueCursor | null;
  hasMore: boolean;
  issues: IssueRecord[];
  limited: boolean;
}> {
  const normalizedQuery = normalizeSearchText(titleQuery);
  const searchTokens = buildTitleSearchTokens(normalizedQuery);
  if (searchTokens.length === 0) {
    return { cursor: null, hasMore: false, issues: [], limited: false };
  }
  const cacheKey = createContentCacheKey([
    'issue-search',
    uid,
    options?.isAdmin ? 'admin' : 'user',
    activeFilter,
    statusBucket,
    options?.sort ?? 'latest',
    normalizedQuery,
    options?.cursor?.id ?? 'first',
    options?.cursor?.sort_number ?? '',
    options?.cursor?.sort_date?.getTime() ?? '',
    options?.cursor?.created_at?.getTime() ?? '',
  ]);
  if (!options?.forceRefresh) {
    const cached = getCachedContent<{
      cursor: IssueCursor | null;
      hasMore: boolean;
      issues: IssueRecord[];
      limited: boolean;
    }>(cacheKey);
    if (cached) {
      return {
        cursor: cached.cursor,
        hasMore: cached.hasMore,
        issues: withSupportState(cached.issues, options?.supportedIssueIds),
        limited: cached.limited,
      };
    }
  }

  try {
    const fn = invokeBackendAction<
      {
        activeFilter: IssueFilter;
        cursor: IssueCursor | null;
        isAdmin: boolean;
        pageSize: number;
        sort: IssueSortOption;
        statusBucket: IssueStatusBucket;
        titleQuery: string;
        uid: string;
      },
      { cursor: IssueCursor | null; hasMore: boolean; issues: Record<string, unknown>[]; limited: boolean }
    >('searchIssues', { signal: options?.signal, timeoutMs: READ_REQUEST_TIMEOUT_MS });
    const result = await fn({
      activeFilter,
      cursor: options?.cursor ?? null,
      isAdmin: options?.isAdmin ?? false,
      pageSize: CONTENT_FEED_PAGE_SIZE,
      sort: options?.sort ?? 'latest',
      statusBucket,
      titleQuery,
      uid,
    });
    const page = {
      cursor: normalizeIssueCursor(result.cursor),
      hasMore: result.hasMore,
      issues: withSupportState(normalizeIssueList(result.issues), options?.supportedIssueIds),
      limited: result.limited,
    };
    setCachedContent(cacheKey, page);
    return page;
  } catch (error) {
    throw toReadableBackendError(error);
  }
}
