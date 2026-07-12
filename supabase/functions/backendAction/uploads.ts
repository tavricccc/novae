import {
  createCloudinaryAuthenticatedImageUrl,
  createCloudinaryExpiringImageUrl,
  createCloudinaryUploadSignature,
  getCloudinaryAuthenticatedImageMetadata,
  verifyCloudinaryUploadResponseSignature,
} from "../_shared/cloudinary.ts";
import { requireEnv } from "../_shared/env.ts";
import { asString } from "../_shared/http.ts";
import { RATE_LIMITS } from "../_shared/rate-limits.ts";
import { claimFixedWindowRateLimit } from "../_shared/upstash-rate-limit.ts";
import type { AuthContext, BackendSupabase, JsonRecord } from "./types.ts";
import { asNumber, taipeiDayWindow } from "./utils.ts";
import { canReadIssue } from "./issue-shared.ts";
import { issueIsPrivateToOwner, issueRequiresReview } from "../_shared/issue-categories.ts";

const MARKDOWN_UPLOAD_ID_PATTERN = /srp-upload:\/\/([0-9a-fA-F-]{36})/gu;
const MARKDOWN_IMAGE_SOURCE_PATTERN = /!\[[^\]]*\]\((\S+?)(?:\s+["'][^"']*["'])?\)/gu;
const PRIVATE_URL_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const PRIVATE_URL_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const PRIVATE_DELIVERY_SCOPE = "private-v2";
const PUBLIC_URL_CACHE_MS = 365 * 24 * 60 * 60 * 1000;
const PUBLIC_DELIVERY_SCOPE = "public-v2";

function extractMarkdownUploadIds(content: string) {
  return [...new Set(
    [...content.matchAll(MARKDOWN_UPLOAD_ID_PATTERN)]
      .map((match) => match[1])
      .filter(Boolean),
  )];
}

function assertOnlyManagedMarkdownImages(content: string) {
  const sources = [...content.matchAll(MARKDOWN_IMAGE_SOURCE_PATTERN)].map((match) => match[1]);
  if (sources.some((source) => !source?.startsWith("srp-upload://"))) {
    throw new Error("external-images-not-allowed");
  }
}

async function assertMarkdownUploadsAttachable(
  supabase: BackendSupabase,
  ownerUid: string,
  uploadIds: string[],
  targetType: "announcement" | "announcement_comment" | "comment" | "issue",
  targetId: string | null,
) {
  if (uploadIds.length === 0) return;
  const maxImages = targetType === "issue"
    ? RATE_LIMITS.imageUploads.issueMaxImages
    : targetType === "announcement"
      ? RATE_LIMITS.imageUploads.announcementMaxImages
      : RATE_LIMITS.imageUploads.commentMaxImages;
  if (uploadIds.length > maxImages) throw new Error("too-many-images");

  const { data: attachable, error: attachableError } = await supabase.schema("app_private")
    .from("uploads")
    .select("id,owner_uid,status,attached_target_type,attached_target_id")
    .in("id", uploadIds);
  if (attachableError) throw attachableError;
  const validIds = new Set((attachable ?? []).filter((upload) =>
    (upload.status === "ready" || upload.status === "attached")
    && (targetId
      ? (
        (upload.attached_target_type === targetType && upload.attached_target_id === targetId)
        || (upload.owner_uid === ownerUid && !upload.attached_target_id)
      )
      : upload.owner_uid === ownerUid && !upload.attached_target_id)
  ).map((upload) => upload.id));
  if (validIds.size !== uploadIds.length) throw new Error("upload-attachment-invalid");
}

function issueDeliveryAccess(
  issue: JsonRecord | undefined,
  auth: AuthContext,
) {
  if (!issue) return { allowed: false, privateDelivery: true };
  return {
    allowed: canReadIssue(issue, auth),
    privateDelivery: issueIsPrivateToOwner(asString(issue.category))
      || (issueRequiresReview(asString(issue.category))
        && ["under-review", "review-rejected"].includes(asString(issue.status))),
  };
}

