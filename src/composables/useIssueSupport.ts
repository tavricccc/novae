import { computed, type Ref, type ComputedRef } from 'vue';
import { getSupportProgressPercent, getSupportRemainingLabel } from '@/lib/issue-status';
import type { IssueRecord, IssueStatus } from '@/types';

export function useIssueSupport(
  issue: Ref<IssueRecord> | ComputedRef<IssueRecord>,
  supportCount: Ref<number>,
  currentUserSupported: Ref<boolean>,
  remainingDays: ComputedRef<number | null>,
  derivedStatus: ComputedRef<IssueStatus>,
  issueId: string,
  emit: (event: 'support-changed', payload: { issueId: string; supported: boolean; supportCount: number }) => void,
) {
  const supportClosed = computed(() =>
    derivedStatus.value !== 'pending'
    || issue.value.support_met_at !== null
    || (issue.value.support_goal !== null && supportCount.value >= issue.value.support_goal),
  );

  const supportProgressStyle = computed(() => {
    const i = issue.value;
    const progress = getSupportProgressPercent(supportCount.value, i.support_goal);
    return { width: `${progress}%` };
  });

  const supportRemainingLabel = computed(() => getSupportRemainingLabel(remainingDays.value));

  function handleSupport(payload: { supported: boolean; supportCount: number }) {
    const nextSupported = payload.supported;
    if (currentUserSupported.value && !nextSupported) {
      supportCount.value = Math.max(0, supportCount.value - 1);
    }
    if (!currentUserSupported.value && nextSupported) {
      supportCount.value += 1;
    }
    supportCount.value = payload.supportCount;
    currentUserSupported.value = nextSupported;
    emit('support-changed', {
      issueId,
      supported: nextSupported,
      supportCount: supportCount.value,
    });
  }

  return {
    supportClosed,
    supportProgressStyle,
    supportRemainingLabel,
    handleSupport,
  };
}
