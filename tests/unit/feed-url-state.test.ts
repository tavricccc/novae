import { act, createElement, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useFeedUrlState } from "@/hooks/use-feed-url-state";
import { normalizeFeedQuery, readFacilityFeedFilters, readIssueFeedFilters, updateFeedUrl } from "@/lib/feed-url-state";
import { getOperationPolicy } from "@/lib/operation-policies";

vi.mock("next/navigation", () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

let state: ReturnType<typeof useFeedUrlState>;
let root: Root;
function Probe() {
  const current = useFeedUrlState();
  useLayoutEffect(() => { state = current; });
  return null;
}
async function render() { await act(async () => root.render(createElement(Probe))); }

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.history.replaceState(null, "", "/facilities?category=library&q=water&bucket=closed&sort=most-affected&status=completed&source=notification#list");
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("parses validated issue and facility filters, rejecting invalid or contradictory values", () => {
  expect(readIssueFeedFilters(new URLSearchParams("bucket=closed&sort=ending-soon")))
    .toEqual({ bucket: "closed", sort: "ending-soon" });
  expect(readIssueFeedFilters(new URLSearchParams("bucket=deleted&sort=unsafe")))
    .toEqual({ bucket: "active", sort: "latest" });
  expect(readFacilityFeedFilters(new URLSearchParams(window.location.search)))
    .toEqual({ bucket: "closed", sort: "most-affected", status: "completed" });
  expect(readFacilityFeedFilters(new URLSearchParams("bucket=active&status=completed&sort=invalid")))
    .toEqual({ bucket: "active", sort: "latest", status: "" });
});

it("normalizes search text to the server search policy", () => {
  expect(normalizeFeedQuery("  圖書館漏水  ")).toBe("圖書館漏水");
  expect(normalizeFeedQuery("x".repeat(getOperationPolicy("searchLength") + 1)))
    .toHaveLength(getOperationPolicy("searchLength"));
});

it("preserves unrelated parameters and hashes when updating or clearing filters", () => {
  const href = updateFeedUrl(window.location.href, { q: null, bucket: null, status: null, category: "classroom" });
  const result = new URL(href, window.location.origin);
  expect(result.hash).toBe("#list");
  expect(result.searchParams.get("source")).toBe("notification");
  expect(result.searchParams.get("sort")).toBe("most-affected");
  expect(result.searchParams.get("category")).toBe("classroom");
  expect(result.searchParams.has("q")).toBe(false);
});

it("keeps typing local and commits one shareable history entry only on search", async () => {
  await render();
  const push = vi.spyOn(window.history, "pushState");
  await act(async () => state.setQuery("  新搜尋  "));
  expect(state.query).toBe("  新搜尋  ");
  expect(state.committedQuery).toBe("water");
  expect(push).not.toHaveBeenCalled();
  await act(async () => state.setCommittedQuery(state.query));
  await render();
  expect(push).toHaveBeenCalledTimes(1);
  expect(state.committedQuery).toBe("新搜尋");
  expect(state.query).toBe("新搜尋");
  expect(state.params.get("category")).toBe("library");
  await act(async () => state.setCommittedQuery(state.query));
  expect(push).toHaveBeenCalledTimes(1);
});

it("restores URL queries on external navigation and does not revive unsubmitted input", async () => {
  const original = window.location.href;
  await render();
  await act(async () => state.setQuery("not submitted"));
  window.history.replaceState(null, "", "/facilities?category=other&q=second");
  await render();
  expect(state.query).toBe("second");
  window.history.replaceState(null, "", original);
  await render();
  expect(state.query).toBe("water");
  expect(state.params.get("category")).toBe("library");
});

it("merges consecutive filter actions from the live URL rather than a stale render", async () => {
  await render();
  await act(async () => {
    state.updateParams({ bucket: null, status: null });
    state.updateParams({ sort: "latest" });
  });
  await render();
  expect(state.params.get("bucket")).toBeNull();
  expect(state.params.get("status")).toBeNull();
  expect(state.params.get("sort")).toBe("latest");
  expect(state.params.get("q")).toBe("water");
});
