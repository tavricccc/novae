import { ref, watch, type Ref } from 'vue';
import { useSession } from '@/composables/useSession';
import { useIssueDisplay } from '@/composables/useIssueDisplay';
import { useIssueSupport } from '@/composables/useIssueSupport';
import { useStatusStyling } from '@/composables/useStatusStyling';
import { useToast, type ToastKind } from '@/composables/useToast';
import { useDeleteIssue } from '@/composables/useDeleteIssue';
import type { IssueRecord } from '@/types';

export function useIssueItemController(
  issue: Ref<IssueRecord>,
  statusVariant: 'table-row',
  onSupportChanged: (payload: { issueId: string; supported: boolean; supportCount: number }) => void,
  onOpenDetails: (payload: { issue: IssueRecord; initialTab: 'details' | 'comments' }) => void,
  onIssueUpdated: (issue: IssueRecord) => void,
  onIssueDeleted: (issueId: string) => void,
) {
  const { isAdmin } = useSession();
  const { showToast } = useToast();
  const display = useIssueDisplay(issue);
  const currentUserSupported = ref(Boolean(issue.value.currentUserSupported));
  const supportCount = ref(issue.value.support_count);
  const isDropdownOpen = ref(false);
  const {
    isDeleteDialogOpen,
    isDeleting,
    actionError: deleteError,
    confirmDelete: openDeleteDialog,
    closeDeleteDialog,
    performDelete: deleteSelectedIssue,
  } = useDeleteIssue(issue.value.id);

  watch(
    () => [
      Boolean(issue.value.currentUserSupported),
      issue.value.support_count,
    ] as const,
    ([nextSupported, nextSupportCount]) => {
      currentUserSupported.value = nextSupported;
      supportCount.value = nextSupportCount;
    },
  );

  const { statusClass } = useStatusStyling(display.derivedStatus, statusVariant);
  const { supportClosed, supportProgressStyle, supportRemainingLabel, handleSupport } = useIssueSupport(
    issue,
    supportCount,
    currentUserSupported,
    display.remainingDays,
    display.derivedStatus,
    issue.value.id,
    (_event, payload) => onSupportChanged(payload),
  );

  function openDetails(initialTab: 'details' | 'comments' = 'details') {
    onOpenDetails({ issue: issue.value, initialTab });
  }

  function confirmDelete() {
    if (!isAdmin.value) {
      showToast('你目前沒有刪除此提案的權限。', 'error');
      return;
    }
    openDeleteDialog();
  }

  function showActionToast(message: string, kind: ToastKind) {
    if (message) {
      showToast(message, kind);
    }
  }

  async function performDelete() {
    const deletedIssueId = await deleteSelectedIssue();
    if (deleteError.value) {
      return;
    }
    if (deletedIssueId) {
      onIssueDeleted(deletedIssueId);
    }
  }

  return {
    ...display,
    isAdmin,
    currentUserSupported,
    supportCount,
    isDropdownOpen,
    statusClass,
    supportClosed,
    supportProgressStyle,
    supportRemainingLabel,
    isDeleteDialogOpen,
    isDeleting,
    closeDeleteDialog,
    handleSupport,
    openDetails,
    confirmDelete,
    performDelete,
    onIssueUpdated,
    showActionToast,
  };
}
