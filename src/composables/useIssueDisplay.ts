import { computed, type Ref } from 'vue';
import { getDerivedIssueStatus, getRemainingCalendarDays } from '@/lib/issue-status';
import { formatDate } from '@/lib/format';
import { ISSUE_CATEGORY_LABELS, issueRequiresReview } from '@/constants/categories';
import { ISSUE_STATUS_LABELS } from '@/constants/statuses';
import { useAuthorAvatarUrl } from '@/composables/useAuthorAvatar';
import type { IssueRecord } from '@/types';

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

  const createdLabel = computed(() => formatDate(resolvedIssue.value.created_at));
  const primaryTimeLabel = computed(() => {
    const i = resolvedIssue.value;
    return issueRequiresReview(i.category) && i.review_approved_at ? '審核通過時間' : '提案時間';
  });
  const primaryTimeShortLabel = computed(() => {
    const i = resolvedIssue.value;
    return issueRequiresReview(i.category) && i.review_approved_at ? '審核通過' : '提案';
  });
  const primaryTimeValue = computed(() => {
    const i = resolvedIssue.value;
    return issueRequiresReview(i.category) && i.review_approved_at ? i.review_approved_at : i.created_at;
  });
  const primaryTimeValueLabel = computed(() => formatDate(primaryTimeValue.value));
  const supportDeadlineLabel = computed(() => formatDate(resolvedIssue.value.support_deadline_at));
  const responseDeadlineLabel = computed(() => formatDate(resolvedIssue.value.response_deadline_at));
  const supportMetLabel = computed(() => formatDate(resolvedIssue.value.support_met_at));

  const remainingDays = computed(() => getRemainingCalendarDays(resolvedIssue.value.support_deadline_at));

  return {
    displayAuthorName,
    displayPhotoUrl,
    derivedStatus,
    categoryLabel,
    statusLabel,
    createdLabel,
    primaryTimeLabel,
    primaryTimeShortLabel,
    primaryTimeValueLabel,
    supportDeadlineLabel,
    responseDeadlineLabel,
    supportMetLabel,
    remainingDays,
    isOwnIssue,
  };
}
