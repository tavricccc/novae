import type { IssueCursor, IssueFilter, IssueRecord, IssueSortOption, IssueStatusBucket } from '@/types';
import { buildTitleSearchTokens, normalizeSearchText } from '@/lib/search';
import { READ_REQUEST_TIMEOUT_MS } from '@/lib/request';
import { invokeBackendAction } from '@/services/backend-action';
import { TABLE_PAGE_SIZE, normalizeIssueCursor, normalizeIssueRecord, toReadableBackendError, withSupportState } from './issues-core';

function normalizeIssueList(records: Record<string, unknown>[]) {
  return records.map((record) => normalizeIssueRecord(String(record.id ?? ''), record));
}

export async function fetchIssuesPageByStatus(
  uid: string,
  activeFilter: IssueFilter,
  statusBucket: IssueStatusBucket,
  cursor: IssueCursor | null,
  options?: {
    isAdmin?: boolean;
    pageSize?: number;
    sort?: IssueSortOption;
    supportedIssueIds?: Set<string>;
  },
) {
  const pageSize = options?.pageSize ?? TABLE_PAGE_SIZE;
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
    >('listIssues', { timeoutMs: READ_REQUEST_TIMEOUT_MS });
    const result = await fn({
      activeFilter,
      cursor,
      isAdmin: options?.isAdmin ?? false,
      pageSize,
      sort: options?.sort ?? 'latest',
      statusBucket,
      uid,
    });
    return {
      cursor: normalizeIssueCursor(result.data.cursor),
      hasMore: result.data.hasMore,
      issues: withSupportState(normalizeIssueList(result.data.issues), options?.supportedIssueIds),
    };
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
    isAdmin?: boolean;
    sort?: IssueSortOption;
    supportedIssueIds?: Set<string>;
  },
): Promise<{ issues: IssueRecord[]; limited: boolean }> {
  const normalizedQuery = normalizeSearchText(titleQuery);
  const searchTokens = buildTitleSearchTokens(normalizedQuery);
  if (searchTokens.length === 0) {
    return { issues: [], limited: false };
  }

  try {
    const fn = invokeBackendAction<
      {
        activeFilter: IssueFilter;
        isAdmin: boolean;
        sort: IssueSortOption;
        statusBucket: IssueStatusBucket;
        titleQuery: string;
        uid: string;
      },
      { issues: Record<string, unknown>[]; limited: boolean }
    >('searchIssues', { timeoutMs: READ_REQUEST_TIMEOUT_MS });
    const result = await fn({
      activeFilter,
      isAdmin: options?.isAdmin ?? false,
      sort: options?.sort ?? 'latest',
      statusBucket,
      titleQuery,
      uid,
    });
    return {
      issues: withSupportState(normalizeIssueList(result.data.issues), options?.supportedIssueIds),
      limited: result.data.limited,
    };
  } catch (error) {
    throw toReadableBackendError(error);
  }
}
