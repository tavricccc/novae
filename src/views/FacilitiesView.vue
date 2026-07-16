<template>
  <section class="route-page relative flex h-full min-h-0 flex-col gap-5">
    <BoardControls
      v-model:status-tab="bucket"
      v-model:search-query="query"
      v-model:sort-option="sort"
      mode="facility"
      active-filter=""
      active-category-label="設備"
      create-label="新增設備"
      :search-hint="searchHint"
      @create="composerOpen = true"
      @submit-search="submitSearch"
      @clear-search="clearSearch"
    />

    <div class="scroll-shadow-bleed scrollbar-none min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain pb-4">
      <PageLoadFailure
        v-if="error && facilities.length === 0"
        title="設備讀取失敗"
        :description="error"
        @retry="load()"
      />
      <EmptyStatePanel
        v-else-if="!loading && facilities.length === 0"
        title="沒有符合條件的設備"
        :description="emptyDescription"
        icon="inbox"
      />
      <template v-else>
        <FacilityTable
          :facilities="facilities"
          :loading="loading"
          :highlight-query="committedQuery"
          @open-details="openDetails"
          @toggle-affected="toggleAffected"
          @manage-status="openStatusDialog"
          @delete="openDeleteDialog"
        />
        <div v-if="error" class="rounded-xl border border-error/20 bg-error-container px-4 py-3 text-sm font-semibold text-on-error-container">{{ error }}</div>
        <FeedLoadMoreControl :has-more="hasMore" :loading="loadingMore" :error="Boolean(error)" @load-more="load(true)" />
      </template>
    </div>

    <FacilityComposer :open="composerOpen" @close="composerOpen = false" @submitted="handleSubmitted" />
    <FacilityStatusDialog
      v-if="selectedFacility"
      :open="statusDialogOpen"
      :current-status="selectedFacility.status"
      :saving="statusSaving"
      :error="statusError"
      @close="closeStatusDialog"
      @submit="submitStatus"
    />
    <ConfirmDialog
      :open="deleteDialogOpen"
      title="確定要刪除這筆設備嗎？"
      message="刪除後這筆設備案件將無法復原。"
      confirm-label="確認刪除"
      :busy="deleting"
      @cancel="closeDeleteDialog"
      @confirm="confirmDelete"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import BoardControls from '@/components/BoardControls.vue';
import FacilityComposer from '@/components/FacilityComposer.vue';
import FacilityStatusDialog from '@/components/FacilityStatusDialog.vue';
import FacilityTable from '@/components/FacilityTable.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import EmptyStatePanel from '@/components/ui/EmptyStatePanel.vue';
import FeedLoadMoreControl from '@/components/ui/FeedLoadMoreControl.vue';
import PageLoadFailure from '@/components/ui/PageLoadFailure.vue';
import { useFacilities } from '@/composables/useFacilities';
import { useActionFeedback } from '@/composables/useActionFeedback';
import { normalizeSearchText } from '@/lib/search';
import type { FacilityRecord, FacilityStatus, FacilitySummary } from '@/types';

const router = useRouter();
const composerOpen = ref(false);
const { bucket, changeStatus, clearSearch, committedQuery, error, facilities, hasMore, load, loading, loadingMore, query, remove, sort, submitSearch, toggleAffected } = useFacilities();
const selectedFacility = ref<FacilitySummary | null>(null);
const statusDialogOpen = ref(false);
const statusSaving = ref(false);
const statusError = ref('');
const deleteDialogOpen = ref(false);
const deleting = ref(false);
const { show } = useActionFeedback();
const searchHint = computed(() => {
  const draft = normalizeSearchText(query.value);
  const committed = normalizeSearchText(committedQuery.value);
  if (draft !== committed) return '按 Enter 搜尋。';
  if (!committed) return '輸入關鍵字後按 Enter 搜尋。';
  if (committed.length < 3) return '目前只搜尋已載入的設備；輸入至少 3 個字可搜尋更多。';
  return `正在搜尋「${committedQuery.value}」`;
});
const emptyDescription = computed(() => committedQuery.value.trim()
  ? `沒有找到與「${committedQuery.value.trim()}」相關的設備。`
  : `目前沒有${bucket.value === 'closed' ? '已結案' : '處理中'}設備。`);

function openDetails(facility: FacilitySummary) {
  void router.push({ name: 'facility-detail', params: { facilityId: facility.id } });
}

function handleSubmitted(facility: FacilityRecord) {
  facilities.value.unshift(facility);
}

function openStatusDialog(facility: FacilitySummary) {
  selectedFacility.value = facility;
  statusError.value = '';
  statusDialogOpen.value = true;
}
function closeStatusDialog() {
  if (!statusSaving.value) statusDialogOpen.value = false;
}
async function submitStatus(status: FacilityStatus, result: string) {
  if (!selectedFacility.value || statusSaving.value) return;
  statusSaving.value = true;
  statusError.value = '';
  try {
    await changeStatus(selectedFacility.value, status, result);
    statusDialogOpen.value = false;
  } catch (caught) {
    statusError.value = caught instanceof Error ? caught.message : '更新失敗，請稍後再試。';
  } finally {
    statusSaving.value = false;
  }
}
function openDeleteDialog(facility: FacilitySummary) {
  selectedFacility.value = facility;
  deleteDialogOpen.value = true;
}
function closeDeleteDialog() {
  if (!deleting.value) deleteDialogOpen.value = false;
}
async function confirmDelete() {
  if (!selectedFacility.value || deleting.value) return;
  deleting.value = true;
  try {
    await remove(selectedFacility.value);
    deleteDialogOpen.value = false;
  } catch (caught) {
    show(caught instanceof Error ? caught.message : '刪除失敗，請稍後再試。', 'error');
  } finally {
    deleting.value = false;
  }
}
</script>
