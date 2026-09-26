import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { resolveAppliedMigrationChecksum } from "./migration-checksum.mjs";
import {
  disableWindowsWslDockerAutostart,
  isWindowsWslDockerActive,
  resolveWindowsWslDistro,
  startWindowsWslDocker,
  stopWindowsWslDockerIfIdle,
} from "./wsl.mjs";

const { Client } = pg;
const root = fileURLToPath(new URL("../", import.meta.url));
const migrationsDirectory = fileURLToPath(
  new URL("../database/migrations/", import.meta.url),
);
const seedPath = fileURLToPath(
  new URL("../database/seed.local.sql", import.meta.url),
);
const integrationSeedPath = fileURLToPath(
  new URL("../database/seed.integration.sql", import.meta.url),
);
const localConnectionString =
  "postgresql://novae:novae-local@127.0.0.1:55432/novae";
const localAdminConnectionString =
  "postgresql://novae:novae-local@127.0.0.1:55432/postgres";
const containerName = "novae-postgres-local";
const volumeName = "novae-postgres-local-data";
let windowsWslDistro = process.env.NOVAE_WSL_DISTRO?.trim() || null;

function databaseUrl() {
  const connectionString = process.env.DATABASE_URL?.trim() || localConnectionString;
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get("sslmode");
  if (sslMode === "prefer" || sslMode === "require" || sslMode === "verify-ca") {
    url.searchParams.set("sslmode", "verify-full");
  }
  return url.toString();
}

function dockerInvocation(args) {
  if (process.platform !== "win32") return { command: "docker", args };
  return {
    command: "wsl.exe",
    args: ["-d", windowsWslDistro, "-u", "root", "--", "docker", ...args],
  };
}

function docker(args, { allowFailure = false, quiet = false } = {}) {
  const invocation = dockerInvocation(args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: root,
    encoding: "utf8",
    stdio: quiet ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) {
    throw new Error(`Docker command failed with exit ${result.status ?? "unknown"}.`);
  }
  return result;
}

async function waitForDatabase(connectionString = localConnectionString) {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const client = new Client({ connectionString });
    try {
      await client.connect();
      await client.query("select 1");
      await client.end();
      return;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
      await delay(500);
    }
  }
  throw lastError ?? new Error("Local PostgreSQL did not become ready.");
}

async function startLocalDatabase() {
  const inspected = docker(["inspect", containerName], {
    allowFailure: true,
    quiet: true,
  });
  if (inspected.status === 0) {
    docker(["update", "--restart=no", containerName]);
    const running = docker(
      ["inspect", "--format", "{{.State.Running}}", containerName],
      { quiet: true },
    ).stdout.trim();
    if (running !== "true") docker(["start", containerName]);
  } else {
    docker([
      "run",
      "--name",
      containerName,
      "--restart",
      "no",
      "--env",
      "POSTGRES_DB=novae",
      "--env",
      "POSTGRES_USER=novae",
      "--env",
      "POSTGRES_PASSWORD=novae-local",
      "--publish",
      "127.0.0.1:55432:5432",
      "--volume",
      `${volumeName}:/var/lib/postgresql/data`,
      "--detach",
      "postgres:17-alpine",
    ]);
  }
  // A failed reset can leave the application database absent. Check server
  // readiness through postgres so reset-local can recreate novae on retry.
  await waitForDatabase(localAdminConnectionString);
  console.log("Local PostgreSQL is ready on 127.0.0.1:55432.");
}

function stopLocalDatabase() {
  if (process.platform === "win32" && !isWindowsWslDockerActive(windowsWslDistro)) {
    stopWindowsWslDockerIfIdle(windowsWslDistro);
    return;
  }
  const inspected = docker(["inspect", containerName], { allowFailure: true, quiet: true });
  if (inspected.status === 0) {
    docker(["update", "--restart=no", containerName]);
    docker(["stop", "--timeout", "5", containerName], { allowFailure: true });
    const running = docker(
      ["inspect", "--format", "{{.State.Running}}", containerName],
      { quiet: true },
    ).stdout.trim();
    if (running === "true") throw new Error(`Docker container ${containerName} did not stop.`);
  }
  if (process.platform === "win32" && process.env.NOVAE_KEEP_DOCKER_RUNNING !== "1") {
    stopWindowsWslDockerIfIdle(windowsWslDistro);
  }
}

