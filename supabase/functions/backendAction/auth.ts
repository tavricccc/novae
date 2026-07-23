import { requireEnv } from "../_shared/env.ts";
import { ensureCloudinaryImageUploadPreset } from "../_shared/cloudinary.ts";
import { requireVerifiedFirebaseUser } from "../_shared/firebase-auth.ts";
import { RATE_LIMITS } from "../_shared/rate-limits.ts";
import type { AuthContext, BackendSupabase, PermissionCode } from "./types.ts";
import { edgeFunctionUrl } from "../_shared/origin.ts";

interface AuthIdentity {
  email: string;
  name: string;
  photoUrl: string | null;
  uid: string;
}

export async function resolveAuthContext(
  supabase: BackendSupabase,
  firebaseUser: AuthIdentity,
): Promise<AuthContext> {
  const { data, error } = await supabase.schema("app_api")
    .rpc("backend_get_access_context", { actor_uid: firebaseUser.uid });
  if (error) throw error;
  const access = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const roles = Array.isArray(access.roles)
    ? access.roles.filter((role): role is string => typeof role === "string")
    : [];
  const isPlatformAdmin = roles.includes("platform-admin");
  const managedIssueCategoryIds = isPlatformAdmin
    ? []
    : Array.isArray(access.managedIssueCategoryIds)
    ? [...new Set(access.managedIssueCategoryIds.filter((id): id is string => typeof id === "string"))]
    : [];
  const managedFacilityCategoryIds = isPlatformAdmin
    ? []
    : Array.isArray(access.managedFacilityCategoryIds)
    ? [...new Set(access.managedFacilityCategoryIds.filter((id): id is string => typeof id === "string"))]
    : [];
  const permissions = Array.isArray(access.permissions)
    ? [...new Set(access.permissions.filter((permission): permission is PermissionCode =>
      typeof permission === "string"
      && ["announcement.manage", "category.manage", "dashboard.view", "facility.manage", "proposal.manage", "role.manage"].includes(permission)
    ))]
    : [];
  if (managedIssueCategoryIds.length > 0 && !permissions.includes("proposal.manage")) {
    permissions.push("proposal.manage");
  }

  return {
    email: firebaseUser.email,
    isAdmin: isPlatformAdmin,
    managedFacilityCategoryIds,
    managedIssueCategoryIds,
    name: firebaseUser.name,
    photoUrl: firebaseUser.photoUrl,
    permissions,
    roles,
    setupCompleted: access.setupCompleted === true,
    uid: firebaseUser.uid,
  };
}

export async function requireAuth(supabase: BackendSupabase, request: Request): Promise<AuthContext> {
  return await resolveAuthContext(supabase, await requireVerifiedFirebaseUser(request));
}

export function canManageIssueCategory(auth: AuthContext, categoryId: string) {
  return auth.isAdmin || auth.managedIssueCategoryIds.includes(categoryId);
}

export function requireIssueCategoryPermission(auth: AuthContext, categoryId: string) {
  if (!canManageIssueCategory(auth, categoryId)) throw new Error("permission-denied");
}

export function canManageFacilityCategory(auth: AuthContext, categoryId: string) {
  return auth.isAdmin || auth.managedFacilityCategoryIds.includes(categoryId);
}

export function requireFacilityCategoryPermission(auth: AuthContext, categoryId: string) {
  if (!canManageFacilityCategory(auth, categoryId)) throw new Error("permission-denied");
}

export function hasPermission(auth: AuthContext, permission: PermissionCode) {
  return auth.permissions.includes(permission);
}

export function requirePermission(auth: AuthContext, permission: PermissionCode) {
  if (!hasPermission(auth, permission)) throw new Error("permission-denied");
}

export async function handleHealthcheck(request: Request, supabase: BackendSupabase) {
  const expected = requireEnv("WEBHOOK_SECRET");
  if (request.headers.get("x-healthcheck-secret") !== expected) {
    throw new Error("permission-denied");
  }

  requireEnv("APP_SUPABASE_SERVICE_ROLE_KEY");
  requireEnv("FIREBASE_WEB_API_KEY");
  requireEnv("ALLOWED_DOMAIN");
  requireEnv("ADMIN_EMAILS");
  requireEnv("UPSTASH_REDIS_REST_URL");
  requireEnv("UPSTASH_REDIS_REST_TOKEN");
  requireEnv("CLOUDFLARE_WORKER_URL");

  if (request.headers.get("x-reconcile-config") === "true") {
    await ensureCloudinaryImageUploadPreset(
      RATE_LIMITS.imageCompression.maxUploadBytes,
    );
  }

  const { error } = await supabase
    .schema("app_private")
    .from("roles")
    .select("code")
    .limit(1);
  if (error) throw error;
  const { data: issueCategories, error: categoryError } = await supabase.schema("app_private")
    .from("issue_categories").select("id,read_access").eq("is_active", true);
  if (categoryError) throw categoryError;
  const ownerAdminCategoryIds = (issueCategories ?? []).filter((category) => category.read_access === "owner-admin").map((category) => category.id);
  const reviewedSchoolCategoryIds = (issueCategories ?? []).filter((category) => category.read_access === "reviewed-school").map((category) => category.id);

  const { error: settingsError } = await supabase.schema("app_api").rpc("sync_runtime_settings", {
    settings: {
      deletion_worker_url: edgeFunctionUrl("delete"),
      firebase_project_id: requireEnv("FIREBASE_PROJECT_ID"),
      owner_admin_issue_categories: ownerAdminCategoryIds.join(","),
      reviewed_school_issue_categories: reviewedSchoolCategoryIds.join(","),
      maintenance_worker_url: edgeFunctionUrl("maintenance"),
      outbox_worker_url: edgeFunctionUrl("outbox"),
      webhook_secret: expected,
      edge_origin_secret: requireEnv("EDGE_ORIGIN_SECRET"),
    },
  });
  if (settingsError) throw settingsError;

  return { ok: true };
}
