import { asRecord, asString } from "../_shared/http.ts";
import type { AuthContext, BackendSupabase, JsonRecord } from "./types.ts";
import { asBoolean, asNumber } from "./utils.ts";
import { requirePermission } from "./auth.ts";

const CATEGORY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const READ_ACCESS_VALUES = new Set(["school", "reviewed-school", "owner-admin"]);

export interface RuntimeIssueCategory {
  authorVisible: boolean;
  commentsEnabled: boolean;
  id: string;
  isActive: boolean;
  isDefault: boolean;
  label: string;
  readAccess: "owner-admin" | "reviewed-school" | "school";
  responseDeadlineDays: number | null;
  sortOrder: number;
  supportDeadlineDays: number | null;
  supportEnabled: boolean;
  supportGoal: number | null;
}

export interface RuntimeFacilityCategory {
  id: string;
  isActive: boolean;
  isDefault: boolean;
  label: string;
  sortOrder: number;
}

function nullablePositiveInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Math.round(asNumber(value, 0));
  if (number < 1) throw new Error("validation-required");
  return number;
}

function categoryIdentity(value: JsonRecord) {
  const id = asString(value.id).trim();
  const label = asString(value.label).trim();
  if (!CATEGORY_ID_PATTERN.test(id) || label.length < 1 || label.length > 40) {
    throw new Error("validation-required");
  }
  return { id, label };
}

function issueCategoryInput(value: unknown, sortOrder: number) {
  const record = asRecord(value);
  const identity = categoryIdentity(record);
  const readAccess = asString(record.readAccess);
  if (!READ_ACCESS_VALUES.has(readAccess)) throw new Error("validation-required");
  if (readAccess !== "owner-admin" && typeof record.authorVisible !== "boolean") {
    throw new Error("validation-required");
  }
  const authorVisible = readAccess === "owner-admin" ? true : asBoolean(record.authorVisible);
  const supportEnabled = asBoolean(record.supportEnabled);
  return {
    ...identity,
    authorVisible,
    commentsEnabled: asBoolean(record.commentsEnabled, true),
    readAccess,
    responseDeadlineDays: nullablePositiveInteger(record.responseDeadlineDays),
    sortOrder,
    supportDeadlineDays: supportEnabled ? nullablePositiveInteger(record.supportDeadlineDays) : null,
    supportEnabled,
    supportGoal: supportEnabled ? nullablePositiveInteger(record.supportGoal) : null,
  };
}

function facilityCategoryInput(value: unknown, sortOrder: number) {
  return { ...categoryIdentity(asRecord(value)), sortOrder };
}

function issueCategoryResponse(row: Record<string, unknown>): RuntimeIssueCategory {
  return {
    authorVisible: row.author_visible === true,
    commentsEnabled: row.comments_enabled !== false,
    id: asString(row.id),
    isActive: row.is_active !== false,
    isDefault: row.is_default === true,
    label: asString(row.label),
    readAccess: READ_ACCESS_VALUES.has(asString(row.read_access))
      ? asString(row.read_access) as RuntimeIssueCategory["readAccess"]
      : "owner-admin",
    responseDeadlineDays: typeof row.response_deadline_days === "number" ? row.response_deadline_days : null,
    sortOrder: asNumber(row.sort_order, 0),
    supportDeadlineDays: typeof row.support_deadline_days === "number" ? row.support_deadline_days : null,
    supportEnabled: row.support_enabled === true,
    supportGoal: typeof row.support_goal === "number" ? row.support_goal : null,
  };
}

function facilityCategoryResponse(row: Record<string, unknown>): RuntimeFacilityCategory {
  return {
    id: asString(row.id),
    isActive: row.is_active !== false,
    isDefault: row.is_default === true,
    label: asString(row.label),
    sortOrder: asNumber(row.sort_order, 0),
  };
}

export async function getIssueCategories(supabase: BackendSupabase, includeInactive = false) {
  let query = supabase.schema("app_private").from("issue_categories").select("*")
    .order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => issueCategoryResponse(row));
}

export async function getFacilityCategories(supabase: BackendSupabase, includeInactive = false) {
  let query = supabase.schema("app_private").from("facility_categories").select("*")
    .order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => facilityCategoryResponse(row));
}

export async function getIssueCategory(supabase: BackendSupabase, categoryId: string) {
  const { data, error } = await supabase.schema("app_private").from("issue_categories")
    .select("*").eq("id", categoryId).eq("is_active", true).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("invalid-issue-category");
  return issueCategoryResponse(data);
}

export async function issueCategoryPolicyLists(supabase: BackendSupabase) {
  const categories = await getIssueCategories(supabase, true);
  return {
    authorPrivateCategoryIds: categories.filter((category) => !category.authorVisible).map((category) => category.id),
    privateToOwnerCategoryIds: categories.filter((category) => category.readAccess === "owner-admin").map((category) => category.id),
    publicCommentCategoryIds: categories.filter((category) => category.readAccess !== "owner-admin").map((category) => category.id),
    reviewRequiredCategoryIds: categories.filter((category) => category.readAccess === "reviewed-school").map((category) => category.id),
  };
}

async function catalog(supabase: BackendSupabase, includeInactive: boolean) {
  const [issueCategories, facilityCategories] = await Promise.all([
    getIssueCategories(supabase, includeInactive),
    getFacilityCategories(supabase, includeInactive),
  ]);
  return { issueCategories, facilityCategories };
}

