<script setup lang="ts">
import { useMarkdown } from '@/composables/useMarkdown'
import { useResolvedMarkdown } from '@/composables/useResolvedMarkdown'

const props = defineProps<{
  content: string;
  inline?: boolean;
}>()

const {
  expiresAtByUploadId,
  refreshUploadImageUrl,
  resolvedContent,
  resolvedFullUrls,
} = useResolvedMarkdown(() => props.content)
const safeHtml = useMarkdown(resolvedContent)

function uploadIdForImage(image: HTMLImageElement) {
  const currentSrc = image.currentSrc || image.src
  return Object.entries(resolvedFullUrls.value).find(([, url]) => url === currentSrc)?.[0] ?? ''
}

function handleImageError(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLImageElement)) return

  const uploadId = uploadIdForImage(target)
  if (!uploadId) return
  void refreshUploadImageUrl(uploadId)
}

function handleImageClick(event: MouseEvent) {
  const target = event.target
  if (!(target instanceof HTMLImageElement)) return

  const uploadId = uploadIdForImage(target)
  if (!uploadId) return

  const expiresAt = expiresAtByUploadId.value[uploadId] ?? 0
  if (expiresAt > Date.now() + 60_000) return
  void refreshUploadImageUrl(uploadId)
}
</script>

<template>
  <!-- eslint-disable vue/no-v-html -->
  <div
    class="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-p:leading-7 prose-headings:mb-2 prose-headings:mt-4 prose-headings:font-bold prose-headings:tracking-normal prose-h1:text-xl prose-h1:leading-snug prose-h2:text-lg prose-h2:leading-snug prose-h3:text-base prose-h3:leading-snug prose-h4:text-sm prose-h4:leading-snug prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-blockquote:my-3 prose-blockquote:text-sm prose-pre:my-3 prose-code:text-[0.9em] prose-img:my-3 sm:prose-p:text-[0.95rem] sm:prose-h1:text-[1.35rem] sm:prose-h2:text-xl sm:prose-h3:text-lg break-words"
    :class="{ 'inline-element': inline }"
    @click.capture="handleImageClick"
    @error.capture="handleImageError"
    v-html="safeHtml" 
  ></div>
  <!-- eslint-enable vue/no-v-html -->
</template>

<style scoped>
/* 
  Allows the div to act inline in constrained places 
  but Tailwind typography prose usually uses block-level.
*/
.inline-element :deep(p:first-child) {
  display: inline;
  margin-top: 0;
}
.inline-element :deep(p:last-child) {
  margin-bottom: 0;
}

:deep(img) {
  display: block;
  height: auto;
  max-height: 70vh;
  width: 100%;
  object-fit: contain;
  background: rgb(var(--color-secondary-container) / 0.7);
}

:deep(p:has(> img:only-child)) {
  margin-bottom: 0.75rem;
  margin-top: 0.75rem;
}
</style>
