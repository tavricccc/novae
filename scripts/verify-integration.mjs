import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { createWriteStream, existsSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import process from "node:process";
import { clearInterval, setInterval } from "node:timers";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";
import {
  disableWindowsWslDockerAutostart,
  isWindowsWslDistroRunning,
  isWindowsWslDockerActive,
  resolveWindowsWslDistro,
  startWindowsWslDocker,
  stopWindowsWslDockerIfIdle,
  terminateWindowsWslDistro,
} from "./wsl.mjs";

const root = process.cwd();
const e2e = process.argv.includes("--e2e");
const serve = process.argv.includes("--serve");
const skipBuild = process.argv.includes("--skip-build");
const projectIndex = process.argv.indexOf("--project");
const e2eProject = projectIndex >= 0 ? process.argv[projectIndex + 1] : null;
const e2eProjects = new Set([
  "chromium-desktop-readonly",
  "chromium-mobile-readonly",
  "chromium-stateful",
]);
if (e2eProject && !e2eProjects.has(e2eProject)) {
  throw new Error(`Unsupported E2E project: ${e2eProject}.`);
}
if ((projectIndex >= 0 && !e2eProject) || (!e2e && (skipBuild || e2eProject))) {
  throw new Error("--project and --skip-build require --e2e.");
}
const stressIndex = process.argv.indexOf("--stress-scale");
const stressScale = stressIndex >= 0 ? process.argv[stressIndex + 1] : "4";
if (!/^\d+$/u.test(stressScale) || Number(stressScale) < 2 || Number(stressScale) > 20) {
  throw new Error("--stress-scale must be an integer between 2 and 20.");
}
const configuredActionRunners = Number.parseInt(process.env.NOVAE_ACTION_TEST_RUNNERS ?? "3", 10);
const actionTestRunners = Number.isSafeInteger(configuredActionRunners)
  ? Math.min(4, Math.max(1, configuredActionRunners))
  : 3;
// Package-manager launchers may terminate this process before its Ctrl+C cleanup
// finishes, leaving services, PostgreSQL, or WSL behind. The interactive environment
// therefore runs one level deeper in its own process group, where the launcher's death
// is the stop signal instead of a signal that arrives too late. Terminal output stays
// inherited, so the shutdown sequence is still visible.
if (serve && !process.env.NOVAE_SERVE_SESSION) {
  const session = spawn(
    process.execPath,
    [fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    {
      cwd: root,
      detached: true,
      env: {
        ...process.env,
        NOVAE_SERVE_SESSION: "1",
        // The session reads its stop signal from stdin, so the distribution is chosen
        // here, while this process still owns the terminal.
        NOVAE_WSL_DISTRO: (await resolveWindowsWslDistro()) ?? "",
      },
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
  const [code] = await once(session, "exit");
  process.exit(code ?? 0);
}

const runtimeDatabaseUrl =
  "postgresql://novae_runtime:novae-runtime-local@127.0.0.1:55432/novae";
const ownerDatabaseUrl =
  "postgresql://novae:novae-local@127.0.0.1:55432/novae";
const adminDatabaseUrl =
  "postgresql://novae:novae-local@127.0.0.1:55432/postgres";
const workerUrl = "http://127.0.0.1:8787";
const appPort = Number(process.env.NOVAE_TEST_APP_PORT || 3000);
if (!Number.isInteger(appPort) || appPort < 1024 || appPort > 65535) throw new Error('Invalid NOVAE_TEST_APP_PORT');
const appUrl = `http://127.0.0.1:${appPort}`;
const integrationLockPort = Number(process.env.NOVAE_INTEGRATION_LOCK_PORT || 46987);
if (!Number.isInteger(integrationLockPort) || integrationLockPort < 1024 || integrationLockPort > 65535) {
  throw new Error("Invalid NOVAE_INTEGRATION_LOCK_PORT");
}
const npx = process.platform === "win32"
  ? {
      args: [join(dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js")],
      command: process.execPath,
    }
  : { args: [], command: "npx" };
const nextCli = join(root, "node_modules", "next", "dist", "bin", "next");
const playwrightCli = join(root, "node_modules", "@playwright", "test", "cli.js");
const vitestCli = join(root, "node_modules", "vitest", "vitest.mjs");
const wranglerCli = join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const tempDirectory = await mkdtemp(join(tmpdir(), "novae-integration-"));
const children = [];
const ownedPorts = new Set();
let cleanupPromise;
let windowsWslDistro = null;
let windowsWslWasRunning = false;
let windowsDockerWasActive = false;
const runnerDatabaseNames = [];

async function recreateRunnerDatabases(count) {
  const client = new pg.Client({ connectionString: adminDatabaseUrl });
  await client.connect();
  try {
    for (let index = 1; index <= count; index += 1) {
      const name = `novae_actions_${index}`;
      await client.query(
        "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
        [name],
      );
      await client.query(`drop database if exists ${name}`);
      await client.query(`create database ${name} template novae`);
      runnerDatabaseNames.push(name);
    }
  } finally {
    await client.end();
  }
}

async function dropRunnerDatabases() {
  if (runnerDatabaseNames.length === 0) return;
  const client = new pg.Client({ connectionString: adminDatabaseUrl });
  await client.connect();
  try {
    for (const name of runnerDatabaseNames.splice(0)) {
      await client.query(
        "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
        [name],
      );
      await client.query(`drop database if exists ${name}`);
    }
  } finally {
    await client.end();
  }
}

function run(label, command, args, environment = {}) {
  process.stderr.write(`[integration] ${label}\n`);
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...environment },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 1}.`);
  }
}

async function databaseHealthSnapshot() {
  const client = new pg.Client({ connectionString: ownerDatabaseUrl, connectionTimeoutMillis: 2_000 });
  await client.connect();
  try {
    const result = await client.query(`
      select state, wait_event_type, wait_event, count(*)::int as count
      from pg_stat_activity
      where datname = current_database()
      group by state, wait_event_type, wait_event
      order by count(*) desc
    `);
    return result.rows;
  } finally {
    await client.end();
  }
}

async function probeWorkerDatabase() {
  const response = await fetch(`${workerUrl}/v1/actions`, {
    body: JSON.stringify({ action: "healthcheck", payload: {} }),
    headers: {
      "content-type": "application/json",
      origin: appUrl,
      "x-healthcheck-secret": "integration-healthcheck-secret",
    },
    method: "POST",
    signal: AbortSignal.timeout(5_000),
  });
  const body = await response.text();
  if (!response.ok || !body.includes('"type":"end"')) {
    throw new Error(`Worker healthcheck returned ${response.status}: ${body.slice(0, 500)}`);
  }
}

async function runBrowserJourneys(label, args, environment) {
  process.stderr.write(`[integration] ${label}\n`);
  const child = spawn(process.execPath, [playwrightCli, "test", ...args], {
    cwd: root,
    env: { ...process.env, ...environment },
    stdio: "inherit",
  });
  let consecutiveFailures = 0;
  let healthFailure = null;
  let probing = false;
  const timer = setInterval(async () => {
    if (probing || child.exitCode !== null) return;
    probing = true;
    try {
      await probeWorkerDatabase();
      consecutiveFailures = 0;
    } catch (error) {
      consecutiveFailures += 1;
      if (consecutiveFailures >= 3 && !healthFailure) {
        let database = [];
        try {
          database = await databaseHealthSnapshot();
        } catch (snapshotError) {
          database = [{ snapshotError: String(snapshotError) }];
        }
        healthFailure = new Error(
          `E2E service health failed three times: ${String(error)}\nPostgreSQL activity: ${JSON.stringify(database)}`,
        );
        if (process.platform === "win32") {
          spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        } else {
          child.kill("SIGTERM");
        }
      }
    } finally {
      probing = false;
    }
  }, 15_000);
  timer.unref();
  const status = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  clearInterval(timer);
  if (healthFailure) throw healthFailure;
  if (status !== 0) throw new Error(`${label} failed with exit code ${status ?? 1}.`);
}

function start(label, command, args, environment = {}, ports = []) {
  const logPath = join(tempDirectory, `${label.replace(/[^a-z0-9]+/giu, "-")}.log`);
  const log = createWriteStream(logPath, { flags: "a" });
  const child = spawn(command, args, {
    cwd: root,
    detached: process.platform !== "win32",
    env: { ...process.env, ...environment },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  children.push({ child, label, log, logPath });
  for (const port of ports) ownedPorts.add(port);
  return child;
}

async function acquireIntegrationLock() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", (error) => {
      if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
        reject(new Error(
          `Another Novae integration environment is already starting or running on lock port ${integrationLockPort}.`,
        ));
        return;
      }
      reject(error);
    });
    server.listen(integrationLockPort, "127.0.0.1", resolve);
  });
  return server;
}

async function releaseIntegrationLock(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function findAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Could not allocate an external provider test port.");
  }
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function keepWindowsWslRunning() {
  if (process.platform !== "win32") return;
  const distro = await resolveWindowsWslDistro();
  windowsWslDistro = distro;
  windowsWslWasRunning = isWindowsWslDistroRunning(distro);
  process.env.NOVAE_WSL_DISTRO = distro;
  const keepalive = start(
    "wsl-keepalive",
    "wsl.exe",
    ["-d", distro, "--", "sh", "-lc", "while :; do sleep 60; done"],
  );
  await delay(250);
  if (keepalive.exitCode !== null) {
    throw new Error(`Could not keep the ${distro} WSL runtime active.`);
  }
  disableWindowsWslDockerAutostart(distro);
  windowsDockerWasActive = windowsWslWasRunning && isWindowsWslDockerActive(distro);
  if (!isWindowsWslDockerActive(distro)) startWindowsWslDocker(distro);
}

function windowsListenerPids(ports) {
  if (process.platform !== "win32") return [];
  const result = spawnSync("netstat.exe", ["-ano", "-p", "tcp"], { encoding: "utf8" });
  if (result.error) throw result.error;
  const pids = new Set();
  for (const line of result.stdout.split(/\r?\n/u)) {
    const fields = line.trim().split(/\s+/u);
    if (fields[0] !== "TCP" || fields.length < 5) continue;
    const portMatch = fields[1].match(/:(\d+)$/u);
    const pid = Number(fields.at(-1));
    if (portMatch && ports.has(Number(portMatch[1])) && Number.isSafeInteger(pid) && pid > 0) {
      pids.add(pid);
    }
  }
  return [...pids];
}

async function stopChild(entry) {
  if (entry.child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(entry.child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-entry.child.pid, "SIGTERM");
    } catch {
      entry.child.kill("SIGTERM");
    }
  }
}

async function performCleanup() {
  let cleanupError;
  for (const entry of [...children].reverse()) await stopChild(entry);
  try {
    await dropRunnerDatabases();
  } catch (error) {
    cleanupError ??= error;
  }
  if (process.platform === "win32") {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const listenerPids = windowsListenerPids(ownedPorts);
      if (listenerPids.length === 0) break;
      for (const pid of listenerPids) {
        spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
      }
      await delay(100);
    }
    const remainingPids = windowsListenerPids(ownedPorts);
    if (remainingPids.length > 0) {
      cleanupError = new Error(`Local verification processes did not stop: ${remainingPids.join(", ")}.`);
    }
  }
  for (const entry of children) entry.log.end();
  if (process.platform === "win32" && windowsWslDistro) {
    const stopped = spawnSync(process.execPath, ["scripts/database.mjs", "stop-local"], {
      cwd: root,
      env: {
        ...process.env,
        NOVAE_KEEP_DOCKER_RUNNING: "1",
        NOVAE_WSL_DISTRO: windowsWslDistro,
      },
      stdio: "inherit",
    });
    if (stopped.error) cleanupError ??= stopped.error;
    else if (stopped.status !== 0) cleanupError ??= new Error("Local PostgreSQL did not stop cleanly.");
    const dockerStopped = windowsDockerWasActive
      ? false
      : stopWindowsWslDockerIfIdle(windowsWslDistro);
    if (!windowsWslWasRunning && dockerStopped) {
      try {
        terminateWindowsWslDistro(windowsWslDistro);
      } catch (error) {
        cleanupError ??= error;
      }
    }
  }
  if (cleanupError) throw cleanupError;
}

function cleanup() {
  cleanupPromise ??= performCleanup();
  return cleanupPromise;
}

async function waitFor(label, url, expected, child, logPath, init = {}) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`${label} exited early.\n${readFileSync(logPath, "utf8").slice(-8000)}`);
    }
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(2_000) });
      if (expected(response)) return;
    } catch {
      // Service is still starting.
    }
    await delay(500);
  }
  throw new Error(`${label} did not become ready.\n${readFileSync(logPath, "utf8").slice(-8000)}`);
}

process.once("SIGINT", async () => {
  await cleanup();
  process.exit(130);
});
process.once("SIGTERM", async () => {
  await cleanup();
  process.exit(143);
});

const integrationLock = await acquireIntegrationLock();
try {
  const requiredServicePorts = new Set(serve || e2e ? [appPort, 4000, 4400, 4500, 8787, 9099] : [8787]);
  const occupiedServicePids = windowsListenerPids(requiredServicePorts);
  if (occupiedServicePids.length > 0) {
    throw new Error(
      `Integration service ports are already occupied by process IDs: ${occupiedServicePids.join(", ")}.`,
    );
  }

  await keepWindowsWslRunning();
  run("reset PostgreSQL and apply migrations", process.execPath, [
    "scripts/database.mjs",
    "reset-local",
    serve || e2e ? "--seed" : "--seed-integration",
  ]);
  if (!serve && !e2e) {
    run(
      "upgrade a populated pre-0016 database",
      process.execPath,
      ["scripts/verify-populated-migration-upgrade.mjs"],
      { DATABASE_OWNER_URL: ownerDatabaseUrl },
    );
  }
  run(
    "configure least-privilege Worker role",
    process.execPath,
    ["scripts/configure-database-runtime.mjs"],
    {
      DATABASE_RUNTIME_PASSWORD: "novae-runtime-local",
      DATABASE_URL: ownerDatabaseUrl,
    },
  );

  if (!serve && !e2e) await recreateRunnerDatabases(actionTestRunners);

  async function startExternalProvider(label) {
    const port = await findAvailablePort();
    const url = `http://127.0.0.1:${port}`;
    const provider = start(
      label,
      process.execPath,
      ["scripts/external-provider-test-server.mjs"],
      { NOVAE_EXTERNAL_PROVIDER_TEST_PORT: String(port) },
      [port],
    );
    const providerEntry = children.at(-1);
    await waitFor(label, `${url}/__requests`, (response) => response.status === 200, provider, providerEntry.logPath);
    run(
      `configure Cloudinary upload preset for ${label}`,
      process.execPath,
      ["scripts/configure-cloudinary.mjs"],
      {
        CLOUDINARY_API_BASE_URL: url,
        CLOUDINARY_API_KEY: "integration-api-key",
        CLOUDINARY_API_SECRET: "integration-api-secret",
        CLOUDINARY_CLOUD_NAME: "integration-cloud",
      },
    );
    return url;
  }

  const externalProviderUrl = await startExternalProvider("external-provider");
  const actionProviderUrls = [externalProviderUrl];
  if (!serve && !e2e) {
    for (let index = 2; index <= actionTestRunners; index += 1) {
      actionProviderUrls.push(await startExternalProvider(`external-provider-${index}`));
    }
  }

  let firebase;
  if (serve || e2e) {
    firebase = start(
      "firebase-auth",
      npx.command,
      [...npx.args, "--yes", "firebase-tools@15.24.0", "emulators:start", "--only", "auth", "--project", "integration-project"],
      {},
      [4000, 4400, 4500, 9099],
    );
    const firebaseEntry = children.at(-1);
    await waitFor(
      "Firebase Auth emulator",
      "http://127.0.0.1:9099/",
      () => true,
      firebase,
      firebaseEntry.logPath,
    );
  }

  const workerVariables = {
    ALLOWED_DOMAIN: "integration.invalid",
    ALLOWED_ORIGINS: `${appUrl},http://localhost:${appPort}`,
    ADMIN_EMAILS: "admin@integration.invalid",
    CLOUDINARY_API_BASE_URL: externalProviderUrl,
    CLOUDINARY_API_KEY: "integration-api-key",
    CLOUDINARY_API_SECRET: "integration-api-secret",
    CLOUDINARY_CLOUD_NAME: "integration-cloud",
    CLOUDINARY_DELIVERY_BASE_URL: externalProviderUrl,
    FCM_EMULATOR_URL: externalProviderUrl,
    FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    FIREBASE_APP_IDS: "1:123456789:web:local",
    FIREBASE_PROJECT_ID: "integration-project",
    FIREBASE_PROJECT_NUMBER: "123456789",
    FIREBASE_WEB_API_KEY: "integration-web-api-key",
    GOOGLE_SERVICE_ACCOUNT_JSON: "not-used-with-emulator",
    HEALTHCHECK_SECRET: "integration-healthcheck-secret",
    LOCAL_TEST_MODE: "true",
    MEDIA_SIGNING_SECRET: "integration-media-signing-secret-that-is-long-enough",
    NOTION_API_BASE_URL: externalProviderUrl,
    NOTION_DATABASE_ID: "mock-database-id",
    NOTION_TOKEN: "mock-notion-token",
    PUBLIC_API_URL: workerUrl,
    REALTIME_TICKET_SECRET: "integration-realtime-ticket-secret-that-is-long-enough",
    TURNSTILE_SECRET_KEY: "integration-turnstile-secret",
  };
  const workerArgs = [
    "dev",
    "--config",
    "cloudflare/wrangler.json",
    "--local",
    "--port",
    "8787",
  ];
  for (const [name, value] of Object.entries(workerVariables)) {
    workerArgs.push("--var", `${name}:${value}`);
  }
  const worker = start("cloudflare-worker", process.execPath, [wranglerCli, ...workerArgs], {}, [8787]);
  const workerEntry = children.at(-1);
  await waitFor(
    "Cloudflare Worker",
    `${workerUrl}/v1/actions`,
    (response) => response.status === 204,
    worker,
    workerEntry.logPath,
    { headers: { origin: appUrl }, method: "OPTIONS" },
  );

  const integrationEnvironment = {
    CLOUDINARY_API_BASE_URL: externalProviderUrl,
    CLOUDINARY_DELIVERY_BASE_URL: externalProviderUrl,
    DATABASE_URL: runtimeDatabaseUrl,
    DATABASE_OWNER_URL: ownerDatabaseUrl,
    FCM_EMULATOR_URL: externalProviderUrl,
    FIREBASE_PROJECT_ID: "integration-project",
    NOTION_API_BASE_URL: externalProviderUrl,
    NOTION_DATABASE_ID: "mock-database-id",
    NOTION_TOKEN: "mock-notion-token",
    NOVAE_STRESS_SCALE: stressScale,
    WORKER_URL: workerUrl,
  };

  if (!serve && !e2e) {
    process.stderr.write(`[integration] backend actions across ${actionTestRunners} isolated runners\n`);
    const results = await Promise.all(Array.from({ length: actionTestRunners }, (_, index) => {
      const databaseName = runnerDatabaseNames[index];
      const providerUrl = actionProviderUrls[index];
      const environment = {
        ...process.env,
        ...integrationEnvironment,
        CLOUDINARY_API_BASE_URL: providerUrl,
        CLOUDINARY_DELIVERY_BASE_URL: providerUrl,
        DATABASE_URL: `postgresql://novae_runtime:novae-runtime-local@127.0.0.1:55432/${databaseName}`,
        DATABASE_OWNER_URL: `postgresql://novae:novae-local@127.0.0.1:55432/${databaseName}`,
        FCM_EMULATOR_URL: providerUrl,
        NOTION_API_BASE_URL: providerUrl,
      };
      return new Promise((resolve, reject) => {
        const child = spawn(
          process.execPath,
          [
            vitestCli,
            "run",
            "--config",
            "vitest.integration.config.ts",
            `--shard=${index + 1}/${actionTestRunners}`,
          ],
          { cwd: root, env: environment, stdio: "inherit" },
        );
        child.once("error", reject);
        child.once("close", (status) => resolve(status ?? 1));
      });
    }));
    const failedRunner = results.findIndex((status) => status !== 0);
    if (failedRunner >= 0) {
      throw new Error(`Backend action runner ${failedRunner + 1} failed with exit code ${results[failedRunner]}.`);
    }
    run(
      "system data consistency verification",
      process.execPath,
      ["scripts/verify-data-consistency.mjs"],
      integrationEnvironment,
    );
    run(
      "generated database contract drift verification",
      process.execPath,
      ["scripts/generate-database-contracts.mjs", "--check"],
      integrationEnvironment,
    );
    process.stderr.write("✓ Local integration verification passed\n");
  } else {
    const frontendEnvironment = {
      ...integrationEnvironment,
      NEXT_PUBLIC_ALLOWED_DOMAIN: "integration.invalid",
      NEXT_PUBLIC_API_BASE_URL: workerUrl,
      NEXT_PUBLIC_CONTENT_REALTIME_ENABLED: e2e ? "false" : "true",
      NEXT_PUBLIC_FIREBASE_API_KEY: "integration-web-api-key",
      NEXT_PUBLIC_FIREBASE_APP_CHECK_ENABLED: "false",
      NEXT_PUBLIC_FIREBASE_APP_ID: "1:123456789:web:local",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "integration-project.firebaseapp.com",
      NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "123456789",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "integration-project",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
      NEXT_PUBLIC_LOCAL_DEV_AUTH: e2e ? "false" : "true",
      NEXT_PUBLIC_LOCAL_DEV_AUTH_EMAIL: "admin@integration.invalid",
      NOVAE_AUTH_EMULATOR_URL: "http://127.0.0.1:9099",
      NOVAE_E2E_BASE_URL: appUrl,
      NOVAE_LOCAL_APP_ORIGIN: appUrl,
      NOVAE_LOCAL_GATEWAY_URL: workerUrl,
    };
    if (e2e && !skipBuild) {
      run("build production frontend", process.execPath, [nextCli, "build", "--webpack"], frontendEnvironment);
    } else if (e2e && !existsSync(join(root, ".next", "BUILD_ID"))) {
      throw new Error("--skip-build requires an existing production .next build.");
    }
    const frontendArgs = e2e
      ? [nextCli, "start", "-H", "0.0.0.0", "-p", String(appPort)]
      : [nextCli, "dev", "--webpack", "-H", "0.0.0.0", "-p", String(appPort)];
    const frontend = start(
      "next",
      process.execPath,
      frontendArgs,
      frontendEnvironment,
      [appPort],
    );
    const frontendEntry = children.at(-1);
    await waitFor(
      "Next.js",
      `${appUrl}/login`,
      (response) => response.status === 200,
      frontend,
      frontendEntry.logPath,
    );
    run("Firebase login and API routing probe", process.execPath, ["scripts/check-local-auth-emulator.mjs"], frontendEnvironment);
    if (e2e) {
      if (e2eProject === "chromium-stateful") {
        await runBrowserJourneys(
          "Playwright account and content bootstrap",
          ["--project=bootstrap"],
          frontendEnvironment,
        );
        await runBrowserJourneys(
          "Playwright stateful browser journeys",
          [`--project=${e2eProject}`, "--no-deps"],
          frontendEnvironment,
        );
      } else {
        await runBrowserJourneys(
          `Playwright ${e2eProject ?? "browser"} journeys`,
          e2eProject ? [`--project=${e2eProject}`] : [],
          frontendEnvironment,
        );
      }
      process.stderr.write("✓ End-to-end verification passed\n");
    } else {
      process.stderr.write(`\n[environment] Ready\n  App: ${appUrl}\n  API: ${workerUrl}\n  Auth emulator: http://127.0.0.1:4000/auth\n  Stop: Ctrl+C\n`);
      process.stdin.resume();
      await Promise.race([once(frontend, "exit"), once(process.stdin, "end")]);
      process.stderr.write("\n[integration] stopping the local environment\n");
    }
  }
} finally {
  try {
    await cleanup();
  } finally {
    await releaseIntegrationLock(integrationLock);
  }
}
