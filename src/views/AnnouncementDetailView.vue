<template>
  <div class="min-h-0">
    <PageLoadFailure
      v-if="sessionLoadingHasProblem"
      :title="sessionProblemTitle"
      :description="sessionProblemDescription"
      :retry-disabled="!sessionOnline"
      @retry="reloadPage"
    />

    <div v-else-if="sessionLoading || loadingAnnouncement" class="flex min-h-[50dvh] items-center justify-center" aria-label="正在載入公告" aria-busy="true">
      <LoadingSpinner :size="8" />
    </div>

    <div v-else-if="!isAllowedUser" class="sr-only" role="status">正在前往登入頁</div>

    <AnnouncementDetailPagePanel
      v-else-if="announcement"
      :announcement="announcement"
      :can-manage="isAdmin"
      :initial-tab="initialTab"
      :focus-comment-id="focusCommentId"
      :liking="liking"
      @back="goBackToAnnouncements"
      @content-unavailable="handleAnnouncementUnavailable"
      @delete="openDeleteDialog"
      @edit="openEditor"
      @share="copyAnnouncementUrl"
      @toggle-like="handleToggleLike"
      @comment-count-changed="handleCommentCountChanged"
    />

    <AnnouncementEditorDialog
      :announcement="announcement"
      :error="editorError"
      :open="editorOpen"
      :submitting="saving"
      @close="closeEditor"
      @save="handleSave"
    />

    <ConfirmDialog
      :open="deleteDialogOpen"
      title="確定要刪除這則公告嗎？"
      message="刪除後這則公告將無法復原。"
      confirm-label="確認刪除"
      busy-label="刪除中..."
      :busy="deleting"
      @cancel="closeDeleteDialog"
      @confirm="confirmDelete"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AnnouncementDetailPagePanel from '@/components/AnnouncementDetailPagePanel.vue';
import AnnouncementEditorDialog from '@/components/AnnouncementEditorDialog.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue';
import PageLoadFailure from '@/components/ui/PageLoadFailure.vue';
import type { UploadedImage } from '@/composables/useImageUpload';
import { useLoadingTimeout } from '@/composables/useLoadingTimeout';
import { useSession } from '@/composables/useSession';
import { useShareUrl } from '@/composables/useShareUrl';
import { useToast } from '@/composables/useToast';
import { normalizeRouteParam } from '@/lib/route';
import { resetAppConnection } from '@/lib/reconnect';
import {
  deleteAnnouncement,
  fetchAnnouncementRecordById,
  setAnnouncementLike,
  updateAnnouncement,
} from '@/services/announcements';
import { subscribeContentRealtimeEvents } from '@/services/realtime-events';
import { deleteUploadedImage } from '@/services/uploads';
import type { AnnouncementRecord } from '@/types';

const route = useRoute();
const router = useRouter();
const { initialized, isAdmin, isAllowedUser, loading } = useSession();
const { copyShareUrl } = useShareUrl();
const { showToast } = useToast();

const announcement = ref<AnnouncementRecord | null>(null);
const loadingAnnouncement = ref(false);
const editorError = ref('');
const editorOpen = ref(false);
const liking = ref(false);
const saving = ref(false);
const deleting = ref(false);
const deleteDialogOpen = ref(false);
let requestId = 0;
let realtimeUnsubscribe: (() => void) | null = null;
let realtimeRefreshTimer = 0;

const sessionLoading = computed(() => loading.value || !initialized.value);
const canLoadAnnouncement = computed(() => initialized.value && isAllowedUser.value);
const initialTab = computed(() => route.query.tab === 'comments' ? 'comments' : 'details');
const focusCommentId = computed(() => {
  const value = route.query.comment;
  return typeof value === 'string' ? value : '';
});
const {
  hasProblem: sessionLoadingHasProblem,
  isOnline: sessionOnline,
  problemDescription: sessionProblemDescription,
  problemTitle: sessionProblemTitle,
} = useLoadingTimeout(sessionLoading, 5_000);

function goBackToAnnouncements() {
  requestId += 1;
  router.replace({ name: 'announcements' });
}

function copyAnnouncementUrl() {
  if (!announcement.value) return;
  const href = router.resolve({
    name: 'announcement-detail',
    params: { announcementId: announcement.value.id },
  }).href;
  copyShareUrl(new URL(href, window.location.origin).toString());
}

function openEditor() {
  editorError.value = '';
  editorOpen.value = true;
}

function closeEditor() {
  if (saving.value) return;
  editorOpen.value = false;
}

async function handleSave(payload: { title: string; content: string; uploadedImages: UploadedImage[] }) {
  if (!announcement.value) return;

  saving.value = true;
  editorError.value = '';
  try {
    const updatedAnnouncement = await updateAnnouncement(announcement.value.id, payload);
    announcement.value = {
      ...updatedAnnouncement,
      currentUserLiked: announcement.value.currentUserLiked,
      like_count: announcement.value.like_count,
      comment_count: announcement.value.comment_count,
    };
    editorOpen.value = false;
    showToast('公告已儲存。', 'success');
  } catch (caught) {
    await Promise.allSettled(payload.uploadedImages.map((image) => deleteUploadedImage(image.storagePath)));
    editorError.value = caught instanceof Error ? caught.message : '公告儲存失敗。';
    showToast(editorError.value, 'error');
  } finally {
    saving.value = false;
  }
}

