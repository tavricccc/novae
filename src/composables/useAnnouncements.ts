import { computed, onScopeDispose, reactive, type Ref } from 'vue';
import type { AnnouncementRecord } from '@/types';
import { fetchAnnouncementsPage, type AnnouncementCursor } from '@/services/announcements';
import { useNetworkStatus } from '@/composables/useNetworkStatus';
import { CONTENT_FEED_PAGE_SIZE } from '@/lib/page-size';
import { isContentCacheFresh } from '@/services/content-read-cache';
import { isAbortFailure } from '@/lib/request';

interface UseAnnouncementsOptions {
  cacheScope?: Ref<string>;
  immediate?: boolean;
}

interface AnnouncementListState {
  announcements: AnnouncementRecord[];
  cursor: AnnouncementCursor;
  error: string;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  updatedAt: number;
}

const announcementStateCache = new Map<string, AnnouncementListState>();
const announcementRequestVersions = new WeakMap<AnnouncementListState, number>();

function createListState(): AnnouncementListState {
  return reactive({
    announcements: [],
    cursor: null,
    error: '',
    hasMore: true,
    loading: false,
    loadingMore: false,
    refreshing: false,
    updatedAt: 0,
  });
}

function mergeAnnouncements(
  existing: AnnouncementRecord[],
  incoming: AnnouncementRecord[],
) {
  const announcementMap = new Map(existing.map((announcement) => [announcement.id, announcement]));
  incoming.forEach((announcement) => announcementMap.set(announcement.id, announcement));
  return Array.from(announcementMap.values()).sort((left, right) =>
    (right.published_at?.getTime() ?? 0) - (left.published_at?.getTime() ?? 0)
    || right.id.localeCompare(left.id)
  );
}

