import { beforeEach, expect, it, vi } from "vitest";
import { fetchUserIssues } from "@/services/issues-read-user";
import { getCachedContentPersistent } from "@/services/content-read-cache";

const backend = vi.hoisted(() => vi.fn(async () => ({
  cursor: null, hasMore: false, issues: [], statusCounts: {}, version: 1,
})));
vi.mock("@/services/backend-action", () => ({ invokeBackendAction: () => backend }));
vi.mock("@/lib/request", () => ({ readRequestTimeoutMs: 1_000 }));
vi.mock("@/services/content-versions", () => ({ registerContentVersion: vi.fn() }));
vi.mock("@/services/content-read-cache", () => ({
  captureContentCacheWriteGuard: vi.fn(),
  createContentCacheKey: (parts: unknown[]) => JSON.stringify(parts),
  getCachedContentPersistent: vi.fn(),
  setCachedContentFromRead: vi.fn(),
}));
vi.mock("@/services/issues-core", () => ({
  normalizeIssueCursor: (value: unknown) => value,
  normalizeIssueSummary: vi.fn(),
  toReadableBackendError: (error: unknown) => error,
  withSupportState: (value: unknown) => value,
}));

beforeEach(() => vi.clearAllMocks());

it("sends a trimmed search to the user's paginated issue endpoint", async () => {
  await fetchUserIssues("member", null, { query: "  圖書館  ", statusBucket: "closed" });
  expect(backend).toHaveBeenCalledWith(expect.objectContaining({ titleQuery: "圖書館", statusBucket: "closed", uid: "member" }));
});

it("keeps searches separate from each other and from unfiltered cached pages", async () => {
  await fetchUserIssues("member", null);
  await fetchUserIssues("member", null, { query: "library" });
  await fetchUserIssues("member", null, { query: "classroom" });
  const keys = vi.mocked(getCachedContentPersistent).mock.calls.map(([key]) => key);
  expect(new Set(keys).size).toBe(3);
});