function openDeleteDialog() {
  deleteDialogOpen.value = true;
}

function closeDeleteDialog() {
  if (deleting.value) return;
  deleteDialogOpen.value = false;
}

async function confirmDelete() {
  if (!announcement.value) return;

  deleting.value = true;
  try {
    await deleteAnnouncement(announcement.value.id);
    deleteDialogOpen.value = false;
    showToast('公告已刪除。', 'success');
    goBackToAnnouncements();
  } catch (caught) {
    showToast(caught instanceof Error ? caught.message : '公告刪除失敗。', 'error');
  } finally {
    deleting.value = false;
  }
}

async function handleToggleLike() {
  if (!announcement.value) return;
  if (!isAllowedUser.value) {
    showToast('請先使用校內帳號登入後再按讚。', 'error');
    return;
  }
  if (liking.value) return;

  const currentAnnouncement = announcement.value;
  const previousLiked = currentAnnouncement.currentUserLiked;
  const previousLikeCount = currentAnnouncement.like_count;
  const nextLiked = !previousLiked;
  const nextLikeCount = Math.max(0, previousLikeCount + (nextLiked ? 1 : -1));
  liking.value = true;
  announcement.value = {
    ...currentAnnouncement,
    currentUserLiked: nextLiked,
    like_count: nextLikeCount,
  };
  try {
    const result = await setAnnouncementLike(currentAnnouncement.id, nextLiked);
    if (announcement.value?.id === currentAnnouncement.id) {
      announcement.value = {
        ...announcement.value,
        currentUserLiked: result.liked,
        like_count: result.like_count,
      };
    }
  } catch (caught) {
    if (announcement.value?.id === currentAnnouncement.id) {
      announcement.value = {
        ...announcement.value,
        currentUserLiked: previousLiked,
        like_count: previousLikeCount,
      };
    }
    showToast(caught instanceof Error ? caught.message : '操作失敗，請稍後再試。', 'error');
  } finally {
    liking.value = false;
  }
}

async function refreshAnnouncementSilently() {
  const currentAnnouncement = announcement.value;
  if (!currentAnnouncement) return;

  const currentRequestId = ++requestId;
  try {
    const fetchedAnnouncement = await fetchAnnouncementRecordById(currentAnnouncement.id);
    if (currentRequestId !== requestId) return;
    announcement.value = {
      ...fetchedAnnouncement,
      currentUserLiked: announcement.value?.currentUserLiked ?? fetchedAnnouncement.currentUserLiked,
    };
  } catch (caught) {
    if (currentRequestId !== requestId) return;
    showToast(caught instanceof Error ? caught.message : '找不到這則公告。', 'error');
    goBackToAnnouncements();
  }
}

function scheduleRealtimeRefresh() {
  window.clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer = window.setTimeout(() => {
    void refreshAnnouncementSilently();
  }, 300);
}

function handleCommentCountChanged(payload: { announcementId: string; commentCount: number }) {
  if (announcement.value?.id !== payload.announcementId) return;
  announcement.value = {
    ...announcement.value,
    comment_count: payload.commentCount,
  };
}

function handleAnnouncementUnavailable() {
  goBackToAnnouncements();
}

async function reloadPage() {
  await resetAppConnection();
  window.location.reload();
}

watch(
  [canLoadAnnouncement, () => route.params.announcementId],
  async ([canLoad, rawAnnouncementId]) => {
    if (!canLoad) return;
    const announcementId = normalizeRouteParam(rawAnnouncementId);
    if (!announcementId) {
      goBackToAnnouncements();
      return;
    }

    const currentRequestId = ++requestId;
    loadingAnnouncement.value = true;
    try {
      const fetchedAnnouncement = await fetchAnnouncementRecordById(announcementId);
      if (currentRequestId !== requestId) return;
      announcement.value = fetchedAnnouncement;
    } catch (caught) {
      if (currentRequestId !== requestId) return;
      showToast(caught instanceof Error ? caught.message : '找不到這則公告。', 'error');
      goBackToAnnouncements();
    } finally {
      if (currentRequestId === requestId) {
        loadingAnnouncement.value = false;
      }
    }
  },
  { immediate: true },
);

watch(
  () => [canLoadAnnouncement.value, route.params.announcementId] as const,
  ([canLoad, rawAnnouncementId]) => {
    realtimeUnsubscribe?.();
    realtimeUnsubscribe = null;
    window.clearTimeout(realtimeRefreshTimer);
    if (!canLoad) return;

    const announcementId = normalizeRouteParam(rawAnnouncementId);
    if (!announcementId) return;

    realtimeUnsubscribe = subscribeContentRealtimeEvents(`announcement-detail:${announcementId}`, (event) => {
      if (event.eventType !== 'announcement_changed') return;
      if (event.targetId !== announcementId) return;
      scheduleRealtimeRefresh();
    });
  },
  { immediate: true },
);

onScopeDispose(() => {
  realtimeUnsubscribe?.();
  window.clearTimeout(realtimeRefreshTimer);
});
</script>
