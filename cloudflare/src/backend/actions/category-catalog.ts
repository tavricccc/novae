import { asString } from "../shared/http.ts";
import type { BackendDatabase } from "./types.ts";
import { asBoolean, asNumber } from "./utils.ts";
import { loadPlatformSettings } from "../shared/platform-settings.ts";
import type { Row, Selected } from "../database/schema.ts";

/**
 * The categories a school runs on, as everything else reads them.
 *
 * A category carries the policy of the content filed under it — who may read
 * it, whether the author is shown, how long support stays open — so the read
 * side is shared by every action that has to answer a question about an issue,
 * and is kept apart from the admin screens that rewrite the catalog.
 */
export const READ_ACCESS_VALUES = new Set(["school", "reviewed-school", "owner-admin"]);

export interface RuntimeIssueCategory {
  authorDeleteEnabled: boolean;
  authorVisible: boolean;
  commentsEnabled: boolean;
  id: string;
  isDefault: boolean;
  label: string;
  readAccess: "owner-admin" | "reviewed-school" | "school";
  sortOrder: number;
  supportDeadlineDays: number | null;
  supportEnabled: boolean;
  supportGoal: number | null;
}

export interface RuntimeFacilityCategory {
  authorDeleteEnabled: boolean;
  id: string;
  isDefault: boolean;
  label: string;
  sortOrder: number;
}

function issueCategoryResponse(row: Record<string, unknown>): RuntimeIssueCategory {
  return {
    authorDeleteEnabled: row.author_delete_enabled === true,
    authorVisible: row.author_visible === true,
    commentsEnabled: row.comments_enabled !== false,
    id: asString(row.id),
    isDefault: row.is_default === true,
    label: asString(row.label),
    readAccess: READ_ACCESS_VALUES.has(asString(row.read_access))
      ? asString(row.read_access) as RuntimeIssueCategory["readAccess"]
      : "owner-admin",
    sortOrder: asNumber(row.sort_order, 0),
    supportDeadlineDays: typeof row.support_deadline_days === "number" ? row.support_deadline_days : null,
    supportEnabled: row.support_enabled === true,
    supportGoal: typeof row.support_goal === "number" ? row.support_goal : null,
  };
}

function facilityCategoryResponse(row: Record<string, unknown>): RuntimeFacilityCategory {
  return {
    authorDeleteEnabled: row.author_delete_enabled === true,
    id: asString(row.id),
    isDefault: row.is_default === true,
    label: asString(row.label),
    sortOrder: asNumber(row.sort_order, 0),
  };
}

export async function getIssueCategories(database: BackendDatabase, includeInactive = false): Promise<RuntimeIssueCategory[]> {
  const { rows } = await database.sql<Row<"issue_categories">>`
    select * from app_private.issue_categories
    where ${includeInactive}::boolean or is_active = true
    order by sort_order, created_at`;
  return rows.map((row) => issueCategoryResponse(row));
}

export async function getFacilityCategories(database: BackendDatabase, includeInactive = false): Promise<RuntimeFacilityCategory[]> {
  const { rows } = await database.sql<Row<"facility_categories">>`
    select * from app_private.facility_categories
    where ${includeInactive}::boolean or is_active = true
    order by sort_order, created_at`;
  return rows.map((row) => facilityCategoryResponse(row));
}

export async function getFacilityCategory(database: BackendDatabase, categoryId: string) {
  const category = await database.sqlMaybe<Row<"facility_categories">>`
    select * from app_private.facility_categories where id = ${categoryId} and is_active = true`;
  if (!category) throw new Error("invalid-facility-category");
  return facilityCategoryResponse(category);
}

export async function getIssueCategory(database: BackendDatabase, categoryId: string) {
  const category = await database.sqlMaybe<Row<"issue_categories">>`
    select * from app_private.issue_categories where id = ${categoryId} and is_active = true`;
  if (!category) throw new Error("invalid-issue-category");
  return issueCategoryResponse(category);
}

export async function issueCategoryPolicyLists(database: BackendDatabase) {
  // Policy checks are on the hot read/write path. Avoid materializing full
  // category records when only the stable access columns are needed. Inactive
  // rows stay included because historical issues still carry those category IDs.
  const { rows } = await database.sql<Selected<"issue_categories", "id" | "author_visible" | "read_access">>`
    select id, author_visible, read_access from app_private.issue_categories`;
  return {
    authorPrivateCategoryIds: rows.filter((category) => category.author_visible !== true).map((category) => category.id),
    privateToOwnerCategoryIds: rows.filter((category) => category.read_access === "owner-admin").map((category) => category.id),
    publicCommentCategoryIds: rows.filter((category) => category.read_access !== "owner-admin").map((category) => category.id),
    reviewRequiredCategoryIds: rows.filter((category) => category.read_access === "reviewed-school").map((category) => category.id),
  };
}

export function categoryCatalogSegments(database: BackendDatabase, includeInactive: boolean) {
  const setup = database.sqlOne<Selected<"system_setup", "issues_enabled" | "facilities_enabled" | "announcement_comments_enabled">>`
      select issues_enabled, facilities_enabled, announcement_comments_enabled
      from app_private.system_setup where singleton = true`;
  const platformSettings = loadPlatformSettings(database);
  return {
    facilityCategories: getFacilityCategories(database, includeInactive),
    features: setup.then((value) => ({
      announcementCommentsEnabled: value.announcement_comments_enabled !== false,
      facilitiesEnabled: value.facilities_enabled !== false,
      issuesEnabled: value.issues_enabled !== false,
    })),
    imageUploads: platformSettings.then((settings) => settings.imageUploads),
    issueCategories: getIssueCategories(database, includeInactive),
  };
}

export async function loadCategoryCatalog(database: BackendDatabase, includeInactive: boolean) {
  const reads = categoryCatalogSegments(database, includeInactive);
  const [issueCategories, facilityCategories, features, imageUploads] = await Promise.all([
    reads.issueCategories,
    reads.facilityCategories,
    reads.features,
    reads.imageUploads,
  ]);
  return {
    issueCategories,
    facilityCategories,
    imageUploads,
    features,
  };
}
