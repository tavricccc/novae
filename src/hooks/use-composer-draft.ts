"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  composerDraftKey, emptyComposerDraft, hasComposerDraft, readComposerDraft,
  removeComposerDraft, writeComposerDraft, type ComposerDraft,
} from "@/lib/composer-draft";

export function useComposerDraft(uid: string | undefined, scope: string) {
  const key = uid ? composerDraftKey(uid, scope) : null;
  const [state, setState] = useState({ key, value: emptyComposerDraft, restored: false, saved: false });
  const current = useRef(state);

  useEffect(() => {
    const saved = key ? readComposerDraft(key) : null;
    const next = { key, value: saved ?? emptyComposerDraft, restored: Boolean(saved), saved: Boolean(saved) };
    current.current = next;
    setState(next);
  }, [key]);

  const update = useCallback((patch: Partial<ComposerDraft>) => {
    if (current.current.key !== key) return;
    const value = { ...current.current.value, ...patch };
    const saved = key ? writeComposerDraft(key, value) : false;
    const next = { key, value, restored: false, saved: saved && hasComposerDraft(value) };
    current.current = next;
    setState(next);
  }, [key]);

  const clear = useCallback(() => {
    if (key) removeComposerDraft(key);
    if (current.current.key !== key) return;
    const next = { key, value: emptyComposerDraft, restored: false, saved: false };
    current.current = next;
    setState(next);
  }, [key]);

  return { ...(state.key === key ? state : { key, value: emptyComposerDraft, restored: false, saved: false }), update, clear };
}
