import { act, createElement, type PropsWithChildren } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CommentComposer } from "@/components/comments/comment-composer";

vi.mock("@/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/hooks/use-session", () => ({ useSession: () => ({ user: { displayName: "Member" } }) }));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: PropsWithChildren) => children,
  TooltipTrigger: ({ children }: PropsWithChildren) => children,
  TooltipContent: () => null,
}));

let root: Root;
let container: HTMLDivElement;
const submit = vi.fn(async () => undefined);

async function render(content = "中文留言", busy = false) {
  await act(async () => root.render(createElement(CommentComposer, {
    busy, content, onChange: vi.fn(), onSubmit: submit,
  })));
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await render();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function keydown(options: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter", ...options });
  await act(async () => container.querySelector("textarea")!.dispatchEvent(event));
  return event;
}

it("does not submit or suppress IME confirmation with Ctrl/Cmd+Enter", async () => {
  const composing = await keydown({ ctrlKey: true, isComposing: true });
  const legacyIme = await keydown({ metaKey: true, keyCode: 229 });
  expect(submit).not.toHaveBeenCalled();
  expect(composing.defaultPrevented).toBe(false);
  expect(legacyIme.defaultPrevented).toBe(false);
});

it("submits a completed Ctrl/Cmd+Enter shortcut but keeps ordinary Enter as a newline", async () => {
  await keydown({});
  expect(submit).not.toHaveBeenCalled();
  expect((await keydown({ ctrlKey: true })).defaultPrevented).toBe(true);
  expect((await keydown({ metaKey: true })).defaultPrevented).toBe(true);
  expect(submit).toHaveBeenCalledTimes(2);
});

it("defers app updates while writing or sending and blocks busy shortcuts", async () => {
  expect(container.querySelector('[data-update-defer="true"]')).not.toBeNull();
  await render("", true);
  expect(container.querySelector('[data-update-defer="true"]')).not.toBeNull();
  await keydown({ ctrlKey: true });
  expect(submit).not.toHaveBeenCalled();
  await render("", false);
  expect(container.querySelector('[data-update-defer="true"]')).toBeNull();
});
