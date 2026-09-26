"use client";

import { useLayoutEffect, useRef } from "react";
import { toast } from "sonner";
import { useI18n } from "@/i18n";
import { useComposerDraft } from "@/hooks/use-composer-draft";
import { useActionFeedback } from "@/hooks/use-action-feedback";
import { readComposerDraft, removeComposerDraft } from "@/lib/composer-draft";
import { INPUT_LIMITS } from "@/constants/input-limits";

export function useDiscussionComposer(
  uid: string | undefined,
  targetKey: string,
  parentCommentId: string | null,
  onCreate: (content: string, parentCommentId: string | null) => Promise<void>,
) {
  const { t } = useI18n();
  const draft = useComposerDraft(uid, `discussion:${JSON.stringify([targetKey, parentCommentId])}`);
  const feedback = useActionFeedback();
  const submitting = useRef(false);
  const latest = useRef({ key: draft.key, content: draft.value.content });
  useLayoutEffect(() => {
    latest.current = { key: draft.key, content: draft.value.content };
  }, [draft.key, draft.value.content]);

  async function submit() {
    const content = draft.value.content;
    const key = draft.key;
    if (submitting.current || !content.trim() || content.length > INPUT_LIMITS.comment) return;
    submitting.current = true;
    try {
      await feedback.run(async () => {
        await onCreate(content.trim(), parentCommentId);
        const persisted = key ? readComposerDraft(key) : null;
        // A remounted composer or a new edit may already own this storage entry.
        if (persisted && persisted.content !== content) return;
        if (latest.current.key === key && latest.current.content === content) draft.clear();
        else if (key && latest.current.key !== key) removeComposerDraft(key);
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("ui.discussion.submitFailed"));
    } finally {
      submitting.current = false;
    }
  }

  return {
    busy: feedback.busy,
    content: draft.value.content,
    feedbackState: feedback.state,
    status: draft.restored ? "restored" as const : draft.saved ? "saved" as const : "unavailable" as const,
    update: (content: string) => {
      latest.current = { key: draft.key, content };
      draft.update({ content });
    },
    submit,
  };
}
