import assert from "node:assert/strict";
import { errorEnvelope, errorResponse } from "../../supabase/functions/backendAction/response.ts";
import { claimFixedWindowRateLimit, RateLimitError, utcHourWindow } from "../../supabase/functions/_shared/upstash-rate-limit.ts";

Deno.test("API errors expose stable codes without backend-localized messages", async () => {
  const envelope = errorEnvelope(new Error("title-required"), "request-123");
  assert.deepEqual(envelope, {
    error: { code: "validation-required" },
    requestId: "request-123",
    success: false,
  });
  assert.equal("message" in envelope.error, false);

  const response = errorResponse(new Error("permission-denied"), "request-456");
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: { code: "permission-denied" },
    requestId: "request-456",
    success: false,
  });
});

Deno.test("rate-limit errors include machine-readable retry metadata", async () => {
  const response = errorResponse(
    new RateLimitError("rate-limit.issue-create", 42),
    "request-rate-limit",
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "42");
  assert.deepEqual(await response.json(), {
    error: { code: "rate-limit.issue-create", retryAfterSeconds: 42 },
    requestId: "request-rate-limit",
    success: false,
  });
});

Deno.test("Upstash business limits allow the configured quota and reject overflow", async () => {
  const identifier = `integration-rate-${crypto.randomUUID()}`;
  const config = { errorCode: "rate-limit.issue-create" as const, limit: 1 };
  await claimFixedWindowRateLimit(identifier, "integration.issue-create", utcHourWindow(), config);
  await assert.rejects(
    () => claimFixedWindowRateLimit(identifier, "integration.issue-create", utcHourWindow(), config),
    (error: unknown) => error instanceof RateLimitError && error.message === "rate-limit.issue-create",
  );
});
