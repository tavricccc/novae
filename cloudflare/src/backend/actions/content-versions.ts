import type { BackendDatabase, JsonRecord } from "./types.ts";
import type { Selected } from "../database/schema.ts";

export type ContentVersionDomain = "issues" | "announcements" | "facilities";
export type ContentVersions = Record<ContentVersionDomain, number>;

const EMPTY_VERSIONS: ContentVersions = {
  announcements: 1,
  facilities: 1,
  issues: 1,
};

export async function loadContentVersions(database: BackendDatabase): Promise<ContentVersions> {
  const { rows } = await database.sql<Selected<"content_versions", "domain" | "version">>`
    select domain, version from app_private.content_versions`;
  const versions = { ...EMPTY_VERSIONS };
  for (const row of rows) {
    const domain = String(row.domain);
    if (domain === "announcements" || domain === "facilities" || domain === "issues") {
      versions[domain] = Math.max(1, Number(row.version));
    }
  }
  return versions;
}

export async function loadContentVersion(
  database: BackendDatabase,
  domain: ContentVersionDomain,
) {
  const row = await database.sqlMaybe<Selected<"content_versions", "version">>`
    select version from app_private.content_versions where domain = ${domain}`;
  return row ? Math.max(1, Number(row.version)) : EMPTY_VERSIONS[domain];
}

export function attachContentVersion(value: unknown, version: number) {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
  return { ...record, version };
}