async function resolveUploadAccessBatch(
  uploads: JsonRecord[],
  auth: AuthContext,
  supabase: BackendSupabase,
) {
  const issueIds = new Set<string>();
  const commentIds = new Set<string>();
  for (const upload of uploads) {
    const type = asString(upload.attached_target_type);
    const id = asString(upload.attached_target_id);
    if (type === "issue" && id) issueIds.add(id);
    if (type === "comment" && id) commentIds.add(id);
  }
  const commentToIssue = new Map<string, string>();
  if (commentIds.size > 0) {
    const { data, error } = await supabase.schema("app_private").from("comments")
      .select("id,issue_id").in("id", [...commentIds]);
    if (error) throw error;
    for (const comment of data ?? []) {
      commentToIssue.set(String(comment.id), String(comment.issue_id));
      issueIds.add(String(comment.issue_id));
    }
  }
  const issues = new Map<string, JsonRecord>();
  if (issueIds.size > 0) {
    const { data, error } = await supabase.schema("app_private").from("issues")
      .select("id,category,status,author_uid").in("id", [...issueIds]);
    if (error) throw error;
    for (const issue of data ?? []) issues.set(String(issue.id), issue as JsonRecord);
  }
  return new Map(uploads.map((upload) => {
    const targetType = asString(upload.attached_target_type);
    const targetId = asString(upload.attached_target_id);
    if (!targetType || !targetId) {
      return [asString(upload.id), { allowed: asString(upload.owner_uid) === auth.uid, privateDelivery: true }];
    }
    if (targetType === "issue") {
      return [asString(upload.id), issueDeliveryAccess(issues.get(targetId), auth)];
    }
    if (targetType === "comment") {
      return [asString(upload.id), issueDeliveryAccess(issues.get(commentToIssue.get(targetId) ?? ""), auth)];
    }
    if (targetType === "announcement" || targetType === "announcement_comment") {
      return [asString(upload.id), { allowed: true, privateDelivery: false }];
    }
    return [asString(upload.id), { allowed: false, privateDelivery: true }];
  }));
}

export function isUploadAction(action: string) {
  return action === "createImageUploadSessions"
    || action === "finalizeImageUploads"
    || action === "deleteUploadedImages"
    || action === "resolveUploadImageUrls";
}

export async function validateMarkdownUploadsBeforeCreate(
  supabase: BackendSupabase,
  ownerUid: string,
  content: string,
  targetType: "announcement" | "announcement_comment" | "comment" | "issue",
) {
  assertOnlyManagedMarkdownImages(content);
  await assertMarkdownUploadsAttachable(
    supabase,
    ownerUid,
    extractMarkdownUploadIds(content),
    targetType,
    null,
  );
}

export async function validateMarkdownUploadsBeforeUpdate(
  supabase: BackendSupabase,
  ownerUid: string,
  content: string,
  targetType: "announcement" | "announcement_comment" | "comment" | "issue",
  targetId: string,
) {
  assertOnlyManagedMarkdownImages(content);
  await assertMarkdownUploadsAttachable(
    supabase,
    ownerUid,
    extractMarkdownUploadIds(content),
    targetType,
    targetId,
  );
}

