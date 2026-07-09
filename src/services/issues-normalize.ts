import {
  DEFAULT_ISSUE_CATEGORY,
  getIssueResponseDeadlineDays,
  getIssueResponseDeadlineStart,
  getIssueSupportGoal,
  isIssueCategory,
  issueAllowsSupport,
} from '@/constants/categories';
import type {
  IssueCursor,
  IssueRecord,
  IssueStatus,
} from '@/types';
import { addDays } from './issues-utils';

export function normalizeDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return value;
  }

  if (typeof value === 'number') {
    return new Date(value);
  }

  if (typeof value === 'string') {
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time) : null;
  }

  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date ? date : null;
  }

  return null;
}

function normalizeCategory(value: unknown): IssueRecord['category'] {
  return isIssueCategory(value) ? value : DEFAULT_ISSUE_CATEGORY;
}

export function normalizeStatus(value: unknown): IssueStatus {
  if (
    value === 'under-review' ||
    value === 'pending' ||
    value === 'processing' ||
    value === 'auto-rejected' ||
    value === 'review-rejected' ||
    value === 'infeasible' ||
    value === 'completed'
  ) {
    return value;
  }
  return 'pending';
}

function getCategoryDefaults(category: IssueRecord['category'], createdAt = new Date()) {
  if (issueAllowsSupport(category)) {
    return {
      support_enabled: true,
      support_goal: getIssueSupportGoal(category),
      support_deadline_at: null,
      response_deadline_at: null,
      support_met_at: null,
    };
  }

  const responseDeadlineDays = getIssueResponseDeadlineDays(category);
  const responseDeadlineAt = getIssueResponseDeadlineStart(category) === 'created' && responseDeadlineDays !== null
    ? addDays(createdAt, responseDeadlineDays)
    : null;

  return {
    support_enabled: false,
    support_goal: null,
    support_deadline_at: null,
    response_deadline_at: responseDeadlineAt,
    support_met_at: null,
  };
}

export function normalizeIssueRecord(id: string, data: Record<string, unknown>): IssueRecord {
  const category = normalizeCategory(data.category);
  const defaults = getCategoryDefaults(category);

  const record: IssueRecord = {
    id,
    title: String(data.title ?? ''),
    content: String(data.content ?? ''),
    created_at: normalizeDate(data.created_at),
    closed_at: normalizeDate(data.closed_at),
    support_count: typeof data.support_count === 'number' ? data.support_count : 0,
    status: normalizeStatus(data.status),
    category,
    support_enabled: Boolean(data.support_enabled ?? defaults.support_enabled),
    support_goal: typeof data.support_goal === 'number' ? data.support_goal : defaults.support_goal,
    support_deadline_at: normalizeDate(
      data.support_deadline_at
    ) ?? defaults.support_deadline_at,
    response_deadline_at: normalizeDate(
      data.response_deadline_at
    ) ?? defaults.response_deadline_at,
    review_approved_at: normalizeDate(data.review_approved_at),
    result_content: typeof data.result_content === 'string'
      ? data.result_content
      : undefined,
    support_met_at: normalizeDate(
      data.support_met_at
    ) ?? defaults.support_met_at,
    review_rejection_reason: typeof data.review_rejection_reason === 'string'
      ? data.review_rejection_reason
      : undefined,
    currentUserSupported: data.currentUserSupported === true,
    isOwnIssue: data.isOwnIssue === true,
    canManageIssue: data.canManageIssue === true,
    canViewAuthor: data.canViewAuthor === true,
    deleting: data.deleting === true,
    author_uid: data.canViewAuthor === true && typeof data.author_uid === 'string'
      ? data.author_uid
      : null,
    author_name: data.canViewAuthor === true && typeof data.author_name === 'string'
      ? data.author_name
      : null,
    author_photo_url: data.canViewAuthor === true && typeof data.author_photo_url === 'string'
      ? data.author_photo_url
      : null,
  };

  return record;
}

export function normalizeIssueCursor(data: unknown): IssueCursor | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : '';
  const createdAt = normalizeDate(record.created_at);
  if (!id || !createdAt) return null;

  return {
    id,
    created_at: createdAt,
    sort_date: normalizeDate(record.sort_date),
    sort_number: typeof record.sort_number === 'number' ? record.sort_number : null,
  };
}

export function withSupportState(issues: IssueRecord[], supportedIssueIds?: Set<string>) {
  if (!supportedIssueIds) {
    return issues;
  }
  return issues.map((issue) => ({
    ...issue,
    currentUserSupported: issue.currentUserSupported || supportedIssueIds.has(issue.id),
  }));
}
