import { computed, onScopeDispose, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAnnouncements } from '@/composables/useAnnouncements';
import { registerAppResumeHandler } from '@/composables/useAppResume';
import { useNetworkStatus } from '@/composables/useNetworkStatus';
import { useSession } from '@/composables/useSession';
import { useActionFeedback } from '@/composables/useActionFeedback';
import {
  createAnnouncement,
  deleteAnnouncement,
  fetchAnnouncementRecordById,
  setAnnouncementLike,
} from '@/services/announcements';
import { subscribeContentRealtimeEvents } from '@/services/realtime-events';
import { deleteUploadedImages } from '@/services/uploads';
import type { UploadedImage } from '@/composables/useImageUpload';
import type { AnnouncementRecord } from '@/types';
import { isContentUnavailableError } from '@/services/issues-core';
import {
  markContentRealtimeReliable,
  markContentRealtimeUnreliable,
  markContentWentOffline,
  shouldRefreshContentAfterResume,
} from '@/services/content-read-cache';

export function useAnnouncementManagement() {
  const router = useRouter();
  const { initialized, isAdmin, isAllowedUser, loading: authLoading, roleLoading, user } = useSession();
  const { show, start } = useActionFeedback();
  const { isOnline } = useNetworkStatus();
  const announcementCacheScope = computed(() => [
    initialized.value ? 'ready' : 'booting',
    isAllowedUser.value ? 'allowed' : 'blocked',
    user.value?.uid ?? '',
    isAdmin.value ? 'admin' : 'user',
  ].join(':'));
  const {
    announcements,
    loading,
    loadingMore,
    updatedAt,
    error,
    hasMore,
    loadMoreAnnouncements,
    forceRefreshAnnouncements,
    patchAnnouncement,
    upsertAnnouncement,
    removeAnnouncement,
    refreshAnnouncements,
    resetAnnouncements,
  } = useAnnouncements({ cacheScope: announcementCacheScope });
  const composerError = ref('');
  const composerOpen = ref(false);
  const liking = ref(false);
  const likingAnnouncementId = ref('');
  const saving = ref(false);
  const deleting = ref(false);
  const deletePendingAnnouncement = ref<AnnouncementRecord | null>(null);
  const sessionLoading = computed(() => authLoading.value || !initialized.value);
  let realtimeUnsubscribe: (() => void) | null = null;
  const unregisterResumeHandler = registerAppResumeHandler(() => {
    if (!initialized.value || !isAllowedUser.value) return;
    if (!shouldRefreshContentAfterResume(updatedAt.value)) return;
    void refreshAnnouncementList({ force: true });
  });

  function openAnnouncementDetails(announcement: AnnouncementRecord, initialTab: 'details' | 'comments' = 'details') {
    router.push({
      name: 'announcement-detail',
      params: { announcementId: announcement.id },
      query: initialTab === 'comments' ? { tab: 'comments' } : undefined,
    });
  }

  function openComposer() {
    composerError.value = '';
    composerOpen.value = true;
  }

  function closeComposer() {
    if (saving.value) return;
    composerOpen.value = false;
  }

  async function publishAnnouncement(payload: { title: string; content: string; uploadedImages: UploadedImage[] }) {
    saving.value = true;
    composerError.value = '';
    const feedbackHandle = start('正在發布公告');
    try {
      const announcement = await createAnnouncement(payload);
      upsertAnnouncement(announcement);
      composerOpen.value = false;
      feedbackHandle.succeed('公告已發布');
    } catch (caught) {
      await deleteUploadedImages(payload.uploadedImages.map((image) => image.storagePath)).catch(() => undefined);
      composerError.value = caught instanceof Error ? caught.message : '公告發布失敗。';
      feedbackHandle.fail(composerError.value);
    } finally {
      saving.value = false;
    }
  }

  function handleListDelete(announcement: AnnouncementRecord) {
    deletePendingAnnouncement.value = announcement;
  }

  function closeDeleteDialog() {
    if (deleting.value) return;
    deletePendingAnnouncement.value = null;
  }

  async function confirmDelete() {
    const announcement = deletePendingAnnouncement.value;
    if (!announcement) return;

    deleting.value = true;
    const feedbackHandle = start('正在刪除公告');
    try {
      await deleteAnnouncement(announcement.id);
      removeAnnouncement(announcement.id);
      deletePendingAnnouncement.value = null;
      feedbackHandle.succeed('公告已刪除');
    } catch (caught) {
      feedbackHandle.fail(caught instanceof Error ? caught.message : '公告刪除失敗');
    } finally {
      deleting.value = false;
    }
  }

  async function handleToggleLike(announcement: AnnouncementRecord | null) {
    if (!announcement) return;
    if (!isAllowedUser.value) {
      show('請先登入再按讚', 'error');
      return;
    }
    if (liking.value) return;

    const previousLiked = announcement.currentUserLiked;
    const previousLikeCount = announcement.like_count;
    const nextLiked = !previousLiked;
    const nextLikeCount = Math.max(0, previousLikeCount + (nextLiked ? 1 : -1));
    liking.value = true;
    likingAnnouncementId.value = announcement.id;
    patchAnnouncement(announcement.id, (item) => ({
      ...item,
      currentUserLiked: nextLiked,
      like_count: nextLikeCount,
    }));
    try {
      const result = await setAnnouncementLike(announcement.id, nextLiked);
      patchAnnouncement(announcement.id, (item) => ({
        ...item,
        currentUserLiked: result.liked,
        like_count: result.like_count,
      }));
    } catch (caught) {
      patchAnnouncement(announcement.id, (item) => ({
        ...item,
        currentUserLiked: previousLiked,
        like_count: previousLikeCount,
      }));
      if (isContentUnavailableError(caught)) {
        handleAnnouncementUnavailable(announcement.id);
      }
      show(caught instanceof Error ? caught.message : '操作失敗，請稍後再試', 'error');
    } finally {
      liking.value = false;
      likingAnnouncementId.value = '';
    }
  }

  function handleAnnouncementUnavailable(announcementId: string) {
    removeAnnouncement(announcementId);
  }

  async function refreshAnnouncementList(options: { force?: boolean } = {}) {
    if (options.force) {
      await forceRefreshAnnouncements();
      markContentRealtimeReliable();
      return;
    }
    await refreshAnnouncements();
  }

  watch(
    [initialized, isAllowedUser],
    ([ready, allowed]) => {
      if (!ready) return;
      if (allowed) {
        void refreshAnnouncementList();
        return;
      }
      resetAnnouncements();
    },
    { immediate: true },
  );

  watch(
    [initialized, isAllowedUser, roleLoading],
    ([ready, allowed, waitingForRole]) => {
      realtimeUnsubscribe?.();
      realtimeUnsubscribe = null;
      if (!ready || !allowed || waitingForRole) return;

      realtimeUnsubscribe = subscribeContentRealtimeEvents('announcements', (event) => {
        if (event.eventType === 'announcement_metrics_changed') {
          patchAnnouncement(event.targetId, (announcement) => ({
            ...announcement,
            comment_count: event.commentCount ?? announcement.comment_count,
            like_count: event.likeCount ?? announcement.like_count,
          }));
          return;
        }
        if (event.eventType !== 'announcement_changed') return;
        if (event.op === 'delete') {
          removeAnnouncement(event.targetId);
          return;
        }
        void fetchAnnouncementRecordById(event.targetId, {
          cacheScope: announcementCacheScope.value,
          forceRefresh: true,
        }).then((announcement) => {
          upsertAnnouncement(announcement);
        }).catch(() => removeAnnouncement(event.targetId));
      }, () => {
        markContentRealtimeUnreliable();
        void refreshAnnouncementList({ force: true });
      });
    },
    { immediate: true },
  );

  onScopeDispose(() => {
    realtimeUnsubscribe?.();
    unregisterResumeHandler();
  });

  watch(isOnline, (online) => {
    if (!online) {
      markContentWentOffline();
      return;
    }
    if (!initialized.value || !isAllowedUser.value) return;
    if (shouldRefreshContentAfterResume(updatedAt.value)) void refreshAnnouncementList({ force: true });
  });

  return {
    announcements,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMoreAnnouncements,
    refreshAnnouncements: () => refreshAnnouncementList({ force: true }),
    composerError,
    composerOpen,
    liking,
    likingAnnouncementId,
    saving,
    deleting,
    deletePendingAnnouncement,
    sessionLoading,
    isAdmin,
    isAllowedUser,
    openAnnouncementDetails,
    openComposer,
    closeComposer,
    publishAnnouncement,
    handleListDelete,
    closeDeleteDialog,
    confirmDelete,
    handleToggleLike,
  };
}
