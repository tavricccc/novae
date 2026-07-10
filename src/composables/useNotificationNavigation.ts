import { useRouter } from 'vue-router';
import { fetchAnnouncementRecordById } from '@/services/announcements';
import { fetchIssueRecordById } from '@/services/issues';
import { useToast } from '@/composables/useToast';
import type { NotificationRecord } from '@/types';

export function useNotificationNavigation() {
  const router = useRouter();
  const { showToast } = useToast();
  let navigationVersion = 0;

  function commentQuery(notification: NotificationRecord) {
    const isComment = notification.type === 'announcement_comment_created' || notification.type === 'issue_comment_created';
    if (!isComment) return undefined;
    return {
      tab: 'comments',
      ...(notification.comment_id ? { comment: notification.comment_id } : {}),
    };
  }

  async function openNotificationTarget(notification: NotificationRecord) {
    const currentVersion = ++navigationVersion;
    if (notification.type === 'issue_deleted') {
      showToast('這筆提案已被刪除。', 'info');
      return false;
    }

    try {
      if (notification.target_type === 'announcement') {
        const announcement = await fetchAnnouncementRecordById(notification.target_id);
        if (currentVersion !== navigationVersion) return false;
        await router.push({
          name: 'announcement-detail',
          params: { announcementId: announcement.id },
          query: commentQuery(notification),
        });
        return true;
      }

      const issue = await fetchIssueRecordById(notification.target_id);
      if (currentVersion !== navigationVersion) return false;
      await router.push({
        name: 'issue-detail',
        params: {
          filter: issue.category,
          issueId: issue.id,
        },
        query: commentQuery(notification),
      });
      return true;
    } catch {
      if (currentVersion === navigationVersion) {
        showToast('此內容已不存在或你沒有權限查看。', 'error');
      }
      return false;
    }
  }

  return {
    openNotificationTarget,
  };
}
