import { readSessionStorage, removeSessionStorage } from "@/lib/browser-storage";

export interface ComposerDraft {
  title: string;
  content: string;
  location: string;
  category: string;
}

const prefix = "novae:composer-draft:";
const maxAge = 24 * 60 * 60 * 1_000;
export const emptyComposerDraft: ComposerDraft = { title: "", content: "", location: "", category: "" };

export function composerDraftKey(uid: string, scope: string) {
  return `${prefix}${encodeURIComponent(uid)}:${encodeURIComponent(scope)}`;
}

export function hasComposerDraft(draft: ComposerDraft) {
  return Boolean(draft.title || draft.content || draft.location);
}

export function readComposerDraft(key: string): ComposerDraft | null {
  try {
    const saved = JSON.parse(readSessionStorage(key) ?? "null");
    if (!saved || typeof saved.savedAt !== "number" || Date.now() - saved.savedAt > maxAge
      || saved.savedAt > Date.now()
      || !Object.keys(emptyComposerDraft).every((field) => typeof saved.value?.[field] === "string")) return null;
    return { title: saved.value.title, content: saved.value.content, location: saved.value.location, category: saved.value.category };
  } catch {
    return null;
  }
}

/** Return whether storage accepted the draft, so the UI never claims a failed save. */
export function writeComposerDraft(key: string, value: ComposerDraft) {
  try {
    if (hasComposerDraft(value)) window.sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), value }));
    else window.sessionStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export const removeComposerDraft = removeSessionStorage;

export function clearComposerDrafts(uid: string | undefined) {
  if (!uid) return;
  const userPrefix = `${prefix}${encodeURIComponent(uid)}:`;
  try {
    const keys = Object.keys(window.sessionStorage).filter((key) => key.startsWith(userPrefix));
    keys.forEach(removeComposerDraft);
  } catch {
    // Draft storage is optional and must not prevent signing out.
  }
}