async function resetLocalDatabase() {
  await startLocalDatabase();
  const client = new Client({ connectionString: localAdminConnectionString });
  await client.connect();
  try {
    await client.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where datname = 'novae' and pid <> pg_backend_pid()",
    );
    await client.query("drop database if exists novae");
    // Roles are cluster-wide: other isolated verification databases may still
    // use this one. Runtime configuration safely reuses it after migration.
    await client.query("create database novae");
  } finally {
    await client.end();
  }
  await waitForDatabase();
}

async function migrationFiles() {
  return (await readdir(migrationsDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^\d+_[a-z0-9_]+\.sql$/u.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

async function migrate(connectionString = databaseUrl()) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query("select pg_advisory_lock(hashtext('novae-schema-migrations'))");
    await client.query(`
      create table if not exists public.novae_schema_migrations (
        name text primary key,
        checksum text not null,
        applied_at timestamptz not null default now()
      )
    `);
    const appliedResult = await client.query(
      "select name, checksum from public.novae_schema_migrations order by name",
    );
    const applied = new Map(
      appliedResult.rows.map((row) => [String(row.name), String(row.checksum)]),
    );
    for (const name of await migrationFiles()) {
      const source = await readFile(join(migrationsDirectory, name), "utf8");
      const existing = applied.get(name);
      const checksum = resolveAppliedMigrationChecksum(name, source, existing);
      if (existing) continue;
      await client.query("begin");
      try {
        await client.query(source);
        await client.query(
          "insert into public.novae_schema_migrations(name, checksum) values ($1, $2)",
          [name, checksum],
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
      console.log(`Applied ${name}`);
    }
  } finally {
    await client.query("select pg_advisory_unlock(hashtext('novae-schema-migrations'))").catch(() => undefined);
    await client.end();
  }
}

async function seed(connectionString = databaseUrl(), path = seedPath, label = "local") {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query(await readFile(path, "utf8"));
  } finally {
    await client.end();
  }
  console.log(`Applied deterministic ${label} seed data.`);
}

async function status(connectionString = databaseUrl()) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query(
      "select name, applied_at from public.novae_schema_migrations order by name",
    );
    console.table(result.rows);
  } finally {
    await client.end();
  }
}

const command = process.argv[2] || "migrate";
if (
  process.platform === "win32"
  && ["reset-local", "start-local", "stop-local"].includes(command)
) {
  windowsWslDistro = await resolveWindowsWslDistro();
  process.env.NOVAE_WSL_DISTRO = windowsWslDistro;
  disableWindowsWslDockerAutostart(windowsWslDistro);
  if (command !== "stop-local" && !isWindowsWslDockerActive(windowsWslDistro)) {
    startWindowsWslDocker(windowsWslDistro);
  }
}
if (command === "start-local") {
  await startLocalDatabase();
} else if (command === "reset-local") {
  await resetLocalDatabase();
  await migrate(localConnectionString);
  if (process.argv.includes("--seed")) await seed(localConnectionString);
  if (process.argv.includes("--seed-integration")) {
    await seed(localConnectionString, integrationSeedPath, "integration");
  }
} else if (command === "migrate") {
  await migrate();
} else if (command === "seed-local") {
  await seed(localConnectionString);
} else if (command === "seed-integration") {
  await seed(localConnectionString, integrationSeedPath, "integration");
} else if (command === "status") {
  await status();
} else if (command === "stop-local") {
  stopLocalDatabase();
} else {
  throw new Error(`Unknown database command: ${command}`);
}
