<template>
  <RoutePageFrame layout="fill" class="relative gap-5">
    <BoardControls
      v-model:status-tab="bucket"
      v-model:search-query="query"
      v-model:sort-option="sort"
      mode="facility"
      active-filter=""
      :active-category-label="t('facility.facility')"
      :create-label="t('facility.addFacility')"
      :search-hint="searchHint"
      @create="composerOpen = true"
      @submit-search="submitSearch"
      @clear-search="clearSearch"
    />

    <div class="route-scroll-through scroll-shadow-bleed scrollbar-none min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain">
      <ContentListState
        :empty="facilities.length === 0"
        :empty-description="emptyDescription"
        empty-title="facility.noMatchingFacilities"
        :error="error"
        error-title="facility.failedToLoadFacilityTitle"
        :has-more="hasMore"
        :loading="visibleFacilityLoading"
        :loading-has-problem="facilityLoadingHasProblem"
        :loading-more="loadingMore"
        :panel-key="facilityPanelKey"
        :problem-description="facilityProblemDescription"
        :problem-title="facilityProblemTitle"
        :retry-disabled="!facilityOnline"
        @load-more="load(true)"
        @retry="retryFacilities"
      >
        <template #loading>
          <FacilityTable :facilities="[]" :loading="true" />
        </template>

        <template #loading-more>
          <FacilityTable :facilities="[]" :loading="true" />
        </template>

        <FacilityTable
          :affecting-facility-id="affectingFacilityId"
          :facilities="facilities"
          :loading="false"
          :highlight-query="committedQuery"
          @open-details="openDetails"
          @toggle-affected="handleToggleAffected"
          @manage-status="openStatusDialog"
          @delete="openDeleteDialog"
        />

        <template #sentinel>
          <div ref="loadMoreSentinel" class="h-1" aria-hidden="true"></div>
        </template>
      </ContentListState>
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
      title="facility.areYouSureYouWantToDeleteThisFacilityReport"
      message="facility.deleteWarning"
      confirm-label="comments.confirmDeletion"
      :busy="deleting"
      @cancel="closeDeleteDialog"
      @confirm="confirmDelete"
    />
  </RoutePageFrame>
</template>

<script setup lang="ts">
import RoutePageFrame from '@/components/ui/organisms/RoutePageFrame.vue';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import BoardControls from '@/components/BoardControls.vue';
import FacilityComposer from '@/components/FacilityComposer.vue';
import FacilityStatusDialog from '@/components/FacilityStatusDialog.vue';
import FacilityTable from '@/components/FacilityTable.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import ContentListState from '@/components/ui/organisms/ContentListState.vue';
import { useFacilities } from '@/composables/useFacilities';
import { useActionFeedback } from '@/composables/useActionFeedback';
import { useContentListRuntime } from '@/composables/useContentListRuntime';
import { normalizeSearchText } from '@/lib/search';
import type { FacilityRecord, FacilityStatus, FacilitySummary } from '@/types';
import { useI18n } from '@/i18n';

const router = useRouter();
const { t } = useI18n();
const composerOpen = ref(false);
const {
  affectingFacilityId,
  bucket,
  changeStatus,
  clearSearch,
  committedQuery,
  error,
  facilities,
  hasMore,
  load,
  loading,
  loadingMore,
  query,
  remove,
  sort,
  submitSearch,
  toggleAffected,
} = useFacilities();
const selectedFacility = ref<FacilitySummary | null>(null);
const statusDialogOpen = ref(false);
const statusSaving = ref(false);
const statusError = ref('');
const deleteDialogOpen = ref(false);
const deleting = ref(false);
const { show } = useActionFeedback();
const facilityPanelKey = computed(() => [
  bucket.value,
  sort.value,
  committedQuery.value.trim(),
].join(':'));
const {
  isOnline: facilityOnline,
  loadMoreSentinel,
  loadingHasProblem: facilityLoadingHasProblem,
  problemDescription: facilityProblemDescription,
  problemTitle: facilityProblemTitle,
  retry: retryFacilities,
  visibleLoading: visibleFacilityLoading,
} = useContentListRuntime({
  error,
  hasMore,
  loadMore: () => load(true),
  loading,
  loadingMore,
  refresh: () => load(),
});
const searchHint = computed(() => {
  const draft = normalizeSearchText(query.value);
  const committed = normalizeSearchText(committedQuery.value);
  if (draft !== committed) return t('issue.search.pressEnterToSearch');
  if (!committed) return t('issue.search.enterTheKeywordAndPressEnterToSearch');
  if (committed.length < 3) return t('facility.search.loadedOnlyHint');
  return t('facility.searchForQuery', { query: committedQuery.value });
});
const emptyDescription = computed(() => committedQuery.value.trim()
  ? t('facility.noFacilityReportsMatchQuery', { query: committedQuery.value.trim() })
  : t('facility.noFacilityReportsInStatus', { status: t(bucket.value === 'closed' ? 'facility.caseClosed' : 'facility.processing') }));

function openDetails(facility: FacilitySummary) {
  void router.push({ name: 'facility-detail', params: { facilityId: facility.id } });
}

function handleSubmitted(facility: FacilityRecord) {
  facilities.value.unshift(facility);
}

async function handleToggleAffected(facility: FacilitySummary) {
  try {
    await toggleAffected(facility);
  } catch (caught) {
    show(caught instanceof Error ? t(caught.message) : t('facility.theOperationFailedPleaseTryAgainLater'), 'error');
  }
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
    statusError.value = caught instanceof Error ? t(caught.message) : t('facility.updateFailedPleaseTryAgainLater');
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
    show(caught instanceof Error ? t(caught.message) : t('facility.deletionFailedPleaseTryAgainLater'), 'error');
  } finally {
    deleting.value = false;
  }
}
</script>