async function recordCategoryAudit(
  supabase: BackendSupabase,
  auth: AuthContext,
  categoryType: "facility" | "issue",
  categoryId: string,
  operation: string,
  before: unknown,
  after: unknown,
) {
  const { error } = await supabase.schema("app_private").from("category_configuration_audit").insert({
    actor_uid: auth.uid,
    category_id: categoryId,
    domain: categoryType,
    operation,
    before_value: before,
    after_value: after,
  });
  if (error) throw error;
}

async function saveIssueCategory(payload: JsonRecord, auth: AuthContext, supabase: BackendSupabase) {
  requirePermission(auth, "category.manage");
  const requested = asRecord(payload.category);
  const input = issueCategoryInput(requested, asNumber(requested.sortOrder, 0));
  const { data: existing, error: readError } = await supabase.schema("app_private").from("issue_categories")
    .select("*").eq("id", input.id).maybeSingle();
  if (readError) throw readError;
  if (existing && (
    asString(existing.read_access) !== input.readAccess
    || existing.author_visible !== input.authorVisible
  )) throw new Error("immutable-category-policy");
  if (asBoolean(requested.isDefault, existing?.is_default === true)) {
    const { error } = await supabase.schema("app_private").from("issue_categories")
      .update({ is_default: false }).neq("id", input.id);
    if (error) throw error;
  }
  const row = {
    author_visible: input.authorVisible,
    comments_enabled: input.commentsEnabled,
    created_by: existing ? existing.created_by : auth.uid,
    id: input.id,
    is_active: existing ? asBoolean(requested.isActive, existing.is_active !== false) : true,
    is_default: asBoolean(requested.isDefault, existing?.is_default === true),
    label: input.label,
    read_access: input.readAccess,
    response_deadline_days: input.responseDeadlineDays,
    sort_order: input.sortOrder,
    support_deadline_days: input.supportDeadlineDays,
    support_enabled: input.supportEnabled,
    support_goal: input.supportGoal,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.schema("app_private").from("issue_categories")
    .upsert(row, { onConflict: "id" }).select("*").single();
  if (error) throw error;
  await recordCategoryAudit(supabase, auth, "issue", input.id, existing ? "update" : "create", existing, data);
  return { category: issueCategoryResponse(data) };
}

async function saveFacilityCategory(payload: JsonRecord, auth: AuthContext, supabase: BackendSupabase) {
  requirePermission(auth, "category.manage");
  const requested = asRecord(payload.category);
  const input = facilityCategoryInput(requested, asNumber(requested.sortOrder, 0));
  const { data: existing, error: readError } = await supabase.schema("app_private").from("facility_categories")
    .select("*").eq("id", input.id).maybeSingle();
  if (readError) throw readError;
  if (asBoolean(requested.isDefault, existing?.is_default === true)) {
    const { error } = await supabase.schema("app_private").from("facility_categories")
      .update({ is_default: false }).neq("id", input.id);
    if (error) throw error;
  }
  const row = {
    created_by: existing ? existing.created_by : auth.uid,
    id: input.id,
    is_active: existing ? asBoolean(requested.isActive, existing.is_active !== false) : true,
    is_default: asBoolean(requested.isDefault, existing?.is_default === true),
    label: input.label,
    sort_order: input.sortOrder,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.schema("app_private").from("facility_categories")
    .upsert(row, { onConflict: "id" }).select("*").single();
  if (error) throw error;
  await recordCategoryAudit(supabase, auth, "facility", input.id, existing ? "update" : "create", existing, data);
  return { category: facilityCategoryResponse(data) };
}

export async function handleCategoryAction(
  action: string,
  payload: JsonRecord,
  auth: AuthContext,
  supabase: BackendSupabase,
) {
  if (action === "getCategoryCatalog") {
    return { ...await catalog(supabase, true), setupCompleted: auth.setupCompleted };
  }
  if (action === "getCategoryManagement") {
    requirePermission(auth, "category.manage");
    return { ...await catalog(supabase, true), setupCompleted: auth.setupCompleted };
  }
  if (action === "saveIssueCategory") return await saveIssueCategory(payload, auth, supabase);
  if (action === "saveFacilityCategory") return await saveFacilityCategory(payload, auth, supabase);
  if (action === "completeInitialSetup") {
    if (!auth.isAdmin) throw new Error("permission-denied");
    if (auth.setupCompleted) throw new Error("setup-already-completed");
    const rawIssueCategories = Array.isArray(payload.issueCategories) ? payload.issueCategories : [];
    const rawFacilityCategories = Array.isArray(payload.facilityCategories) ? payload.facilityCategories : [];
    const issueCategories = rawIssueCategories.map((value, index) => issueCategoryInput(value, index));
    const facilityCategories = rawFacilityCategories.map((value, index) => facilityCategoryInput(value, index));
    if (issueCategories.length < 1 || facilityCategories.length < 1) throw new Error("validation-required");
    const { data, error } = await supabase.schema("app_api").rpc("backend_complete_initial_setup", {
      actor_uid: auth.uid,
      issue_categories: issueCategories,
      facility_categories: facilityCategories,
    });
    if (error) throw error;
    return asRecord(data);
  }
  throw new Error("invalid-action");
}
