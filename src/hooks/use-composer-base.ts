"use client";

import * as React from "react";
import { toast } from "sonner";
import { useCategories } from "@/hooks/use-categories";
import { useImageAttachments } from "@/hooks/use-image-attachments";
import { useComposerDraft } from "@/hooks/use-composer-draft";
import { useSession } from "@/hooks/use-session";
import { deleteUploadedImages } from "@/services/uploads";
import { ACTION_SUCCESS_HOLD_MS } from "@/hooks/use-action-feedback";
import { INPUT_LIMITS } from "@/constants/input-limits";

export function useComposerBase(targetType: "announcement" | "facility" | "issue", scope: string = targetType) {
  const session = useSession();
  const draft = useComposerDraft(session.user?.uid, scope);
  const [saving, setSaving] = React.useState(false);
  const [succeeded, setSucceeded] = React.useState(false);
  const submitting = React.useRef(false);
  const categories = useCategories();
  const images = useImageAttachments(targetType, categories.imageUploads);
  const { title, content } = draft.value;

  async function withUploads(
    create: (content: string) => Promise<string>,
    navigate: (href: string) => void,
    fallbackMessage: string,
  ) {
    if (submitting.current || images.uploading) return;
    submitting.current = true;
    setSaving(true);
    setSucceeded(false);
    let uploaded: Awaited<ReturnType<typeof images.uploadAndAppend>>["uploaded"] = [];
    let committed = false;
    try {
      const result = await images.uploadAndAppend(content);
      uploaded = result.uploaded;
      const href = await create(result.content);
      committed = true;
      draft.clear();
      images.clear();
      setSucceeded(true);
      await new Promise<void>((resolve) => window.setTimeout(resolve, ACTION_SUCCESS_HOLD_MS));
      navigate(href);
    } catch (caught) {
      if (!committed && uploaded.length > 0) {
        await deleteUploadedImages(uploaded.map((image) => image.storagePath)).catch(() => undefined);
      }
      toast.error(caught instanceof Error ? caught.message : fallbackMessage);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  return {
    title, content, draft, images, saving, succeeded, withUploads,
    contentWithinLimit: content.length <= INPUT_LIMITS.content,
    setTitle: (value: string) => draft.update({ title: value }),
    setContent: (value: string) => draft.update({ content: value }),
  };
}
