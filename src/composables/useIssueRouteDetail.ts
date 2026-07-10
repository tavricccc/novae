import { computed, onScopeDispose, ref, watch, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { normalizeIssueRouteFilterParam } from '@/constants/categories';
import { getDerivedIssueStatus } from '@/lib/issue-status';
import { getIssueStatusBucket } from '@/lib/issue-timeline';
import { normalizeRouteParam } from '@/lib/route';
import { useToast } from '@/composables/useToast';
import { fetchIssueRecordById } from '@/services/issues';
import { subscribeContentRealtimeEvents } from '@/services/realtime-events';
import type { IssueRecord } from '@/types';
import { isAbortFailure } from '@/lib/request';

export function useIssueRouteDetail(
  supportedIssueIds: Ref<Set<string>>,
  issues?: Ref<IssueRecord[]>,
  enabled?: Ref<boolean>,
) {
  const route = useRoute();
  const router = useRouter();
  const { showToast } = useToast();
  const routeIssue = ref<IssueRecord | null>(null);
  const routeIssueLoading = ref(false);
  let requestId = 0;
  let realtimeUnsubscribe: (() => void) | null = null;
  let realtimeRefreshTimer = 0;

  const routeIssueSupportClosed = computed(() => {
    if (!routeIssue.value) {
      return true;
    }
    return !routeIssue.value.support_enabled || getDerivedIssueStatus(routeIssue.value) !== 'pending';
  });

  function issueListRoute(issue?: IssueRecord | null) {
    const query = { ...route.query };
    delete query.tab;
    delete query.comment;
    if (issue && getIssueStatusBucket(issue) === 'closed') {
      query.status = 'closed';
    } else if (issue) {
      delete query.status;
    }
    return {
      name: 'issues',
      params: { filter: normalizeIssueRouteFilterParam(route.params.filter) },
      query,
      hash: route.hash,
    };
  }

  function issueWithSupportState(issue: IssueRecord) {
    return {
      ...issue,
      currentUserSupported: issue.currentUserSupported || supportedIssueIds.value.has(issue.id),
    };
  }

  function closeRouteIssue() {
    const currentIssue = routeIssue.value;
    requestId += 1;
    routeIssue.value = null;
    routeIssueLoading.value = false;
    router.replace(issueListRoute(currentIssue));
  }

  function prefillRouteIssue(issue: IssueRecord) {
    requestId += 1;
    routeIssue.value = issueWithSupportState(issue);
    routeIssueLoading.value = false;
  }

  function updateRouteIssueSupport(supported: boolean, supportCount?: number) {
    if (!routeIssue.value) return;
    const nextIds = new Set(supportedIssueIds.value);
    if (supported) {
      nextIds.add(routeIssue.value.id);
    } else {
      nextIds.delete(routeIssue.value.id);
    }
    supportedIssueIds.value = nextIds;

    const offset = supported ? 1 : -1;
    routeIssue.value = {
      ...routeIssue.value,
      currentUserSupported: supported,
      support_count: typeof supportCount === 'number'
        ? supportCount
        : Math.max(0, routeIssue.value.support_count + offset),
    };
  }

  function patchRouteIssue(issue: IssueRecord) {
    if (routeIssue.value?.id !== issue.id) return;
    routeIssue.value = issueWithSupportState(issue);
  }

  async function handleRouteIssueError(currentRequestId: number) {
    if (currentRequestId !== requestId) return;
    routeIssue.value = null;
    routeIssueLoading.value = false;
    showToast('此頁面已不存在或你沒有權限查看此頁面。', 'error');
    await router.replace(issueListRoute());
  }

  watch(
    () => [route.name, route.params.issueId, route.params.filter, enabled?.value ?? true] as const,
    async ([routeName, rawIssueId, _rawFilter, isEnabled]) => {
      if (!isEnabled) return;
      const issueId = normalizeRouteParam(rawIssueId);
      if (routeName !== 'issue-detail' || !issueId) {
        requestId += 1;
        routeIssue.value = null;
        routeIssueLoading.value = false;
        return;
      }

      if (routeIssue.value?.id !== issueId) {
        routeIssue.value = null;
      }

      if (issues && issues.value) {
        const listedIssue = issues.value.find((i) => i.id === issueId);
        if (listedIssue) {
          routeIssue.value = issueWithSupportState(listedIssue);
        }
      }

      const currentRequestId = ++requestId;
      routeIssueLoading.value = true;
      try {
        const issue = await fetchIssueRecordById(issueId);
        if (currentRequestId !== requestId) return;
        routeIssue.value = issueWithSupportState(issue);
      } catch (error) {
        if (isAbortFailure(error)) return;
        await handleRouteIssueError(currentRequestId);
      } finally {
        if (currentRequestId === requestId) {
          routeIssueLoading.value = false;
        }
      }
    },
    { immediate: true },
  );

  async function refreshRouteIssueSilently() {
    const issueId = routeIssue.value?.id ?? normalizeRouteParam(route.params.issueId);
    if (!issueId) return;

    const currentRequestId = ++requestId;
    try {
      const issue = await fetchIssueRecordById(issueId);
      if (currentRequestId !== requestId) return;
      routeIssue.value = issueWithSupportState(issue);
    } catch (error) {
      if (isAbortFailure(error)) return;
      await handleRouteIssueError(currentRequestId);
    }
  }

  function scheduleRealtimeRefresh() {
    window.clearTimeout(realtimeRefreshTimer);
    realtimeRefreshTimer = window.setTimeout(() => {
      void refreshRouteIssueSilently();
    }, 300);
  }

  watch(
    () => [route.name, route.params.issueId, enabled?.value ?? true] as const,
    ([routeName, rawIssueId, isEnabled]) => {
      realtimeUnsubscribe?.();
      realtimeUnsubscribe = null;
      window.clearTimeout(realtimeRefreshTimer);
      const issueId = normalizeRouteParam(rawIssueId);
      if (!isEnabled || routeName !== 'issue-detail' || !issueId) return;

      realtimeUnsubscribe = subscribeContentRealtimeEvents(`issue-detail:${issueId}`, (event) => {
        if (event.eventType !== 'issue_changed') return;
        if (event.targetId !== issueId) return;
        scheduleRealtimeRefresh();
      });
    },
    { immediate: true },
  );

  watch(supportedIssueIds, (ids) => {
    if (!routeIssue.value) return;
    routeIssue.value = {
      ...routeIssue.value,
      currentUserSupported: routeIssue.value.currentUserSupported || ids.has(routeIssue.value.id),
    };
  });

  onScopeDispose(() => {
    realtimeUnsubscribe?.();
    window.clearTimeout(realtimeRefreshTimer);
  });

  return {
    routeIssue,
    routeIssueLoading,
    routeIssueSupportClosed,
    closeRouteIssue,
    prefillRouteIssue,
    patchRouteIssue,
    updateRouteIssueSupport,
  };
}
