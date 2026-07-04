import type { IssueRecord } from '@/types';
import { invokeBackendAction } from '@/services/backend-action';
import { READ_REQUEST_TIMEOUT_MS, RequestFailure } from '@/lib/request';
import {
  ISSUES_COLLECTION,
  FIRESTORE_IN_QUERY_LIMIT,
  getIssueStatusBucketValues,
  PRIVATE_ISSUE_AUTHORS_COLLECTION,
  STATUS_BUCKETS,
  TABLE_PAGE_SIZE,
} from './issues-constants';
import {
  issueBelongsToBucket,
  normalizeDate,
  normalizeIssueCursor,
  normalizeIssuePage,
  normalizeIssueRecord,
  normalizeStatus,
  withSupportState,
} from './issues-normalize';
import { buildIssueBucketQuery } from './issues-query';
import {
  chunkList,
  sortIssues,
} from './issues-utils';
import { isContentUnavailableError, toReadableBackendError } from './issues-errors';

export {
  FIRESTORE_IN_QUERY_LIMIT,
  getIssueStatusBucketValues,
  ISSUES_COLLECTION,
  PRIVATE_ISSUE_AUTHORS_COLLECTION,
  STATUS_BUCKETS,
  TABLE_PAGE_SIZE,
  buildIssueBucketQuery,
  chunkList,
  issueBelongsToBucket,
  normalizeDate,
  normalizeIssueCursor,
  normalizeIssuePage,
  normalizeIssueRecord,
  normalizeStatus,
  sortIssues,
  isContentUnavailableError,
  toReadableBackendError,
  withSupportState,
};

export async function fetchIssueRecordById(issueId: string): Promise<IssueRecord> {
  try {
    const fn = invokeBackendAction<{ issueId: string }, { issue: Record<string, unknown> }>('getIssue', {
      timeoutMs: READ_REQUEST_TIMEOUT_MS,
    });
    const result = await fn({ issueId });
    return normalizeIssueRecord(String(result.data.issue.id ?? issueId), result.data.issue);
  } catch (error) {
    if (error instanceof RequestFailure) throw error;
    throw new Error('找不到這篇提案。', { cause: error });
  }
}
