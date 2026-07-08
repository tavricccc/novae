import { computed, onScopeDispose, reactive, ref, watch, type Ref } from 'vue';
import type { AnnouncementRecord, AnnouncementSortOption } from '@/types';
import { fetchAnnouncementsPage, type AnnouncementCursor } from '@/services/announcements';
import { useNetworkStatus } from '@/composables/useNetworkStatus';
import { resolveViewportPageSize } from '@/lib/page-size';

interface UseAnnouncementsOptions {
  immediate?: boolean;
  sortOption?: Ref<AnnouncementSortOption>;
}

interface AnnouncementListState {
  announcements: AnnouncementRecord[];
  cursor: AnnouncementCursor;
  error: string;
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
}

function createListState(): AnnouncementListState {
  return reactive({
    announcements: [],
    cursor: null,
    error: '',
    hasMore: true,
    loading: false,
    loadingMore: false,
    refreshing: false,
  });
}

function mergeAnnouncements(existing: AnnouncementRecord[], incoming: AnnouncementRecord[]) {
  const announcementMap = new Map(existing.map((announcement) => [announcement.id, announcement]));
  incoming.forEach((announcement) => announcementMap.set(announcement.id, announcement));
  return Array.from(announcementMap.values());
}

function sortAnnouncements(announcements: AnnouncementRecord[], sortOption: AnnouncementSortOption) {
  return [...announcements].sort((left, right) => {
    const leftPublishedAt = left.published_at?.getTime() ?? 0;
    const rightPublishedAt = right.published_at?.getTime() ?? 0;
    if (sortOption === 'most-liked') {
      return right.like_count - left.like_count || rightPublishedAt - leftPublishedAt;
    }
    if (sortOption === 'most-commented') {
      return right.comment_count - left.comment_count || rightPublishedAt - leftPublishedAt;
    }
    return rightPublishedAt - leftPublishedAt;
  });
}

export function useAnnouncements(options: UseAnnouncementsOptions = {}) {
  const { isOnline } = useNetworkStatus();
  const sortOption = options.sortOption ?? ref<AnnouncementSortOption>('latest');
  const stateCache = new Map<AnnouncementSortOption, AnnouncementListState>();
  const requestVersions = new WeakMap<AnnouncementListState, number>();
  const pageSize = computed(() => resolveViewportPageSize({
    min: 10,
    max: 24,
    reservedHeight: 220,
    rowHeight: 92,
  }));

  function getState() {
    const cached = stateCache.get(sortOption.value);
    if (cached) return cached;

    const state = createListState();
    stateCache.set(sortOption.value, state);
    return state;
  }

  function getVersion(state: AnnouncementListState) {
    return requestVersions.get(state) ?? 0;
  }

  function bumpVersion(state: AnnouncementListState) {
    requestVersions.set(state, getVersion(state) + 1);
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

  async function loadFirstPage(loadOptions: { silent?: boolean } = {}) {
    const state = currentState.value;
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
      const page = await fetchAnnouncementsPage(null, sortOption.value, pageSize.value);
      if (currentVersion !== getVersion(state)) return;
      state.announcements = page.announcements;
      state.cursor = page.cursor;
      state.hasMore = page.hasMore;
      state.error = '';
    } catch {
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
    }
  }

  async function loadMoreAnnouncements() {
    const state = currentState.value;
    if (!state.hasMore || !state.cursor || state.loadingMore) return;
    const currentVersion = getVersion(state);
    state.loadingMore = true;
    state.error = '';

    try {
      const page = await fetchAnnouncementsPage(state.cursor, sortOption.value, pageSize.value);
      if (currentVersion !== getVersion(state)) return;
      state.announcements = sortAnnouncements(
        mergeAnnouncements(state.announcements, page.announcements),
        sortOption.value,
      );
      state.cursor = page.cursor;
      state.hasMore = page.hasMore;
    } catch {
      if (currentVersion === getVersion(state)) {
        state.error = isOnline.value
          ? '載入更多公告失敗，請稍後再試。'
          : '目前已離線，請恢復網路連線後重新整理。';
      }
    } finally {
      if (currentVersion === getVersion(state)) {
        state.loadingMore = false;
      }
    }
  }

  function refreshAnnouncements() {
    return loadFirstPage({ silent: currentState.value.announcements.length > 0 });
  }

  function resetAnnouncements() {
    stateCache.forEach((state) => {
      bumpVersion(state);
      state.announcements = [];
      state.cursor = null;
      state.hasMore = true;
      state.loading = false;
      state.loadingMore = false;
      state.refreshing = false;
    });
  }

  function upsertAnnouncement(announcement: AnnouncementRecord) {
    stateCache.forEach((state, option) => {
      state.announcements = sortAnnouncements(mergeAnnouncements(state.announcements, [announcement]), option);
    });
    if (!stateCache.has(sortOption.value)) {
      const state = getState();
      state.announcements = sortAnnouncements([announcement], sortOption.value);
    }
  }

  function patchAnnouncement(
    announcementId: string,
    updater: (announcement: AnnouncementRecord) => AnnouncementRecord,
  ) {
    stateCache.forEach((state, option) => {
      state.announcements = sortAnnouncements(
        state.announcements.map((announcement) =>
          announcement.id === announcementId ? updater(announcement) : announcement
        ),
        option,
      );
    });
  }

  function removeAnnouncement(announcementId: string) {
    stateCache.forEach((state) => {
      state.announcements = state.announcements.filter((announcement) => announcement.id !== announcementId);
    });
  }

  if (options.immediate) {
    void refreshAnnouncements();
  }

  watch(sortOption, () => {
    const state = currentState.value;
    if (state.announcements.length === 0 && !state.loading) void refreshAnnouncements();
  });

  onScopeDispose(() => {
    stateCache.forEach(bumpVersion);
  });

  return {
    announcements,
    cursor,
    loading,
    loadingMore,
    error,
    hasMore,
    loadMoreAnnouncements,
    upsertAnnouncement,
    patchAnnouncement,
    removeAnnouncement,
    refreshAnnouncements,
    resetAnnouncements,
  };
}
