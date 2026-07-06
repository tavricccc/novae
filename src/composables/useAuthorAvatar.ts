import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import { fetchUserAvatarUrls } from '@/services/users-read';

const AUTHOR_AVATAR_CACHE_KEY = 'srp:author-avatar-cache';
const MAX_LOCAL_AVATAR_ENTRIES = 1000;
const AUTHOR_AVATAR_CACHE_TTL_MS = 365 * 24 * 60 * 60 * 1000;

interface AuthorAvatarCacheEntry {
  expiresAt: number;
  url: string | null;
}

const authorAvatarCache = ref<Record<string, AuthorAvatarCacheEntry>>(readLocalAuthorAvatarCache());
const refreshedUids = new Set<string>();
const pendingUids = new Set<string>();
let flushTimer: number | null = null;

function readLocalAuthorAvatarCache() {
  try {
    const raw = localStorage.getItem(AUTHOR_AVATAR_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const now = Date.now();
    return Object.fromEntries(Object.entries(parsed)
      .flatMap(([uid, value]) => {
        if (typeof uid !== 'string') return [];
        if (typeof value === 'string' || value === null) {
          return [[uid, { expiresAt: now + AUTHOR_AVATAR_CACHE_TTL_MS, url: value }] as const];
        }
        if (
          value
          && typeof value === 'object'
          && !Array.isArray(value)
          && typeof (value as AuthorAvatarCacheEntry).expiresAt === 'number'
          && ((value as AuthorAvatarCacheEntry).url === null || typeof (value as AuthorAvatarCacheEntry).url === 'string')
          && (value as AuthorAvatarCacheEntry).expiresAt > now
        ) {
          return [[uid, value as AuthorAvatarCacheEntry] as const];
        }
        return [];
      })
      .slice(0, MAX_LOCAL_AVATAR_ENTRIES));
  } catch {
    return {};
  }
}

function writeLocalAuthorAvatarCache() {
  try {
    const entries = Object.entries(authorAvatarCache.value).slice(-MAX_LOCAL_AVATAR_ENTRIES);
    localStorage.setItem(AUTHOR_AVATAR_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Local cache is opportunistic only.
  }
}

function queueAuthorAvatarRefresh(uid: string) {
  if (!uid) return;
  if (refreshedUids.has(uid)) return;
  refreshedUids.add(uid);
  pendingUids.add(uid);
  if (flushTimer !== null) return;

  flushTimer = window.setTimeout(async () => {
    flushTimer = null;
    const uids = Array.from(pendingUids);
    pendingUids.clear();
    if (uids.length === 0) return;

    try {
      const avatars = await fetchUserAvatarUrls(uids);
      const expiresAt = Date.now() + AUTHOR_AVATAR_CACHE_TTL_MS;
      authorAvatarCache.value = {
        ...authorAvatarCache.value,
        ...Object.fromEntries(Object.entries(avatars).map(([uid, url]) => [uid, { expiresAt, url }])),
      };
      writeLocalAuthorAvatarCache();
    } catch {
      uids.forEach((uid) => {
        refreshedUids.delete(uid);
      });
    }
  }, 0);
}

export function useAuthorAvatarUrl(
  uid: MaybeRefOrGetter<string | null | undefined>,
  fallbackUrl: MaybeRefOrGetter<string | null | undefined> = null,
) {
  watch(
    () => toValue(uid) ?? '',
    (nextUid) => {
      if (nextUid) queueAuthorAvatarRefresh(nextUid);
    },
    { immediate: true },
  );

  return computed(() => {
    const currentUid = toValue(uid) ?? '';
    const fallback = toValue(fallbackUrl) ?? null;
    if (!currentUid) return fallback;
    const entry = authorAvatarCache.value[currentUid];
    if (!entry || entry.expiresAt <= Date.now()) return fallback;
    return entry.url || fallback;
  });
}