export function useAnnouncements(options: UseAnnouncementsOptions = {}) {
  const { isOnline } = useNetworkStatus();
  let requestController: AbortController | null = null;
  const pageSize = computed(() => CONTENT_FEED_PAGE_SIZE);

  function getState() {
    const key = `${options.cacheScope?.value ?? 'default'}:${pageSize.value}`;
    const cached = announcementStateCache.get(key);
    if (cached) return cached;

    const state = createListState();
    announcementStateCache.set(key, state);
    return state;
  }

  function getVersion(state: AnnouncementListState) {
    return announcementRequestVersions.get(state) ?? 0;
  }

  function bumpVersion(state: AnnouncementListState) {
    announcementRequestVersions.set(state, getVersion(state) + 1);
  }

  const currentState = computed(getState);
  const announcements = computed({
    get: () => currentState.value.announcements,
    set: (value) => {
      currentState.value.announcements = value;
    },
  });
  const cursor = computed(() => currentState.value.cursor);
  const hasMore = computed(() => currentState.value.hasMore);
  const loading = computed(() => currentState.value.loading);
  const loadingMore = computed(() => currentState.value.loadingMore);
  const error = computed(() => currentState.value.error);
  const updatedAt = computed(() => currentState.value.updatedAt);

  async function loadFirstPage(loadOptions: { silent?: boolean } = {}) {
    const state = currentState.value;
    requestController?.abort();
    const controller = new AbortController();
    requestController = controller;
    bumpVersion(state);
    const currentVersion = getVersion(state);
    state.error = '';
    state.hasMore = true;
    if (loadOptions.silent && state.announcements.length > 0) {
      state.refreshing = true;
    } else {
      state.loading = true;
    }

    try {
      const page = await fetchAnnouncementsPage(null, pageSize.value, {
        cacheScope: options.cacheScope?.value,
        forceRefresh: loadOptions.silent === true,
        signal: controller.signal,
      });
      if (currentVersion !== getVersion(state)) return;
      state.announcements = mergeAnnouncements([], page.announcements);
      state.cursor = page.cursor;
      state.hasMore = page.hasMore;
      state.error = '';
      state.updatedAt = Date.now();
    } catch (caught) {
      if (isAbortFailure(caught)) return;
      if (currentVersion === getVersion(state) && state.announcements.length === 0) {
        state.error = isOnline.value
          ? '公告載入失敗，請稍後再試。'
          : '目前已離線，請恢復網路連線後重新整理。';
      }
    } finally {
      if (currentVersion === getVersion(state)) {
        state.loading = false;
        state.refreshing = false;
      }
      if (requestController === controller) requestController = null;
    }
  }

  async function loadMoreAnnouncements() {
    const state = currentState.value;
    if (!state.hasMore || !state.cursor || state.loadingMore) return;
    const currentVersion = getVersion(state);
    requestController?.abort();
    const controller = new AbortController();
    requestController = controller;
    state.loadingMore = true;
    state.error = '';

    try {
      const page = await fetchAnnouncementsPage(state.cursor, pageSize.value, {
        cacheScope: options.cacheScope?.value,
        signal: controller.signal,
      });
      if (currentVersion !== getVersion(state)) return;
      state.announcements = mergeAnnouncements(state.announcements, page.announcements);
      state.cursor = page.cursor;
      state.hasMore = page.hasMore;
      state.updatedAt = Date.now();
    } catch (caught) {
      if (isAbortFailure(caught)) return;
      if (currentVersion === getVersion(state)) {
        state.error = isOnline.value
          ? '載入更多公告失敗，請稍後再試。'
          : '目前已離線，請恢復網路連線後重新整理。';
      }
    } finally {
      if (currentVersion === getVersion(state)) {
        state.loadingMore = false;
      }
      if (requestController === controller) requestController = null;
    }
  }

  function refreshAnnouncements() {
    if (currentState.value.announcements.length > 0 && isContentCacheFresh(currentState.value.updatedAt)) {
      return Promise.resolve();
    }
    return loadFirstPage({ silent: currentState.value.announcements.length > 0 });
  }

  function forceRefreshAnnouncements() {
    return loadFirstPage({ silent: currentState.value.announcements.length > 0 });
  }

  function resetAnnouncements() {
    announcementStateCache.forEach((state) => {
      bumpVersion(state);
      state.announcements = [];
      state.cursor = null;
      state.hasMore = true;
      state.loading = false;
      state.loadingMore = false;
      state.refreshing = false;
      state.updatedAt = 0;
    });
  }

  function upsertAnnouncement(announcement: AnnouncementRecord) {
    announcementStateCache.forEach((state) => {
      state.announcements = mergeAnnouncements(state.announcements, [announcement]);
    });
    const key = `${options.cacheScope?.value ?? 'default'}:${pageSize.value}`;
    if (!announcementStateCache.has(key)) {
      const state = getState();
      state.announcements = [announcement];
      state.updatedAt = Date.now();
    }
  }

  function patchAnnouncement(
    announcementId: string,
    updater: (announcement: AnnouncementRecord) => AnnouncementRecord,
  ) {
    announcementStateCache.forEach((state) => {
      state.announcements = mergeAnnouncements([], state.announcements.map((announcement) =>
        announcement.id === announcementId ? updater(announcement) : announcement
      ));
      state.updatedAt = Date.now();
    });
  }

  function removeAnnouncement(announcementId: string) {
    announcementStateCache.forEach((state) => {
      state.announcements = state.announcements.filter((announcement) => announcement.id !== announcementId);
      state.updatedAt = Date.now();
    });
  }

  if (options.immediate) {
    void refreshAnnouncements();
  }

  onScopeDispose(() => {
    requestController?.abort();
    const state = currentState.value;
    bumpVersion(state);
    state.loading = false;
    state.loadingMore = false;
    state.refreshing = false;
  });

  return {
    announcements,
    cursor,
    loading,
    loadingMore,
    updatedAt,
    error,
    hasMore,
    loadMoreAnnouncements,
    upsertAnnouncement,
    patchAnnouncement,
    removeAnnouncement,
    refreshAnnouncements,
    forceRefreshAnnouncements,
    resetAnnouncements,
  };
}
