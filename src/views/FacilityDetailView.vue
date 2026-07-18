<template>
  <RoutePageFrame as="div" bottom-safe layout="fill">
    <DetailRouteState
      :allowed="isAllowedUser"
      :loading="sessionLoading || loading"
      loading-label="facility.loadingFacility"
      :problem="sessionLoadingHasProblem"
      :problem-title="sessionProblemTitle"
      :problem-description="sessionProblemDescription"
      :problem-retry-disabled="!sessionOnline"
      :error="error"
      error-title="facility.failedToLoadFacilityTitle"
      @retry-problem="reloadPage"
      @retry-error="retryFacility"
    >
      <FacilityDetailPagePanel
        v-if="facility"
        :affecting="affecting"
        :closed="closed"
        :facility="facility"
        :next-status-action-label="nextStatusActionLabel"
        :operation-time-items="operationTimeItems"
        :status-class="statusClass"
        :status-label="t(FACILITY_STATUS_LABELS[facility.status])"
        @back="goBackToFacilities"
        @delete="openDeleteDialog"
        @manage-status="statusOpen = true"
        @share="copyFacilityUrl"
        @toggle-affected="handleToggleAffected"
      />
    </DetailRouteState>

    <FacilityStatusDialog
      v-if="facility"
      :open="statusOpen"
      :current-status="facility.status"
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
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import FacilityDetailPagePanel from '@/components/FacilityDetailPagePanel.vue';
import FacilityStatusDialog from '@/components/FacilityStatusDialog.vue';
import DetailRouteState from '@/components/ui/organisms/DetailRouteState.vue';
import RoutePageFrame from '@/components/ui/organisms/RoutePageFrame.vue';
import { useActionFeedback } from '@/composables/useActionFeedback';
import { useAuthenticatedDetailState } from '@/composables/useAuthenticatedDetailState';
import { useFacilityDetail } from '@/composables/useFacilityDetail';
import { useShareUrl } from '@/composables/useShareUrl';
import { useStatusStyling } from '@/composables/useStatusStyling';
import { FACILITY_STATUS_LABELS, isFacilityClosed } from '@/constants/statuses';
import { useI18n } from '@/i18n';
import { formatDate } from '@/lib/format';
import { resetAppConnection } from '@/lib/reconnect';
import { returnToNavigationOrigin } from '@/router/navigation-hierarchy';
import type { FacilityStatus, OperationTimeListItem } from '@/types';

const router = useRouter();
const {
  canLoad: canLoadFacility,
  isAllowedUser,
  sessionLoading,
  sessionLoadingHasProblem,
  sessionOnline,
  sessionProblemDescription,
  sessionProblemTitle,
} = useAuthenticatedDetailState();
const { copyRouteUrl } = useShareUrl();
const { show, start } = useActionFeedback();
const { t } = useI18n();

const {
  affecting,
  changeStatus,
  error,
  facility,
  load,
  loading,
  remove,
  toggleAffected,
} = useFacilityDetail(canLoadFacility);

const statusOpen = ref(false);
const statusSaving = ref(false);
const statusError = ref('');
const deleteDialogOpen = ref(false);
const deleting = ref(false);
const closed = computed(() => facility.value ? isFacilityClosed(facility.value.status) : false);
const nextStatusActionLabel = computed(() =>
  facility.value?.status === 'pending' ? 'facility.startProcessing' : 'facility.completeCannotResolve',
);
const operationTimeItems = computed<OperationTimeListItem[]>(() => {
  if (!facility.value) return [];
  const items: OperationTimeListItem[] = [];
  if (facility.value.created_at) {
    items.push({
      label: 'facility.waitingTime',
      shortLabel: 'facility.toBeAccepted',
      valueLabel: formatDate(facility.value.created_at),
    });
  }
  if (facility.value.started_at) {
    items.push({
      label: 'facility.startProcessingTime',
      shortLabel: 'facility.processingText',
      valueLabel: formatDate(facility.value.started_at),
    });
  }
  if (facility.value.closed_at) {
    const unable = facility.value.status === 'unable-to-handle';
    items.push({
      label: unable ? 'facility.markedUnresolved' : 'facility.completionTime',
      shortLabel: unable ? 'facility.cannotBeResolved' : 'facility.finish',
      valueLabel: formatDate(facility.value.closed_at),
    });
  }
  return items;
});
const status = computed(() => facility.value?.status ?? 'pending');
const { statusClass } = useStatusStyling(status, 'dialog');

function goBackToFacilities() {
  if (returnToNavigationOrigin(router)) return;
  void router.replace({ name: 'facilities' });
}

function copyFacilityUrl() {
  if (!facility.value) return;
  void copyRouteUrl({
    name: 'facility-detail',
    params: { facilityId: facility.value.id },
  });
}

async function handleToggleAffected() {
  try {
    await toggleAffected();
  } catch (caught) {
    show(caught instanceof Error ? caught.message : 'facility.operationFailedPleaseTryAgainLater', 'error');
  }
}

function closeStatusDialog() {
  if (!statusSaving.value) {
    statusOpen.value = false;
    statusError.value = '';
  }
}

async function submitStatus(nextStatus: FacilityStatus, result: string) {
  if (statusSaving.value) return;
  statusSaving.value = true;
  statusError.value = '';
  const feedback = start('facility.updatingFacilityStatus');
  try {
    await changeStatus(nextStatus, result);
    statusOpen.value = false;
    feedback.succeed('facility.facilityStatusUpdated');
  } catch (caught) {
    statusError.value = caught instanceof Error ? caught.message : 'facility.updateFailedPleaseTryAgainLater';
    feedback.fail(statusError.value);
  } finally {
    statusSaving.value = false;
  }
}

function openDeleteDialog() {
  deleteDialogOpen.value = true;
}

function closeDeleteDialog() {
  if (!deleting.value) deleteDialogOpen.value = false;
}

async function confirmDelete() {
  if (!facility.value || deleting.value) return;
  deleting.value = true;
  const feedback = start('facility.deletingFacilityReport');
  try {
    await remove();
    deleteDialogOpen.value = false;
    feedback.succeed('facility.facilityReportDeleted');
    goBackToFacilities();
  } catch (caught) {
    feedback.fail(caught instanceof Error ? caught.message : 'facility.failedToDeleteFacility');
  } finally {
    deleting.value = false;
  }
}

async function retryFacility() {
  await resetAppConnection();
  await load();
}

async function reloadPage() {
  await resetAppConnection();
  window.location.reload();
}
</script>
