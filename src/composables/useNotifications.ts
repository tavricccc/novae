import { computed, ref, watch } from 'vue';
import type { NotificationRecord, NotificationSource } from '@/types';
import { useSession } from '@/composables/useSession';
import { registerAppResumeHandler } from '@/composables/useAppResume';
import {
  fetchNotificationSourcePage,
  markNotificationsOpened,
  subscribeNotificationReadState,
  subscribeNotificationSource,
  type NotificationReadState,
} from '@/services/notifications';
import { resetAppConnection } from '@/lib/reconnect';

type Unsubscribe = () => void;

const notificationSources: NotificationSource[] = ['broadcast', 'admin', 'user'];
const defaultPersonalPreferences = {
  comments: true,
  issueUpdates: true,
};
type NotificationCursor = Awaited<ReturnType<typeof fetchNotificationSourcePage>>['cursor'];

function emptySourceRecord<T>(createValue: () => T): Record<NotificationSource, T> {
  return {
    broadcast: createValue(),
    admin: createValue(),
    user: createValue(),
  };
}

function isOnline() {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

function notificationLoadFailureMessage() {
  return isOnline()
    ? '通知載入失敗，請稍後再試。'
    : '目前已離線，請恢復網路連線後重新整理。';
}

function isPersonalNotificationVisible(notification: NotificationRecord, state: NotificationReadState) {
  if (notification.source !== 'user') return true;
  if (notification.type === 'announcement_comment_created' || notification.type === 'issue_comment_created') {
    return state.personalPreferences.comments;
  }
  if (
    notification.type === 'issue_status_changed'
    || notification.type === 'support_goal_met'
    || notification.type === 'issue_deleted'
  ) {
    return state.personalPreferences.issueUpdates;
  }
  return true;
}

const { user, isAdmin } = useSession();
const firstPages = ref(emptySourceRecord<NotificationRecord[]>(() => []));
const extraPages = ref(emptySourceRecord<NotificationRecord[]>(() => []));
const cursors = ref(emptySourceRecord<NotificationCursor>(() => null));
const sourceHasMore = ref(emptySourceRecord(() => false));
const readState = ref<NotificationReadState>({
  admin: null,
  broadcast: null,
  personalPreferences: { ...defaultPersonalPreferences },
  user: null,
});
const loading = ref(false);
const loadingMore = ref(false);
const error = ref('');
let firstPageIds = emptySourceRecord(() => '');
let initialized = false;
let loadingTimer: number | null = null;
let subscriptionVersion = 0;
let unsubscribes: Unsubscribe[] = [];

const activeSources = computed<NotificationSource[]>(() =>
  isAdmin.value ? notificationSources : ['broadcast', 'user'],
);

const notifications = computed(() => {
  const items = activeSources.value.flatMap((source) => {
    const firstPageIdSet = new Set(firstPages.value[source].map((notification) => notification.id));
    return [
      ...firstPages.value[source],
      ...extraPages.value[source].filter((notification) => !firstPageIdSet.has(notification.id)),
    ];
  });

  return items
    .filter((notification) => isPersonalNotificationVisible(notification, readState.value))
    .map((notification) => ({
      ...notification,
      is_read: Boolean(
        notification.created_at
        && readState.value[notification.source]
        && notification.created_at <= readState.value[notification.source]!,
      ),
    }))
    .sort((left, right) =>
      (right.created_at?.getTime() ?? 0) - (left.created_at?.getTime() ?? 0),
    );
});
const hasUnread = computed(() => notifications.value.some((notification) => !notification.is_read));
const hasMore = computed(() => activeSources.value.some((source) => sourceHasMore.value[source]));

function clearLoadingTimer() {
  if (loadingTimer !== null) window.clearTimeout(loadingTimer);
  loadingTimer = null;
}

function clearSubscriptions() {
  clearLoadingTimer();
  subscriptionVersion += 1;
  unsubscribes.forEach((unsubscribe) => unsubscribe());
  unsubscribes = [];
  firstPages.value = emptySourceRecord(() => []);
  extraPages.value = emptySourceRecord(() => []);
  cursors.value = emptySourceRecord(() => null);
  sourceHasMore.value = emptySourceRecord(() => false);
  readState.value = {
    admin: null,
    broadcast: null,
    personalPreferences: { ...defaultPersonalPreferences },
    user: null,
  };
  firstPageIds = emptySourceRecord(() => '');
}

function startSubscriptions() {
  const uid = user.value?.uid ?? '';
  clearSubscriptions();
  if (!uid) return;

  loading.value = true;
  error.value = '';
  const currentVersion = subscriptionVersion;
  const pendingSources = new Set(activeSources.value);
  loadingTimer = window.setTimeout(() => {
    if (currentVersion !== subscriptionVersion) return;
    loading.value = false;
    error.value = isOnline()
      ? '網路回應時間過長，請重新整理。'
      : '目前已離線，請恢復網路連線後重新整理。';
  }, 5_000);

  activeSources.value.forEach((source) => {
    unsubscribes.push(subscribeNotificationSource(
      source,
      uid,
      (page) => {
        if (currentVersion !== subscriptionVersion) return;
        const nextIds = page.notifications.map((notification) => notification.id).join(':');
        if (firstPageIds[source] && firstPageIds[source] !== nextIds) {
          extraPages.value[source] = [];
        }
        firstPageIds[source] = nextIds;
        firstPages.value[source] = page.notifications;
        cursors.value[source] = page.cursor;
        sourceHasMore.value[source] = page.hasMore;
        pendingSources.delete(source);
        loading.value = pendingSources.size > 0;
        if (!loading.value) clearLoadingTimer();
      },
      () => {
        if (currentVersion !== subscriptionVersion) return;
        pendingSources.delete(source);
        error.value = notificationLoadFailureMessage();
        loading.value = pendingSources.size > 0;
        if (!loading.value) clearLoadingTimer();
      },
    ));
  });

  unsubscribes.push(subscribeNotificationReadState(
    uid,
    (state) => {
      if (currentVersion === subscriptionVersion) readState.value = state;
    },
    () => {
      if (currentVersion === subscriptionVersion) {
        error.value = '通知狀態載入失敗，請稍後再試。';
      }
    },
  ));
}

function ensureNotificationsInitialized() {
  if (initialized) return;
  initialized = true;

  watch(
    () => [user.value?.uid ?? '', isAdmin.value] as const,
    startSubscriptions,
    { immediate: true },
  );
  registerAppResumeHandler(startSubscriptions);

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      if (error.value && user.value?.uid) startSubscriptions();
    });
  }
}

