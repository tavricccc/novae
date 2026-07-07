import { computed, ref, watch, type Ref } from 'vue';
import { useSession } from '@/composables/useSession';
import { getDerivedIssueStatus, getRemainingCalendarDays } from '@/lib/issue-status';
import { formatDate } from '@/lib/format';
import { ISSUE_CATEGORY_LABELS, issueRequiresReview, issueStoresAuthorPrivately } from '@/constants/categories';
import { ISSUE_STATUS_LABELS } from '@/constants/statuses';
import { useAuthorAvatarUrl } from '@/composables/useAuthorAvatar';
import { fetchPrivateAuthorInfo } from '@/services/issues';
import type { IssueRecord, PrivateAuthorRecord } from '@/types';

export function useIssueDisplay(issue: Ref<IssueRecord> | (() => IssueRecord)) {
  const { user } = useSession();
  const realAuthor = ref<PrivateAuthorRecord | null>(null);

  const resolvedIssue = computed(() => {
    return typeof issue === 'function' ? issue() : issue.value;
  });

  const isOwnIssue = computed(() => {
    const i = resolvedIssue.value;
    if (i.author_uid === user.value?.uid) return true;
    if (realAuthor.value?.author_uid === user.value?.uid) return true;
    return false;
  });

  const displayAuthorName = computed(() => {
    const i = resolvedIssue.value;
    if (!issueStoresAuthorPrivately(i.category)) {
      return i.author_name || '未知';
    }

    if (realAuthor.value) {
      return realAuthor.value.author_name;
    }
    if (i.author_name) {
      return i.author_name;
    }
    return '匿名使用者';
  });

  const displayAuthorUid = computed(() => {
    const i = resolvedIssue.value;
    if (!issueStoresAuthorPrivately(i.category)) {
      return i.author_uid || null;
    }

    if (realAuthor.value) {
      return realAuthor.value.author_uid;
    }
    if (i.author_uid) {
      return i.author_uid;
    }
    return null;
  });

  const fallbackPhotoUrl = computed(() => {
    const i = resolvedIssue.value;
    if (!issueStoresAuthorPrivately(i.category)) {
      return i.author_photo_url || null;
    }

    if (realAuthor.value) {
      return realAuthor.value.author_photo_url;
    }
    if (i.author_photo_url) {
      return i.author_photo_url;
    }
    return null;
  });
  const displayPhotoUrl = useAuthorAvatarUrl(
    displayAuthorUid,
    fallbackPhotoUrl,
  );

  watch(
    () => [resolvedIssue.value.id, resolvedIssue.value.category, user.value?.uid] as const,
    async ([issueId, category, uid]) => {
      if (!issueStoresAuthorPrivately(category) || !uid) {
        realAuthor.value = null;
        return;
      }

      if (resolvedIssue.value.author_uid || resolvedIssue.value.author_name) {
        realAuthor.value = null;
        return;
      }

      try {
        realAuthor.value = await fetchPrivateAuthorInfo(issueId);
      } catch {
        realAuthor.value = null;
      }
    },
    { immediate: true }
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
    realAuthor,
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
