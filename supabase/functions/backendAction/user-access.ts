import { asString } from "../_shared/http.ts";
import { createMediaDeliveryUrl } from "../_shared/media-delivery.ts";
import type { AuthContext, BackendSupabase, JsonRecord } from "./types.ts";
import { requirePermission } from "./auth.ts";

const ACCESS_LIST_LIMIT = 100;
const ACCESS_SCOPE_KINDS = new Set(["announcement", "facility", "issue"]);

interface AccessScopeSelector {
  categoryId: string;
  kind: "announcement" | "facility" | "issue";
}

function readAccessScope(payload: JsonRecord): AccessScopeSelector | null {
  const scopeKind = asString(payload.scopeKind);
  if (!scopeKind) return null;
  if (!ACCESS_SCOPE_KINDS.has(scopeKind)) throw new Error("validation-required");
  const categoryId = asString(payload.categoryId).trim();
  if ((scopeKind === "issue" || scopeKind === "facility") && !categoryId) {
    throw new Error("validation-required");
  }
  return { categoryId, kind: scopeKind as AccessScopeSelector["kind"] };
}

async function scopedAccessUids(scope: AccessScopeSelector, supabase: BackendSupabase) {
  const query = scope.kind === "announcement"
    ? supabase.schema("app_private").from("user_role_assignments")
      .select("uid").eq("role_code", "announcement-manager").limit(ACCESS_LIST_LIMIT + 1)
    : scope.kind === "issue"
    ? supabase.schema("app_private").from("user_issue_category_assignments")
      .select("uid").eq("category_id", scope.categoryId).limit(ACCESS_LIST_LIMIT + 1)
    : supabase.schema("app_private").from("user_facility_category_assignments")
      .select("uid").eq("category_id", scope.categoryId).limit(ACCESS_LIST_LIMIT + 1);
  const { data, error } = await query;
  if (error) throw error;
  const uids = [...new Set((data ?? []).map((row) => row.uid))];
  return { truncated: uids.length > ACCESS_LIST_LIMIT, uids: uids.slice(0, ACCESS_LIST_LIMIT) };
}

async function accessUsersForUids(uids: string[], supabase: BackendSupabase) {
  if (uids.length === 0) return [];
  const { data: profiles, error: profileError } = await supabase.schema("app_private").from("user_profiles")
    .select("uid,email,display_name,avatar_public_id,photo_url").in("uid", uids)
    .order("display_name", { ascending: true });
  if (profileError) throw profileError;
  const [roleResult, issueResult, facilityResult] = await Promise.all([
    supabase.schema("app_private").from("user_role_assignments").select("uid,role_code").in("uid", uids),
    supabase.schema("app_private").from("user_issue_category_assignments").select("uid,category_id").in("uid", uids),
    supabase.schema("app_private").from("user_facility_category_assignments").select("uid,category_id").in("uid", uids),
  ]);
  if (roleResult.error) throw roleResult.error;
  if (issueResult.error) throw issueResult.error;
  if (facilityResult.error) throw facilityResult.error;
  const roles = new Map<string, string[]>();
  const issueCategories = new Map<string, string[]>();
  const facilityCategories = new Map<string, string[]>();
  for (const assignment of roleResult.data ?? []) {
    roles.set(assignment.uid, [...(roles.get(assignment.uid) ?? []), assignment.role_code]);
  }
  for (const assignment of issueResult.data ?? []) {
    issueCategories.set(assignment.uid, [...(issueCategories.get(assignment.uid) ?? []), assignment.category_id]);
  }
  for (const assignment of facilityResult.data ?? []) {
    facilityCategories.set(assignment.uid, [...(facilityCategories.get(assignment.uid) ?? []), assignment.category_id]);
  }
  return await Promise.all((profiles ?? []).map(async (profile) => {
    const media = profile.avatar_public_id
      ? await createMediaDeliveryUrl(profile.avatar_public_id, "avatar", false)
      : null;
    return {
      uid: profile.uid,
      email: profile.email ?? null,
      name: profile.display_name ?? profile.email ?? profile.uid,
      photoUrl: media?.url ?? profile.photo_url ?? null,
      roles: roles.get(profile.uid) ?? [],
      managedIssueCategoryIds: issueCategories.get(profile.uid) ?? [],
      managedFacilityCategoryIds: facilityCategories.get(profile.uid) ?? [],
    };
  }));
}

export async function handleUserAccessAction(
  action: string,
  payload: JsonRecord,
  auth: AuthContext,
  supabase: BackendSupabase,
) {
  requirePermission(auth, "role.manage");
  if (action === "listRoleAssignments") {
    const rawQuery = asString(payload.query).trim();
    const scope = readAccessScope(payload);
    if (!rawQuery && !scope) throw new Error("validation-required");
    let truncated = false;
    let uids: string[] = [];
    if (rawQuery) {
      const query = rawQuery.includes("@") ? rawQuery.toLowerCase() : rawQuery;
      let profileQuery = supabase.schema("app_private").from("user_profiles").select("uid").limit(1);
      profileQuery = query.includes("@") ? profileQuery.eq("email", query) : profileQuery.eq("uid", query);
      const { data, error } = await profileQuery;
      if (error) throw error;
      uids = (data ?? []).map((profile) => profile.uid);
    } else if (scope) {
      const scoped = await scopedAccessUids(scope, supabase);
      truncated = scoped.truncated;
      uids = scoped.uids;
    }
    const users = await accessUsersForUids(uids, supabase);
    return { truncated, users: users.filter((user) => !user.roles.includes("platform-admin")) };
  }

  if (action === "setUserAccessScope") {
    const uid = asString(payload.uid).trim();
    const scope = readAccessScope(payload);
    if (!uid || !scope || typeof payload.grant !== "boolean") throw new Error("validation-required");
    const { data, error } = await supabase.schema("app_api").rpc("backend_update_user_access_scope", {
      actor_uid: auth.uid,
      target_uid: uid,
      scope_kind: scope.kind,
      category_id: scope.categoryId || null,
      grant_access: payload.grant,
    });
    if (error) throw error;
    return data;
  }

  throw new Error("invalid-action");
}
