import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useImageAttachments } from "@/hooks/use-image-attachments";
import { processImageForUpload } from "@/lib/image-processing";
import { createImageUploadPolicies } from "@/services/uploads";
import { toast } from "sonner";

vi.mock("@/lib/image-processing", () => ({ processImageForUpload: vi.fn() }));
vi.mock("@/services/uploads", () => ({
  createImageUploadPolicies: vi.fn(), deleteUploadedImages: vi.fn(),
}));
vi.mock("@/i18n", () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

const settings = {
  announcementMaxImages: 1, commentMaxImages: 1, facilityMaxImages: 1,
  issueMaxImages: 1, maxDimension: 1024, maxUploadKilobytes: 512, webpQuality: 80,
};
const file = new File(["image"], "test.webp", { type: "image/webp" });
const processed = { file, height: 100, width: 100 };
const files = [file] as unknown as FileList;
let attachments: ReturnType<typeof useImageAttachments>;
let root: Root;
const revoke = vi.fn();

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("URL", class extends URL {
    static createObjectURL = vi.fn(() => "blob:preview");
    static revokeObjectURL = revoke;
  });
  vi.mocked(processImageForUpload).mockResolvedValue(processed);
  root = createRoot(document.createElement("div"));
  function Probe() { attachments = useImageAttachments("issue", settings); return null; }
  await act(async () => root.render(createElement(Probe)));
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it("prevents simultaneous picks from exceeding the attachment limit", async () => {
  const work = deferred<typeof processed>();
  vi.mocked(processImageForUpload).mockReturnValue(work.promise);
  let pending!: Promise<void>;
  await act(async () => { pending = attachments.pick(files); await attachments.pick(files); });
  expect(processImageForUpload).toHaveBeenCalledTimes(1);
  expect(attachments.uploading).toBe(true);
  await act(async () => { work.resolve(processed); await pending; });
  expect(attachments.images).toHaveLength(1);
  expect(attachments.uploading).toBe(false);
  await act(async () => attachments.pick(files));
  expect(processImageForUpload).toHaveBeenCalledTimes(1);
  expect(toast.error).toHaveBeenCalledWith("upload.imageLimit");
});

it("does not restore cleared attachments or reset a newer batch's busy state", async () => {
  const oldWork = deferred<typeof processed>();
  const newWork = deferred<typeof processed>();
  vi.mocked(processImageForUpload).mockReturnValueOnce(oldWork.promise).mockReturnValueOnce(newWork.promise);
  let oldPick!: Promise<void>;
  let newPick!: Promise<void>;
  await act(async () => { oldPick = attachments.pick(files); });
  await act(async () => { attachments.clear(); newPick = attachments.pick(files); });
  await act(async () => { oldWork.resolve(processed); await oldPick; });
  expect(attachments.images).toEqual([]);
  expect(attachments.uploading).toBe(true);
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  await act(async () => { newWork.resolve(processed); await newPick; });
  expect(attachments.images).toHaveLength(1);
});

it("does not allocate previews after unmount", async () => {
  const work = deferred<typeof processed>();
  vi.mocked(processImageForUpload).mockReturnValue(work.promise);
  let pending!: Promise<void>;
  await act(async () => { pending = attachments.pick(files); });
  await act(async () => root.unmount());
  await act(async () => { work.resolve(processed); await pending; });
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it("reports processing failures and permits retry", async () => {
  vi.mocked(processImageForUpload).mockRejectedValueOnce(new Error("image.invalid"));
  await act(async () => attachments.pick(files));
  expect(attachments.uploading).toBe(false);
  expect(attachments.images).toEqual([]);
  expect(toast.error).toHaveBeenCalledWith("image.invalid");
  await act(async () => attachments.pick(files));
  expect(attachments.images).toHaveLength(1);
});

it("releases partial batch previews when cleared during the next image", async () => {
  function Probe() {
    attachments = useImageAttachments("issue", { ...settings, issueMaxImages: 2 });
    return null;
  }
  await act(async () => root.render(createElement(Probe)));
  const work = deferred<typeof processed>();
  vi.mocked(processImageForUpload).mockResolvedValueOnce(processed).mockReturnValueOnce(work.promise);
  let pending!: Promise<void>;
  await act(async () => { pending = attachments.pick([file, file] as unknown as FileList); });
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
  await act(async () => attachments.clear());
  await act(async () => { work.resolve(processed); await pending; });
  expect(attachments.images).toEqual([]);
  expect(revoke).toHaveBeenCalledWith("blob:preview");
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
});

it("updates selection synchronously when removed and picked in the same event", async () => {
  await act(async () => attachments.pick(files));
  await act(async () => { attachments.remove(0); await attachments.pick(files); });
  expect(attachments.images).toHaveLength(1);
  expect(revoke).toHaveBeenCalledTimes(1);
  expect(processImageForUpload).toHaveBeenCalledTimes(2);
});

it("checks upload results against the submitted snapshot when selection changes", async () => {
  await act(async () => attachments.pick(files));
  const work = deferred<Awaited<ReturnType<typeof createImageUploadPolicies>>>();
  vi.mocked(createImageUploadPolicies).mockReturnValue(work.promise);
  let pending!: ReturnType<typeof attachments.uploadAndAppend>;
  await act(async () => { pending = attachments.uploadAndAppend("body"); });
  await act(async () => attachments.remove(0));
  await act(async () => {
    work.resolve([{ height: 100, width: 100, storagePath: "path", uploadId: "id" }]);
    expect(await pending).toMatchObject({ content: "body\n\n![image|100x100](srp-upload://id)" });
  });
});