async function openNotifications() {
  if (!user.value) return;

  try {
    const result = await markNotificationsOpened();
    const openedAt = new Date(result.openedAtMs);
    readState.value = {
      broadcast: openedAt,
      user: openedAt,
      admin: isAdmin.value ? openedAt : readState.value.admin,
      personalPreferences: readState.value.personalPreferences,
    };
  } catch (nextError) {
    console.warn('[notifications]', nextError);
  }
}

async function retryNotifications() {
  await resetAppConnection();
  startSubscriptions();
}

async function loadMoreNotifications() {
  const uid = user.value?.uid;
  if (!uid || !hasMore.value || loadingMore.value) return;

  loadingMore.value = true;
  error.value = '';
  try {
    const results = await Promise.allSettled(activeSources.value.map(async (source) => {
      const cursor = cursors.value[source];
      if (!cursor || !sourceHasMore.value[source]) return;

      const page = await fetchNotificationSourcePage(source, uid, cursor);
      const existingIds = new Set([
        ...firstPages.value[source],
        ...extraPages.value[source],
      ].map((notification) => notification.id));
      extraPages.value[source] = [
        ...extraPages.value[source],
        ...page.notifications.filter((notification) => !existingIds.has(notification.id)),
      ];
      cursors.value[source] = page.cursor;
      sourceHasMore.value[source] = page.hasMore;
    }));
    if (results.some((result) => result.status === 'rejected')) {
      error.value = results.every((result) => result.status === 'rejected')
        ? notificationLoadFailureMessage()
        : '部分通知暫時無法載入。';
    }
  } catch {
    error.value = notificationLoadFailureMessage();
  } finally {
    loadingMore.value = false;
  }
}

export function useNotifications() {
  ensureNotificationsInitialized();

  return {
    notifications,
    hasUnread,
    hasMore,
    loading,
    loadingMore,
    error,
    openNotifications,
    loadMoreNotifications,
    retryNotifications,
  };
}
