import {
  sha256Hex,
  uploadCloudinaryAuthenticatedImage,
} from "../_shared/cloudinary.ts";
import { createMediaDeliveryUrl } from "../_shared/media-delivery.ts";
import { asString } from "../_shared/http.ts";
import type { AuthContext, BackendSupabase, JsonRecord } from "./types.ts";
import { handleUserAccessAction } from "./user-access.ts";

const AVATAR_REVALIDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function isUserAction(action: string) {
  return action === "getCurrentUserRole"
    || action === "listRoleAssignments"
    || action === "setUserAccessScope"
    || action === "cacheUserAvatar"
    || action === "getUserPublicProfiles";
}

export async function handleUserAction(
  action: string,
  payload: JsonRecord,
  auth: AuthContext,
  supabase: BackendSupabase,
) {
  if (action === "getCurrentUserRole") {
    return {
      role: auth.roles.includes("platform-admin") ? "admin" : "user",
      roles: auth.roles,
      permissions: auth.permissions,
      managedIssueCategoryIds: auth.managedIssueCategoryIds,
      managedFacilityCategoryIds: auth.managedFacilityCategoryIds,
      setupCompleted: auth.setupCompleted,
    };
  }

  if (action === "listRoleAssignments" || action === "setUserAccessScope") {
    return await handleUserAccessAction(action, payload, auth, supabase);
  }

  if (action === "cacheUserAvatar") {
    const sourceUrl = auth.photoUrl;
    if (!sourceUrl) return { photoUrl: null };
    const parsedSourceUrl = new URL(sourceUrl);
    if (
      parsedSourceUrl.protocol !== "https:"
      || !parsedSourceUrl.hostname.toLowerCase().endsWith(".googleusercontent.com")
    ) throw new Error("validation-invalid");

    const { data: existing, error: existingError } = await supabase
      .schema("app_private")
      .from("user_profiles")
      .select("avatar_checked_at,avatar_hash,avatar_public_id,avatar_source_url,avatar_version,cached_photo_url")
      .eq("uid", auth.uid)
      .maybeSingle();
    if (existingError) throw existingError;
    const checkedAt = Date.parse(asString(existing?.avatar_checked_at));
    if (
      existing?.avatar_source_url === sourceUrl
      && existing.cached_photo_url
      && existing.avatar_public_id
      && Number.isFinite(checkedAt)
      && Date.now() - checkedAt < AVATAR_REVALIDATE_INTERVAL_MS
    ) {
      const media = await createMediaDeliveryUrl(existing.avatar_public_id, "avatar", false);
      return { photoUrl: media.url };
    }


    const imageResponse = await fetch(sourceUrl, {
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!imageResponse.ok) {
      throw new Error(`avatar-fetch-failed:${imageResponse.status}`);
    }
    const contentType = imageResponse.headers.get("content-type") ?? "";
    const contentLength = Number(imageResponse.headers.get("content-length") ?? 0);
    if (!contentType.startsWith("image/") || contentLength > 5 * 1024 * 1024) {
      throw new Error("validation-invalid");
    }
    const imageBuffer = await imageResponse.arrayBuffer();
    if (imageBuffer.byteLength > 5 * 1024 * 1024) throw new Error("validation-invalid");
    const avatarHash = await sha256Hex(imageBuffer);
    if (existing?.avatar_hash === avatarHash && existing.cached_photo_url && existing.avatar_public_id) {
      const { error } = await supabase.schema("app_private").from("user_profiles").upsert({
        uid: auth.uid,
        avatar_source_url: sourceUrl,
        avatar_checked_at: new Date().toISOString(),
        display_name: auth.name,
        photo_url: sourceUrl,
        updated_at: new Date().toISOString(),
      }, { onConflict: "uid" });
      if (error) throw error;
      const media = await createMediaDeliveryUrl(existing.avatar_public_id, "avatar", false);
      return { photoUrl: media.url };
    }

    const nextVersion = Number(existing?.avatar_version ?? 0) + 1;
    const nextPublicId = `srp/avatars/${auth.uid}_${nextVersion}_${crypto.randomUUID()}`;
    await uploadCloudinaryAuthenticatedImage(
      nextPublicId,
      new Blob([imageBuffer], { type: contentType }),
    );
    const cachedPhotoUrl = (await createMediaDeliveryUrl(nextPublicId, "avatar", false)).url;
    const { error } = await supabase.schema("app_api").rpc("backend_commit_user_avatar", {
      actor_uid: auth.uid,
      next_avatar_hash: avatarHash,
      next_avatar_public_id: nextPublicId,
      next_avatar_source_url: sourceUrl,
      next_cached_photo_url: cachedPhotoUrl,
      next_avatar_version: nextVersion,
      next_display_name: auth.name,
    });
    if (error) throw error;
    return { photoUrl: cachedPhotoUrl };
  }

  const uids = Array.isArray(payload.uids) ? payload.uids.map((uid) => asString(uid)).filter(Boolean).slice(0, 50) : [];
  const { data, error } = await supabase.schema("app_private").from("user_profiles")
    .select("uid,display_name,avatar_public_id,photo_url,profile_version").in("uid", uids);
  if (error) throw error;
  const profiles = await Promise.all((data ?? []).map(async (profile) => {
    const media = profile.avatar_public_id
      ? await createMediaDeliveryUrl(profile.avatar_public_id, "avatar", false)
      : null;
    return [
      profile.uid,
      {
        uid: profile.uid,
        displayName: profile.display_name,
        photoUrl: media?.url ?? profile.photo_url ?? null,
        version: profile.profile_version,
      },
    ] as const;
  }));
  return {
    profiles: Object.fromEntries(profiles),
  };
}
