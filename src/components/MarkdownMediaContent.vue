<template>
  <div class="space-y-4">
    <div v-if="images.length" class="flex snap-x gap-3 overflow-x-auto pb-2">
      <button
        v-for="image in images"
        :key="image.uploadId || image.src"
        type="button"
        class="content-trigger w-32 shrink-0 snap-start overflow-hidden rounded-lg border border-ink-200 bg-ink-50 dark:border-ink-800 dark:bg-ink-950 sm:w-40"
        :disabled="Boolean(image.uploadId && !image.isUploadResolved)"
        :aria-label="t('media.zoom', { alt: image.alt || fallbackAlt })"
        @click="openImage(image)"
      >
        <div
          v-if="image.uploadId && image.resolveError"
          class="flex aspect-[4/3] w-full flex-col items-center justify-center bg-error-container/40 p-2 text-center text-error"
        >
          <AppIcon name="warning" :size="5" />
          <span class="mt-1 text-[10px] font-medium">{{
            t("media.loadFailed")
          }}</span>
        </div>
        <SkeletonBlock
          v-else-if="image.uploadId && !image.isUploadResolved"
          as="div"
          class="flex aspect-[4/3] w-full items-center justify-center text-ink-500 dark:text-ink-400"
        >
          <LoadingSpinner :size="5" />
        </SkeletonBlock>
        <DecodedImage
          v-else
          :src="image.src"
          :alt="image.alt || fallbackAlt"
          :width="image.width"
          :height="image.height"
          class="aspect-[4/3] w-full"
          image-class="h-full w-full object-cover"
          loading="lazy"
        />
      </button>
    </div>

    <div
      v-if="textContent"
      class="font-sans text-sm font-normal leading-relaxed text-ink-700 dark:text-ink-200 sm:text-base"
    >
      <p v-if="plainText" class="whitespace-pre-wrap break-words">
        {{ textContent }}
      </p>
      <MarkdownRenderer v-else :content="textContent" />
    </div>

    <DialogShell
      :open="Boolean(selectedImage)"
      :labelled-by="lightboxTitleId"
      :padded-surface="false"
      overlay-class="!bg-ink-950/90"
      surface-class="relative flex max-h-full max-w-full items-center justify-center !rounded-none !border-0 !bg-transparent !shadow-none"
      z-index-class="z-[70]"
      @close="selectedImage = null"
    >
      <h2 :id="lightboxTitleId" class="sr-only">
        {{ t('media.zoom', { alt: selectedImage?.alt || fallbackAlt }) }}
      </h2>
      <AppButton
        variant="icon-filled"
        class="absolute right-0 top-0 z-10 border-white/20 bg-white text-ink-950 hover:bg-white/90"
        :aria-label="t('markdown.closeImage')"
        data-autofocus
        @click="selectedImage = null"
      >
        <AppIcon name="close" :size="5" />
      </AppButton>
      <DecodedImage
        v-if="selectedImage"
        :src="selectedImage.fullSrc || selectedImage.src"
        :alt="selectedImage.alt || fallbackAlt"
        :width="selectedImage.width"
        :height="selectedImage.height"
        class="max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] bg-transparent"
        image-class="max-h-[calc(100dvh-2rem)] max-w-[calc(100vw-2rem)] object-contain"
        loading="eager"
        :spinner-size="8"
      />
    </DialogShell>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useId } from "vue";
import MarkdownRenderer from "@/components/MarkdownRenderer.vue";
import LoadingSpinner from "@/components/ui/atoms/LoadingSpinner.vue";
import DecodedImage from "@/components/ui/atoms/DecodedImage.vue";
import SkeletonBlock from "@/components/ui/atoms/SkeletonBlock.vue";
import AppIcon from "@/components/ui/atoms/AppIcon.vue";
import AppButton from "@/components/ui/atoms/AppButton.vue";
import DialogShell from "@/components/ui/organisms/DialogShell.vue";
import { stripMarkdownImages } from "@/lib/markdown-images";
import { useResolvedMarkdown } from "@/composables/useResolvedMarkdown";
import type { MarkdownImageRecord } from "@/types";
import { useI18n } from "@/i18n";

const props = defineProps<{
  content: string;
  fallbackAlt: string;
  plainText?: boolean;
}>();
const { t } = useI18n();
const lightboxTitleId = useId();

const selectedImage = ref<MarkdownImageRecord | null>(null);
const {
  expiresAtByUploadId,
  images,
  refreshUploadImageUrl,
  resolvedContent,
} = useResolvedMarkdown(() => props.content);
const textContent = computed(() => stripMarkdownImages(resolvedContent.value));

async function openImage(image: MarkdownImageRecord) {
  if (
    image.uploadId
    && (expiresAtByUploadId.value[image.uploadId] ?? 0) <= Date.now() + 60_000
  ) {
    await refreshUploadImageUrl(image.uploadId);
  }
  selectedImage.value = image.uploadId
    ? images.value.find((candidate) => candidate.uploadId === image.uploadId) ?? image
    : image;
}
</script>
