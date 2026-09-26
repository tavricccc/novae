import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { hasUpdateDeferral, useUpdateDeferral } from "@/hooks/use-update-deferral";
import { setUnsavedChanges } from "@/hooks/unsaved-changes-store";

let root: Root;
let state = false;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  root = createRoot(document.createElement("div"));
  function Probe() { state = useUpdateDeferral(); return null; }
  await act(async () => root.render(createElement(Probe)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  setUnsavedChanges(null);
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it("defers automatic updates during composition and resumes on leaving", async () => {
  expect(state).toBe(false);
  const form = document.createElement("form");
  form.dataset.updateDefer = "true";
  await act(async () => { document.body.append(form); });
  expect(state).toBe(true);
  await act(async () => { form.remove(); });
  expect(state).toBe(false);
});

it("observes comment editing markers and admin unsaved changes", async () => {
  const comment = document.createElement("div");
  await act(async () => { document.body.append(comment); comment.dataset.updateDefer = "true"; });
  expect(state).toBe(true);
  await act(async () => { delete comment.dataset.updateDefer; });
  expect(state).toBe(false);
  await act(async () => setUnsavedChanges({ count: 1, discard: () => {} }));
  expect(state).toBe(true);
  await act(async () => setUnsavedChanges(null));
  expect(state).toBe(false);
});

it("preserves the sheet safeguard and defers offline or background reloads", async () => {
  const sheet = document.createElement("div");
  sheet.dataset.sheetSurface = ""; sheet.dataset.state = "open";
  await act(async () => { document.body.append(sheet); });
  expect(state).toBe(true);
  await act(async () => { sheet.dataset.state = "closed"; });
  expect(state).toBe(false);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  expect(hasUpdateDeferral()).toBe(true);
  await act(async () => window.dispatchEvent(new Event("offline")));
  expect(state).toBe(true);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  expect(hasUpdateDeferral()).toBe(true);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(state).toBe(false);
});
