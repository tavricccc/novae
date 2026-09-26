import { act, createElement, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useDiscussionComposer } from "@/hooks/use-discussion-composer";
import { composerDraftKey, readComposerDraft } from "@/lib/composer-draft";

const translate = vi.hoisted(() => (key: string) => key);
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: translate }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

let state: ReturnType<typeof useDiscussionComposer>;
let root: Root;
let create: ReturnType<typeof vi.fn<(content: string, parent: string | null) => Promise<void>>>;
function Probe({ uid, target, parent }: { uid: string; target: string; parent: string | null }) {
  const current = useDiscussionComposer(uid, target, parent, create);
  useLayoutEffect(() => { state = current; });
  return null;
}
async function render(parent: string | null = null, target = "issue:one", uid = "member") {
  await act(async () => root.render(createElement(Probe, { uid, target, parent })));
}
const key = (parent: string | null = null) => composerDraftKey("member", `discussion:${JSON.stringify(["issue:one", parent])}`);

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  create = vi.fn(async () => undefined);
  root = createRoot(document.createElement("div"));
  await render();
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

it("keeps root comments, individual replies, records and accounts separate", async () => {
  await act(async () => state.update("一般留言"));
  await render("first");
  expect(state.content).toBe("");
  await act(async () => state.update("回覆第一則"));
  await render("second");
  await act(async () => state.update("回覆第二則"));
  await render("first");
  expect(state.content).toBe("回覆第一則");
  expect(state.status).toBe("restored");
  await render();
  expect(state.content).toBe("一般留言");
  await render(null, "announcement:one");
  expect(state.content).toBe("");
  await render(null, "issue:one", "another-member");
  expect(state.content).toBe("");
});

it("clears only successfully submitted text and blocks same-event duplicate sends", async () => {
  await render("reply");
  await act(async () => state.update("  回覆文字  "));
  let pending!: Promise<void>;
  await act(async () => { pending = state.submit(); void state.submit(); });
  expect(create).toHaveBeenCalledTimes(1);
  expect(create).toHaveBeenCalledWith("回覆文字", "reply");
  expect(readComposerDraft(key("reply"))).toBeNull();
  await act(async () => { await vi.runAllTimersAsync(); await pending; });
  expect(state.content).toBe("");
});

it("retains a failed submission and supports retry", async () => {
  await act(async () => state.update("尚未送出"));
  create.mockRejectedValueOnce(new Error("offline"));
  await act(async () => state.submit());
  expect(state.content).toBe("尚未送出");
  expect(readComposerDraft(key())?.content).toBe("尚未送出");
  expect(toast.error).toHaveBeenCalledWith("offline");
  expect(state.busy).toBe(false);
  let retry!: Promise<void>;
  await act(async () => { retry = state.submit(); });
  await act(async () => { await vi.runAllTimersAsync(); await retry; });
  expect(state.content).toBe("");
});

it("preserves text edited while a request is in flight or success feedback is showing", async () => {
  const work = deferred();
  create.mockReturnValueOnce(work.promise);
  await act(async () => state.update("已送出這段"));
  let pending!: Promise<void>;
  await act(async () => { pending = state.submit(); });
  await act(async () => state.update("接著寫的新留言"));
  await act(async () => work.resolve());
  expect(state.content).toBe("接著寫的新留言");
  await act(async () => state.update("再補充"));
  await act(async () => { await vi.runAllTimersAsync(); await pending; });
  expect(state.content).toBe("再補充");
  expect(readComposerDraft(key())?.content).toBe("再補充");
});

it("finishes the original reply without deleting a different reply's draft", async () => {
  const work = deferred();
  create.mockReturnValueOnce(work.promise);
  await render("first");
  await act(async () => state.update("第一則"));
  let pending!: Promise<void>;
  await act(async () => { pending = state.submit(); });
  await render("second");
  await act(async () => state.update("第二則草稿"));
  await act(async () => { work.resolve(); await vi.runAllTimersAsync(); await pending; });
  expect(state.content).toBe("第二則草稿");
  expect(readComposerDraft(key("first"))).toBeNull();
  expect(readComposerDraft(key("second"))?.content).toBe("第二則草稿");
});

it("does not let an unmounted request erase a newer draft for the same record", async () => {
  const work = deferred();
  create.mockReturnValueOnce(work.promise);
  await act(async () => state.update("先前送出的文字"));
  let pending!: Promise<void>;
  await act(async () => { pending = state.submit(); });
  await act(async () => root.unmount());
  root = createRoot(document.createElement("div"));
  await render();
  await act(async () => state.update("重開頁面後的新文字"));
  await act(async () => { work.resolve(); await vi.runAllTimersAsync(); await pending; });
  expect(state.content).toBe("重開頁面後的新文字");
  expect(readComposerDraft(key())?.content).toBe("重開頁面後的新文字");
});