export async function handleUploadAction(
  action: string,
  payload: JsonRecord,
  auth: AuthContext,
  supabase: BackendSupabase,
): Promise<JsonRecord> {
  if (action === "createImageUploadSessions") {
    const images = Array.isArray(payload.images)
      ? payload.images.slice(0, RATE_LIMITS.imageUploads.issueMaxImages).map((image) => image as JsonRecord)
      : [];
    if (images.length === 0) throw new Error("missing-images");
    const sessions = [];
    for (const image of images) {
      sessions.push(await handleUploadAction("internal:create-upload-session", image, auth, supabase));
    }
    return { sessions };
  }

  if (action === "finalizeImageUploads") {
    const uploads = Array.isArray(payload.uploads)
      ? payload.uploads.slice(0, RATE_LIMITS.imageUploads.issueMaxImages).map((upload) => upload as JsonRecord)
      : [];
    if (uploads.length === 0) throw new Error("missing-uploads");
    const finalized = [];
    for (const upload of uploads) {
      finalized.push(await handleUploadAction("internal:finalize-upload", upload, auth, supabase));
    }
    return { uploads: finalized };
  }

  if (action === "deleteUploadedImages") {
    const storagePaths = Array.isArray(payload.storagePaths)
      ? [...new Set(payload.storagePaths.map((path) => asString(path)).filter(Boolean))].slice(0, 50)
      : [];
    for (const storagePath of storagePaths) {
      await handleUploadAction("internal:delete-upload", { storagePath }, auth, supabase);
    }
    return { deleted: storagePaths.length, success: true };
  }

  if (action === "internal:create-upload-session") {
    await claimFixedWindowRateLimit(
      auth.uid,
      "image_upload.create",
      taipeiDayWindow(),
      RATE_LIMITS.imageUploadDaily,
    );
    const uploadId = crypto.randomUUID();
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = `srp/${auth.uid}`;
    const publicId = uploadId;
    const notificationUrl = `${requireEnv("SUPABASE_URL").replace(/\/+$/u, "")}/functions/v1/cloudinaryWebhook`;
    const params = {
      allowed_formats: "webp",
      folder,
      notification_url: notificationUrl,
      overwrite: "false",
      public_id: publicId,
      timestamp: String(timestamp),
      type: "authenticated",
    };
    const { error } = await supabase.schema("app_private").from("uploads").insert({
      id: uploadId,
      owner_uid: auth.uid,
      cloudinary_public_id: `${folder}/${publicId}`,
      status: "pending",
      visibility: "authenticated",
      width: Math.round(asNumber(payload.width, 0)),
      height: Math.round(asNumber(payload.height, 0)),
      size_bytes: Math.round(asNumber(payload.size, 0)),
      content_type: asString(payload.contentType, "image/webp"),
    });
    if (error) throw error;
    return {
      apiKey: requireEnv("CLOUDINARY_API_KEY"),
      allowedFormats: params.allowed_formats,
      cloudName: requireEnv("CLOUDINARY_CLOUD_NAME"),
      folder,
      notificationUrl,
      overwrite: params.overwrite,
      publicId,
      signature: await createCloudinaryUploadSignature(params),
      timestamp,
      type: params.type,
      uploadId,
    };
  }

  if (action === "internal:finalize-upload") {
    const uploadId = asString(payload.uploadId);
    const { data: upload, error: uploadError } = await supabase.schema("app_private").from("uploads")
      .select("id,owner_uid,cloudinary_public_id,status,width,height,size_bytes")
      .eq("id", uploadId)
      .eq("owner_uid", auth.uid)
      .maybeSingle();
    if (uploadError) throw uploadError;
    if (!upload) throw new Error("not-found");
    if (upload.status === "failed") throw new Error("upload-validation-failed");

    let data = upload as JsonRecord;
    if (upload.status !== "ready") {
      const responsePublicId = asString(payload.publicId);
      const responseSignature = asString(payload.signature);
      const responseVersion = Math.round(asNumber(payload.version, 0));
      if (
        responsePublicId !== upload.cloudinary_public_id
        || !await verifyCloudinaryUploadResponseSignature(responsePublicId, responseVersion, responseSignature)
      ) throw new Error("upload-response-invalid");

      const metadata = await getCloudinaryAuthenticatedImageMetadata(responsePublicId);
      const bytes = Math.round(asNumber(metadata.bytes, 0));
      const width = Math.round(asNumber(metadata.width, 0));
      const height = Math.round(asNumber(metadata.height, 0));
      const validAsset = asString(metadata.format).toLowerCase() === "webp"
        && asString(metadata.resource_type) === "image"
        && asString(metadata.type) === "authenticated"
        && bytes > 0
        && bytes <= RATE_LIMITS.imageCompression.maxUploadBytes
        && width > 0
        && height > 0
        && width <= RATE_LIMITS.imageCompression.maxDimension
        && height <= RATE_LIMITS.imageCompression.maxDimension;
      if (!validAsset) throw new Error("upload-validation-failed");

      const { data: finalized, error: finalizeError } = await supabase.schema("app_private").from("uploads")
        .update({
          height,
          size_bytes: bytes,
          status: "ready",
          updated_at: new Date().toISOString(),
          width,
        })
        .eq("id", uploadId)
        .eq("owner_uid", auth.uid)
        .eq("status", "pending")
        .select("id,cloudinary_public_id,height,width")
        .maybeSingle();
      if (finalizeError) throw finalizeError;
      if (finalized) {
        data = finalized as JsonRecord;
      } else {
        const { data: webhookFinalized, error: webhookError } = await supabase.schema("app_private")
          .from("uploads")
          .select("id,cloudinary_public_id,height,width")
          .eq("id", uploadId)
          .eq("owner_uid", auth.uid)
          .eq("status", "ready")
          .single();
        if (webhookError) throw webhookError;
        data = webhookFinalized as JsonRecord;
      }
    }
    return {
      height: Number(data.height ?? 0),
      storagePath: data.cloudinary_public_id,
      uploadId: data.id,
      width: Number(data.width ?? 0),
    };
  }

  if (action === "internal:delete-upload") {
    const storagePath = asString(payload.storagePath);
    const uploadId = asString(payload.uploadId);
    let query = supabase.schema("app_private").from("uploads")
      .select("id,cloudinary_public_id").eq("owner_uid", auth.uid);
    query = uploadId ? query.eq("id", uploadId) : query.eq("cloudinary_public_id", storagePath);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (data) {
      const { error: jobError } = await supabase.schema("app_private").from("deletion_jobs").insert({
        target_type: "upload",
        target_id: data.id,
        cloudinary_public_id: data.cloudinary_public_id,
      });
      if (jobError) throw jobError;
      const { error: deleteError } = await supabase.schema("app_private").from("uploads").delete().eq("id", data.id);
      if (deleteError) throw deleteError;
    }
    return { success: true };
  }

  const uploadIds = Array.isArray(payload.uploadIds) ? payload.uploadIds.map((id) => asString(id)).filter(Boolean).slice(0, 50) : [];
  const { data, error } = await supabase.schema("app_private").from("uploads")
    .select("id,owner_uid,cloudinary_public_id,attached_target_type,attached_target_id,delivery_url,delivery_url_expires_at,delivery_url_scope")
    .in("id", uploadIds)
    .in("status", ["ready", "attached"]);
  if (error) throw error;
  const accessByUploadId = await resolveUploadAccessBatch((data ?? []) as JsonRecord[], auth, supabase);
  const resolved = await Promise.all((data ?? []).map(async (upload) => {
    const access = accessByUploadId.get(upload.id) ?? { allowed: false, privateDelivery: true };
    if (!access.allowed || !upload.cloudinary_public_id) return null;
    if (!access.privateDelivery) {
      const cachedExpiresAtMs = Date.parse(upload.delivery_url_expires_at ?? "");
      if (upload.delivery_url_scope === PUBLIC_DELIVERY_SCOPE && upload.delivery_url && cachedExpiresAtMs > Date.now() + PRIVATE_URL_REFRESH_BUFFER_MS) {
        return { expiresAtMs: cachedExpiresAtMs, id: upload.id, url: upload.delivery_url };
      }
      const expiresAt = new Date(Date.now() + PUBLIC_URL_CACHE_MS);
      const url = await createCloudinaryAuthenticatedImageUrl(upload.cloudinary_public_id);
      const { error: cacheError } = await supabase.schema("app_private").from("uploads").update({
        delivery_url: url,
        delivery_url_expires_at: expiresAt.toISOString(),
        delivery_url_scope: PUBLIC_DELIVERY_SCOPE,
      }).eq("id", upload.id);
      if (cacheError) throw cacheError;
      return {
        expiresAtMs: expiresAt.getTime(),
        id: upload.id,
        url,
      };
    }
    const cachedExpiresAtMs = Date.parse(upload.delivery_url_expires_at ?? "");
    if (
      upload.delivery_url_scope === PRIVATE_DELIVERY_SCOPE
      && upload.delivery_url
      && Number.isFinite(cachedExpiresAtMs)
      && cachedExpiresAtMs > Date.now() + PRIVATE_URL_REFRESH_BUFFER_MS
    ) {
      return { expiresAtMs: cachedExpiresAtMs, id: upload.id, url: upload.delivery_url };
    }
    const expiresAt = new Date(Date.now() + PRIVATE_URL_LIFETIME_MS);
    const url = await createCloudinaryExpiringImageUrl(upload.cloudinary_public_id, expiresAt);
    const { error: cacheError } = await supabase.schema("app_private").from("uploads").update({
      delivery_url: url,
      delivery_url_expires_at: expiresAt.toISOString(),
      delivery_url_scope: PRIVATE_DELIVERY_SCOPE,
    }).eq("id", upload.id);
    if (cacheError) throw cacheError;
    return { expiresAtMs: expiresAt.getTime(), id: upload.id, url };
  }));
  const available = resolved.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const expiresAtMs = available.length
    ? Math.min(...available.map((entry) => entry.expiresAtMs))
    : Date.now();
  return {
    errors: Object.fromEntries(uploadIds.filter((id) => !available.some((entry) => entry.id === id)).map((id) => [id, "not-found"])),
    expiresAtByUploadId: Object.fromEntries(available.map((entry) => [entry.id, entry.expiresAtMs])),
    expiresAtMs,
    urls: Object.fromEntries(available.map((entry) => [entry.id, entry.url])),
  };
}
