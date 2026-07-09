import type { IssueOperationTimeItem, IssueRecord, IssueSortOption, IssueStatus, IssueStatusBucket } from '@/types';

type RawIssueTimeItem = Omit<IssueOperationTimeItem, 'valueLabel'>;

const CLOSED_STATUSES = new Set<IssueStatus>([
  'auto-rejected',
  'review-rejected',
  'infeasible',
  'completed',
]);

export function isClosedIssueStatus(status: IssueStatus) {
  return CLOSED_STATUSES.has(status);
}

export function getIssueStatusBucket(issue: Pick<IssueRecord, 'status'>): IssueStatusBucket {
  return isClosedIssueStatus(issue.status) ? 'closed' : 'active';
}

export function getIssueLatestSortTime(
  issue: Pick<IssueRecord, 'closed_at' | 'created_at' | 'review_approved_at' | 'status'>,
  statusBucket: IssueStatusBucket,
) {
  if (statusBucket === 'closed' || isClosedIssueStatus(issue.status)) {
    return issue.closed_at?.getTime() ?? issue.created_at?.getTime() ?? 0;
  }
  return issue.review_approved_at?.getTime() ?? issue.created_at?.getTime() ?? 0;
}

export function sortIssuesByOption(
  issues: IssueRecord[],
  sortOption: IssueSortOption,
  statusBucket: IssueStatusBucket,
) {
  return [...issues].sort((left, right) => {
    const leftSortAt = getIssueLatestSortTime(left, statusBucket);
    const rightSortAt = getIssueLatestSortTime(right, statusBucket);

    if (sortOption === 'most-supported') {
      return right.support_count - left.support_count || rightSortAt - leftSortAt;
    }

    if (sortOption === 'ending-soon') {
      return (left.support_deadline_at?.getTime() ?? Number.POSITIVE_INFINITY)
        - (right.support_deadline_at?.getTime() ?? Number.POSITIVE_INFINITY)
        || rightSortAt - leftSortAt;
    }

    return rightSortAt - leftSortAt;
  });
}

export function sortMixedStatusIssuesByOption(
  issues: IssueRecord[],
  sortOption: IssueSortOption,
) {
  return [...issues].sort((left, right) => {
    const leftSortAt = getIssueLatestSortTime(left, getIssueStatusBucket(left));
    const rightSortAt = getIssueLatestSortTime(right, getIssueStatusBucket(right));

    if (sortOption === 'most-supported') {
      return right.support_count - left.support_count || rightSortAt - leftSortAt;
    }

    if (sortOption === 'ending-soon') {
      return (left.support_deadline_at?.getTime() ?? Number.POSITIVE_INFINITY)
        - (right.support_deadline_at?.getTime() ?? Number.POSITIVE_INFINITY)
        || rightSortAt - leftSortAt;
    }

    return rightSortAt - leftSortAt;
  });
}

export function getIssueOperationTimeItems(issue: IssueRecord): RawIssueTimeItem[] {
  const items: Array<{ label: string; shortLabel: string; value: Date | null | undefined }> = [
    { label: '提案發出時間', shortLabel: '提案', value: issue.created_at },
    { label: '審核通過時間', shortLabel: '審核通過', value: issue.review_approved_at },
    { label: '附議截止時間', shortLabel: '附議截止', value: issue.support_deadline_at },
    { label: '達標時間', shortLabel: '達標', value: issue.support_met_at },
    { label: '回覆期限', shortLabel: '回覆期限', value: issue.response_deadline_at },
    { label: '結案時間', shortLabel: '結案', value: issue.closed_at },
  ];

  return items.filter((item): item is RawIssueTimeItem => item.value instanceof Date);
}
