import { computed, type Ref } from 'vue';
import { getDerivedIssueStatus, getRemainingCalendarDays } from '@/lib/issue-status';
import { formatDate } from '@/lib/format';
import { getIssueOperationTimeItems, isClosedIssueStatus } from '@/lib/issue-timeline';
import { ISSUE_CATEGORY_LABELS, issueRequiresReview } from '@/constants/categories';
import { ISSUE_STATUS_LABELS } from '@/constants/statuses';
import { useAuthorAvatarUrl } from '@/composables/useAuthorAvatar';
import type { IssueOperationTimeItem, IssueRecord } from '@/types';

export function useIssueDisplay(issue: Ref<IssueRecord> | (() => IssueRecord)) {
  const resolvedIssue = computed(() => {
    return typeof issue === 'function' ? issue() : issue.value;
  });

  const isOwnIssue = computed(() => resolvedIssue.value.isOwnIssue);

  const displayAuthorName = computed(() => {
    const i = resolvedIssue.value;
    return i.canViewAuthor ? i.author_name || '' : '';
  });

  const displayAuthorUid = computed(() => {
    const i = resolvedIssue.value;
    return i.canViewAuthor ? i.author_uid : null;
  });

  const fallbackPhotoUrl = computed(() => {
    const i = resolvedIssue.value;
    return i.canViewAuthor ? i.author_photo_url || null : null;
  });
  const displayPhotoUrl = useAuthorAvatarUrl(
    displayAuthorUid,
    fallbackPhotoUrl,
  );

  const derivedStatus = computed(() => getDerivedIssueStatus(resolvedIssue.value));
  const categoryLabel = computed(() => ISSUE_CATEGORY_LABELS[resolvedIssue.value.category]);
  const statusLabel = computed(() => ISSUE_STATUS_LABELS[derivedStatus.value]);
  const isClosed = computed(() => isClosedIssueStatus(derivedStatus.value));

  const primaryTimeLabel = computed(() => {
    const i = resolvedIssue.value;
    if (isClosed.value) return '結案時間';
    return issueRequiresReview(i.category) && i.review_approved_at ? '審核通過時間' : '提案時間';
  });
  const primaryTimeValue = computed(() => {
    const i = resolvedIssue.value;
    if (isClosed.value) return i.closed_at ?? i.updated_at ?? i.created_at;
    return issueRequiresReview(i.category) && i.review_approved_at ? i.review_approved_at : i.created_at;
  });
  const primaryTimeValueLabel = computed(() => formatDate(primaryTimeValue.value));
  const operationTimeItems = computed<IssueOperationTimeItem[]>(() =>
    getIssueOperationTimeItems(resolvedIssue.value).map((item) => ({
      ...item,
      valueLabel: formatDate(item.value),
    }))
  );

  const remainingDays = computed(() => getRemainingCalendarDays(resolvedIssue.value.support_deadline_at));

  return {
    displayAuthorName,
    displayPhotoUrl,
    derivedStatus,
    categoryLabel,
    statusLabel,
    primaryTimeLabel,
    primaryTimeValueLabel,
    operationTimeItems,
    remainingDays,
    isOwnIssue,
  };
}
