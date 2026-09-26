import { act, createElement, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useComposerDraft } from "@/hooks/use-composer-draft";
import {
  clearComposerDrafts, composerDraftKey, emptyComposerDraft,
  readComposerDraft, writeComposerDraft,
} from "@/lib/composer-draft";

let root: Root | undefined;
let draft: ReturnType<typeof useComposerDraft>;
const value = { title: "尚未送出的提案", content: "保留完整內容", location: "圖書館", category: "campus" };
const now = Date.UTC(2026, 8, 26, 12);

function Probe({ uid, scope }: { uid?: string; scope: string }) {
  const current = useComposerDraft(uid, scope);
  useLayoutEffect(() => { draft = current; });
  return null;
}

async function render(uid = "member", scope = "issue:campus") {
  root ??= createRoot(document.createElement("div"));
  await act(async () => root!.render(createElement(Probe, { uid, scope })));
}

beforeEach(() => {
  sessionStorage.clear();
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

it("isolates users and composer scopes, including punctuation in their names", () => {
  const keys = [composerDraftKey("a:b", "c"), composerDraftKey("a", "b:c"), composerDraftKey("a:b", "facility")];
  expect(new Set(keys).size).toBe(3);
  keys.forEach((key, index) => expect(writeComposerDraft(key, { ...value, title: String(index) })).toBe(true));
  expect(keys.map((key) => readComposerDraft(key)?.title)).toEqual(["0", "1", "2"]);
});

it("rejects expired, future, malformed and incorrectly typed storage values", () => {
  const key = composerDraftKey("member", "issue");
  for (const stored of [
    "{",
    JSON.stringify({ savedAt: now - 86_400_001, value }),
    JSON.stringify({ savedAt: now + 1, value }),
    JSON.stringify({ savedAt: "today", value }),
    JSON.stringify({ savedAt: now, value: { ...value, content: 42 } }),
    JSON.stringify({ savedAt: now, value: { title: "incomplete" } }),
  ]) {
    sessionStorage.setItem(key, stored);
    expect(readComposerDraft(key)).toBeNull();
  }
  sessionStorage.setItem(key, JSON.stringify({ savedAt: now - 86_399_999, value }));
  expect(readComposerDraft(key)).toEqual(value);
});

it("removes empty drafts even when a category is selected", () => {
  const key = composerDraftKey("member", "issue");
  writeComposerDraft(key, value);
  expect(writeComposerDraft(key, { ...emptyComposerDraft, category: "campus" })).toBe(true);
  expect(sessionStorage.getItem(key)).toBeNull();
});

it("clears only the signing-out user's drafts", () => {
  const first = composerDraftKey("member", "issue");
  const second = composerDraftKey("member", "facility");
  const other = composerDraftKey("member:other", "issue");
  [first, second, other].forEach((key) => writeComposerDraft(key, value));
  sessionStorage.setItem("unrelated", "keep");
  clearComposerDrafts("member");
  expect(readComposerDraft(first)).toBeNull();
  expect(readComposerDraft(second)).toBeNull();
  expect(readComposerDraft(other)).toEqual(value);
  expect(sessionStorage.getItem("unrelated")).toBe("keep");
});

it("restores drafts after remount and preserves consecutive edits in one event", async () => {
  await render();
  await act(async () => { draft.update({ title: value.title }); draft.update({ content: value.content }); });
  expect(draft.value).toEqual({ ...emptyComposerDraft, title: value.title, content: value.content });
  expect(draft.saved).toBe(true);
  await act(async () => root!.unmount());
  root = undefined;
  await render();
  expect(draft.restored).toBe(true);
  expect(draft.value.content).toBe(value.content);
});

it("switches scopes and accounts without copying an old draft into the new key", async () => {
  await render();
  await act(async () => draft.update(value));
  await render("member", "facility");
  expect(draft.value).toEqual(emptyComposerDraft);
  await act(async () => draft.update({ title: "設備修繕" }));
  await render("other", "facility");
  expect(draft.value).toEqual(emptyComposerDraft);
  await render();
  expect(draft.value).toEqual(value);
  await render("member", "facility");
  expect(draft.value.title).toBe("設備修繕");
});

it("does not resurrect a cleared draft after rerender or remount", async () => {
  await render();
  await act(async () => draft.update(value));
  await act(async () => draft.clear());
  await render();
  expect(draft.value).toEqual(emptyComposerDraft);
  expect(draft.saved).toBe(false);
  await act(async () => root!.unmount());
  root = undefined;
  await render();
  expect(draft.restored).toBe(false);
  expect(draft.value).toEqual(emptyComposerDraft);
});

it("does not let an earlier scope's asynchronous clear erase current edits", async () => {
  await render();
  await act(async () => draft.update(value));
  const finishEarlierSubmission = draft.clear;
  await render("member", "facility");
  await act(async () => draft.update({ title: "新草稿", location: "圖書館" }));
  await act(async () => finishEarlierSubmission());
  expect(draft.value.title).toBe("新草稿");
  await act(async () => draft.update({ content: "新的補充" }));
  expect(draft.value).toEqual({ ...emptyComposerDraft, title: "新草稿", location: "圖書館", content: "新的補充" });
  expect(readComposerDraft(composerDraftKey("member", "issue:campus"))).toBeNull();
});

it("keeps edits usable without falsely claiming a save when storage is unavailable", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("quota exceeded"); });
  await render();
  await act(async () => draft.update(value));
  expect(draft.value).toEqual(value);
  expect(draft.saved).toBe(false);
  expect(readComposerDraft(composerDraftKey("member", "issue:campus"))).toBeNull();
});
