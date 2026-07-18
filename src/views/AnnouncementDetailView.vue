<template>
  <RoutePageFrame as="div" bottom-safe layout="fill">
    <DetailRouteState
      :allowed="isAllowedUser"
      :loading="sessionLoading || loading"
      loading-label="announcement.loadingAnnouncements"
      :problem="sessionLoadingHasProblem"
      :problem-title="sessionProblemTitle"
      :problem-description="sessionProblemDescription"
      :problem-retry-disabled="!sessionOnline"
      @retry-problem="reloadPage"
    >
      <AnnouncementDetailPagePanel
        v-if="announcement"
        :announcement="announcement"
        :can-manage="isAdmin"
        :initial-tab="initialTab"
        :focus-comment-id="focusCommentId"
        :liking="liking"
        @back="goBack"
        @content-unavailable="goBack"
        @delete="openDeleteDialog"
        @share="copyUrl"
        @toggle-like="toggleLike"
        @comment-count-changed="updateCommentCount"
      />
    </DetailRouteState>

    <ConfirmDialog
      :open="deleteDialogOpen"
      title="announcement.areYouSureYouWantToDeleteThisAnnouncement"
      message="announcement.deleteWarning"
      confirm-label="comments.confirmDeletion"
      :busy="deleting"
      @cancel="closeDeleteDialog"
      @confirm="confirmDelete"
    />
  </RoutePageFrame>
</template>

<script setup lang="ts">
import AnnouncementDetailPagePanel from '@/components/AnnouncementDetailPagePanel.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import DetailRouteState from '@/components/ui/organisms/DetailRouteState.vue';
import RoutePageFrame from '@/components/ui/organisms/RoutePageFrame.vue';
import { useAnnouncementDetail } from '@/composables/useAnnouncementDetail';
import { useAuthenticatedDetailState } from '@/composables/useAuthenticatedDetailState';
import { resetAppConnection } from '@/lib/reconnect';
const {
  canLoad: canLoadAnnouncement,
  isAllowedUser,
  sessionLoading,
  sessionLoadingHasProblem,
  sessionOnline,
  sessionProblemDescription,
  sessionProblemTitle,
} = useAuthenticatedDetailState();
const {
  announcement,
  closeDeleteDialog,
  confirmDelete,
  copyUrl,
  deleteDialogOpen,
  deleting,
  focusCommentId,
  goBack,
  initialTab,
  isAdmin,
  liking,
  loading,
  openDeleteDialog,
  toggleLike,
  updateCommentCount,
} = useAnnouncementDetail(canLoadAnnouncement);

async function reloadPage() {
  await resetAppConnection();
  window.location.reload();
}
</script>
