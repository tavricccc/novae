import { computed, onBeforeUnmount, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';
import {
  extractMarkdownImages,
  getUploadIdFromUri,
  getUploadIdsFromMarkdown,
  replaceMarkdownImageSources,
} from '@/lib/markdown-images';
import { resolveUploadImageUrls } from '@/services/uploads';
import type { MarkdownImageRecord } from '@/types';

type ResolveResult = Awaited<ReturnType<typeof resolveUploadImageUrls>>;
const queuedResolveRequests: Array<{
  ids: string[];
  resolve: (value: ResolveResult) => void;
  reject: (reason?: unknown) => void;
}> = [];
let resolveFlushScheduled = false;

function resolveUploadImageUrlsPooled(ids: string[]) {
  return new Promise<ResolveResult>((resolve, reject) => {
    queuedResolveRequests.push({ ids, reject, resolve });
    if (resolveFlushScheduled) return;
    resolveFlushScheduled = true;
    queueMicrotask(async () => {
      resolveFlushScheduled = false;
      const requests = queuedResolveRequests.splice(0);
      const allIds = [...new Set(requests.flatMap((request) => request.ids))];
      try {
        const result = await resolveUploadImageUrls(allIds);
        for (const request of requests) {
          const requested = new Set(request.ids);
          request.resolve({
            errors: Object.fromEntries(Object.entries(result.errors ?? {}).filter(([id]) => requested.has(id))),
            expiresAtByUploadId: Object.fromEntries(Object.entries(result.expiresAtByUploadId).filter(([id]) => requested.has(id))),
            expiresAtMs: result.expiresAtMs,
            fullUrls: Object.fromEntries(Object.entries(result.fullUrls).filter(([id]) => requested.has(id))),
            thumbnailUrls: Object.fromEntries(Object.entries(result.thumbnailUrls).filter(([id]) => requested.has(id))),
          });
        }
      } catch (error) {
        requests.forEach((request) => request.reject(error));
      }
    });
  });
}

export function useResolvedMarkdown(content: MaybeRefOrGetter<string>) {
  const resolvedFullUrls = ref<Record<string, string>>({});
  const resolvedThumbnailUrls = ref<Record<string, string>>({});
  const expiresAtByUploadId = ref<Record<string, number>>({});
  const resolveErrors = ref<Record<string, string>>({});
  const isResolving = ref(false);
  let requestToken = 0;

  const rawContent = computed(() => toValue(content) || '');
  const resolvedContent = computed(() =>
    replaceMarkdownImageSources(rawContent.value, resolvedFullUrls.value, { unresolvedUpload: 'remove' }),
  );
  const images = computed<MarkdownImageRecord[]>(() =>
    extractMarkdownImages(rawContent.value)
      .map((image) => {
        const uploadId = image.uploadId ?? getUploadIdFromUri(image.src) ?? undefined;
        if (!uploadId) {
          return image;
        }

        const resolvedSrc = resolvedThumbnailUrls.value[uploadId];
        const fullSrc = resolvedFullUrls.value[uploadId];
        return {
          ...image,
          fullSrc,
          uploadId,
          isUploadResolved: Boolean(resolvedSrc),
          resolveError: resolveErrors.value[uploadId],
          src: resolvedSrc || '',
        };
      }),
  );
  const unresolvedImages = computed(() => images.value.filter((image) => image.uploadId && !image.src));
  const uploadIds = computed(() => getUploadIdsFromMarkdown(rawContent.value));

  watch(
    uploadIds,
    async (ids) => {
      const token = ++requestToken;
      if (ids.length === 0) {
        resolvedFullUrls.value = {};
        resolvedThumbnailUrls.value = {};
        resolveErrors.value = {};
        isResolving.value = false;
        return;
      }

      isResolving.value = true;
      try {
        const result = await resolveUploadImageUrlsPooled(ids);
        if (token !== requestToken) return;
        resolvedFullUrls.value = result.fullUrls;
        resolvedThumbnailUrls.value = result.thumbnailUrls;
        expiresAtByUploadId.value = result.expiresAtByUploadId;
        resolveErrors.value = result.errors ?? {};
      } catch {
        if (token !== requestToken) return;
        resolvedFullUrls.value = {};
        resolvedThumbnailUrls.value = {};
        expiresAtByUploadId.value = {};
        resolveErrors.value = Object.fromEntries(ids.map((id) => [id, 'resolve-failed']));
      } finally {
        if (token === requestToken) {
          isResolving.value = false;
        }
      }
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    requestToken += 1;
  });

  async function refreshUploadImageUrl(uploadId: string) {
    const token = ++requestToken;
    try {
      const result = await resolveUploadImageUrls([uploadId], { forceRefresh: true });
      if (token !== requestToken) return;
      resolvedFullUrls.value = {
        ...resolvedFullUrls.value,
        ...result.fullUrls,
      };
      resolvedThumbnailUrls.value = {
        ...resolvedThumbnailUrls.value,
        ...result.thumbnailUrls,
      };
      expiresAtByUploadId.value = {
        ...expiresAtByUploadId.value,
        ...result.expiresAtByUploadId,
      };
      resolveErrors.value = {
        ...resolveErrors.value,
        ...(result.errors ?? {}),
      };
    } catch {
      if (token !== requestToken) return;
      resolveErrors.value = {
        ...resolveErrors.value,
        [uploadId]: 'resolve-failed',
      };
    }
  }

  return {
    expiresAtByUploadId,
    images,
    isResolving,
    refreshUploadImageUrl,
    resolvedContent,
    resolveErrors,
    resolvedFullUrls,
    resolvedThumbnailUrls,
    unresolvedImages,
  };
}
