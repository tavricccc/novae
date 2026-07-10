<template>
  <section class="mx-auto w-full max-w-7xl space-y-5">
    <AnnouncementControls
      v-model:sort-option="sortOption"
    >
      <template #actions>
        <CreateActionMenu
          v-if="isAdmin"
          :can-create-announcement="isAdmin"
          :default-category="DEFAULT_ISSUE_CATEGORY"
          default-kind="announcement"
          @create-announcement="openEditor(null)"
          @create-issue="handleCreateIssue"
        >
          <template #trigger="{ open }">
            <button
              type="button"
              class="button-icon-filled flex !h-10 !w-10 items-center justify-center shrink-0 md:!h-9 md:!w-9"
              title="新增"
              aria-label="新增"
              @click="open"
            >
              <AppIcon name="plus" :size="4" :stroke-width="2.5" />
            </button>
          </template>
        </CreateActionMenu>
      </template>
    </AnnouncementControls>

    <div>
      <PageLoadFailure
        v-if="announcementLoadingHasProblem"
        :title="announcementProblemTitle"
        :description="announcementProblemDescription"
        :retry-disabled="!announcementOnline"
        @retry="retryAnnouncements"
      />

      <SkeletonAnnouncementList v-else-if="visibleAnnouncementLoading" :can-manage="isAdmin" />

      <EmptyStatePanel
        v-else-if="!isAllowedUser"
        title="無法查看公告"
        description="請先使用校內帳號登入。"
        icon="lock"
      />

      <EmptyStatePanel
        v-else-if="error && announcements.length === 0"
        title="公告讀取失敗"
        :description="error"
        icon="warning"
        tone="danger"
        action-label="重新整理"
        @action="retryAnnouncements"
      />

      <Transition v-else-if="announcements.length === 0" name="board-content" appear>
        <EmptyStatePanel
          title="目前沒有公告"
          description="公告發布後會顯示在這裡。"
          icon="chart"
        />
      </Transition>

      <template v-else>
        <AnnouncementTable
          :announcements="announcements"
          :can-manage="isAdmin"
          :liking-announcement-id="likingAnnouncementId"
          @delete="handleListDelete"
          @edit="openEditor"
          @open="openAnnouncementDetails"
          @open-comments="(announcement) => openAnnouncementDetails(announcement, 'comments')"
          @toggle-like="handleToggleLike"
        />

        <div v-if="error" class="mt-3 rounded-xl border border-error/20 bg-error-container px-4 py-3 text-sm font-semibold text-on-error-container">
          {{ error }}
        </div>
        <SkeletonAnnouncementList v-if="loadingMore" class="mt-2" :count="2" :can-manage="isAdmin" />
        <div ref="loadMoreSentinel" class="h-1" aria-hidden="true"></div>
      </template>
    </div>

    <AnnouncementEditorDialog
      :announcement="editingAnnouncement"
      :error="editorError"
      :open="editorOpen"
      :submitting="saving"
      @close="closeEditor"
      @save="handleSave"
    />

    <ConfirmDialog
      :open="Boolean(deletePendingAnnouncement)"
      title="確定要刪除這則公告嗎？"
      message="刪除後這則公告將無法復原。"
      confirm-label="確認刪除"
      busy-label="刪除中..."
      :busy="deleting"
      @cancel="closeDeleteDialog"
      @confirm="confirmDelete"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AnnouncementControls from '@/components/AnnouncementControls.vue';
import AnnouncementEditorDialog from '@/components/AnnouncementEditorDialog.vue';
import AnnouncementTable from '@/components/AnnouncementTable.vue';
import CreateActionMenu from '@/components/CreateActionMenu.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import AppIcon from '@/components/ui/AppIcon.vue';
import EmptyStatePanel from '@/components/ui/EmptyStatePanel.vue';
import SkeletonAnnouncementList from '@/components/ui/SkeletonAnnouncementList.vue';
import PageLoadFailure from '@/components/ui/PageLoadFailure.vue';
import {
  CREATE_ANNOUNCEMENT_QUERY_VALUE,
  CREATE_ENTRY_QUERY_KEY,
  registerCreateAnnouncementHandler,
  requestCreateIssue,
} from '@/composables/useCreateEntryActions';
import { useInfiniteScroll } from '@/composables/useInfiniteScroll';
import { useAnnouncementManagement } from '@/composables/useAnnouncementManagement';
import { useMinimumLoading } from '@/composables/useMinimumLoading';
import { useLoadingTimeout } from '@/composables/useLoadingTimeout';
import { DEFAULT_ISSUE_CATEGORY } from '@/constants/categories';
import { resetAppConnection } from '@/lib/reconnect';
import type { IssueCategory } from '@/types';

const {
  announcements,
  sortOption,
  loading,
  loadingMore,
  error,
  hasMore,
  loadMoreAnnouncements,
  refreshAnnouncements,
  editingAnnouncement,
  editorError,
  editorOpen,
  likingAnnouncementId,
  saving,
  deleting,
  deletePendingAnnouncement,
  sessionLoading,
  isAdmin,
  isAllowedUser,
  openAnnouncementDetails,
  openEditor,
  closeEditor,
  handleSave,
  handleListDelete,
  closeDeleteDialog,
  confirmDelete,
  handleToggleLike,
} = useAnnouncementManagement();

const route = useRoute();
const router = useRouter();
const rawAnnouncementLoading = computed(() => sessionLoading.value || loading.value);
const { visibleLoading: visibleAnnouncementLoading } = useMinimumLoading(rawAnnouncementLoading);
const {
  hasProblem: announcementLoadingHasProblem,
  isOnline: announcementOnline,
  problemDescription: announcementProblemDescription,
  problemTitle: announcementProblemTitle,
} = useLoadingTimeout(rawAnnouncementLoading, 5_000);
const infiniteScrollDisabled = computed(() =>
  !hasMore.value || loading.value || loadingMore.value || !isAllowedUser.value
);
async function retryAnnouncements() {
  await resetAppConnection();
  await refreshAnnouncements();
}
async function handleCreateIssue(category: IssueCategory) {
  await requestCreateIssue(router, category);
}

async function clearCreateQuery() {
  const query = { ...route.query };
  delete query[CREATE_ENTRY_QUERY_KEY];
  await router.replace({ query });
}

registerCreateAnnouncementHandler(() => openEditor(null));

watch(
  () => route.query[CREATE_ENTRY_QUERY_KEY],
  (createType) => {
    if (createType !== CREATE_ANNOUNCEMENT_QUERY_VALUE) return;
    openEditor(null);
    void clearCreateQuery();
  },
  { immediate: true },
);

const { sentinel: loadMoreSentinel } = useInfiniteScroll({
  disabled: infiniteScrollDisabled,
  onLoadMore: loadMoreAnnouncements,
});
</script>
