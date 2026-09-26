import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { promisify } from "node:util";
import process from "node:process";
import { URL } from "node:url";
import test from "node:test";

test("a second verifier refuses the environment before resetting its database", async () => {
  const lock = createServer();
  await new Promise((resolve) => lock.listen(0, "127.0.0.1", resolve));
  try {
    const result = await promisify(execFile)(process.execPath, ["scripts/verify-integration.mjs"], {
      cwd: new URL("../../", import.meta.url),
      env: { ...process.env, NOVAE_INTEGRATION_LOCK_PORT: String(lock.address().port) },
      timeout: 10_000,
    }).then(() => assert.fail("the second verifier must not start"), (error) => error);
    assert.match(result.stderr, /Another Novae integration environment is already starting or running/u);
    assert.doesNotMatch(result.stdout + result.stderr, /\[integration\] reset PostgreSQL/u);
  } finally {
    await new Promise((resolve, reject) => lock.close((error) => error ? reject(error) : resolve()));
  }
});
