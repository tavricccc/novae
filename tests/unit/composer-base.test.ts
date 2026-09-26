import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { useComposerBase } from "@/hooks/use-composer-base";
import { composerDraftKey, readComposerDraft } from "@/lib/composer-draft";
import { deleteUploadedImages } from "@/services/uploads";

const images = vi.hoisted(() => ({
  clear: vi.fn(),
  uploadAndAppend: vi.fn(),
  uploading: false,
}));
vi.mock("@/hooks/use-image-attachments", () => ({ useImageAttachments: () => images }));
vi.mock("@/hooks/use-categories", () => ({ useCategories: () => ({ imageUploads: {} }) }));
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ user: { uid: "member" } }) }));
vi.mock("@/services/uploads", () => ({ deleteUploadedImages: vi.fn(async () => undefined) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

let state: ReturnType<typeof useComposerBase>;
let root: Root;
const draftKey = composerDraftKey("member", "issue");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  images.uploading = false;
  images.uploadAndAppend.mockResolvedValue({
    content: "內容及圖片", uploaded: [{ storagePath: "uploads/owned-image" }],
  });
  root = createRoot(document.createElement("div"));
  function Probe() { state = useComposerBase("issue"); return null; }
  await act(async () => root.render(createElement(Probe)));
  await act(async () => { state.setTitle("草稿標題"); state.setContent("原始內容"); });
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

it("blocks same-event duplicate submissions until creation and success feedback finish", async () => {
  const work = deferred<string>();
  const create = vi.fn(() => work.promise);
  const navigate = vi.fn();
  let pending!: Promise<void>;
  await act(async () => { pending = state.withUploads(create, navigate, "failed"); void state.withUploads(create, navigate, "failed"); });
  expect(images.uploadAndAppend).toHaveBeenCalledTimes(1);
  expect(create).toHaveBeenCalledTimes(1);
  expect(state.saving).toBe(true);
  await act(async () => { work.resolve("/issues/example"); });
  expect(state.succeeded).toBe(true);
  expect(readComposerDraft(draftKey)).toBeNull();
  await act(async () => { void state.withUploads(create, navigate, "failed"); });
  expect(create).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.runAllTimersAsync(); await pending; });
  expect(navigate).toHaveBeenCalledWith("/issues/example");
  expect(state.saving).toBe(false);
  expect(deleteUploadedImages).not.toHaveBeenCalled();
});

it("preserves committed images and cleared drafts if navigation fails", async () => {
  const create = vi.fn(async () => "/issues/example");
  const navigate = vi.fn(() => { throw new Error("navigation failed"); });
  let pending!: Promise<void>;
  await act(async () => { pending = state.withUploads(create, navigate, "failed"); });
  await act(async () => { await vi.runAllTimersAsync(); await pending; });
  expect(deleteUploadedImages).not.toHaveBeenCalled();
  expect(images.clear).toHaveBeenCalledTimes(1);
  expect(readComposerDraft(draftKey)).toBeNull();
  expect(toast.error).toHaveBeenCalledWith("navigation failed");
  expect(state.saving).toBe(false);
});

it("cleans uncommitted images but retains the draft and permits retry after a create failure", async () => {
  const create = vi.fn().mockRejectedValueOnce(new Error("create failed")).mockResolvedValueOnce("/issues/retry");
  const navigate = vi.fn();
  await act(async () => state.withUploads(create, navigate, "failed"));
  expect(deleteUploadedImages).toHaveBeenCalledWith(["uploads/owned-image"]);
  expect(readComposerDraft(draftKey)?.content).toBe("原始內容");
  expect(images.clear).not.toHaveBeenCalled();
  expect(state.succeeded).toBe(false);
  let retry!: Promise<void>;
  await act(async () => { retry = state.withUploads(create, navigate, "failed"); });
  await act(async () => { await vi.runAllTimersAsync(); await retry; });
  expect(create).toHaveBeenCalledTimes(2);
  expect(navigate).toHaveBeenCalledWith("/issues/retry");
  expect(readComposerDraft(draftKey)).toBeNull();
});

it("does not submit while attachment preparation is in progress", async () => {
  images.uploading = true;
  const create = vi.fn();
  await act(async () => state.withUploads(create, vi.fn(), "failed"));
  expect(images.uploadAndAppend).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
  expect(readComposerDraft(draftKey)?.title).toBe("草稿標題");
});

it("keeps the original creation error when image cleanup also fails", async () => {
  vi.mocked(deleteUploadedImages).mockRejectedValueOnce(new Error("cleanup failed"));
  await act(async () => state.withUploads(async () => { throw new Error("create failed"); }, vi.fn(), "failed"));
  expect(toast.error).toHaveBeenCalledWith("create failed");
  expect(state.saving).toBe(false);
  expect(readComposerDraft(draftKey)?.content).toBe("原始內容");
});
