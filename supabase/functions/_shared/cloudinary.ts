import { optionalEnv, requireEnv } from "./env.ts";

export const CLOUDINARY_IMAGE_UPLOAD_PRESET = "srp-secure-images";
let uploadPresetVerifiedUntil = 0;

function cloudinaryApiBaseUrl() {
  return optionalEnv("CLOUDINARY_API_BASE_URL").replace(/\/+$/u, "") || "https://api.cloudinary.com";
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function sha1Hex(value: string) {
  return toHex(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value)));
}

export async function sha256Hex(buffer: ArrayBuffer) {
  return toHex(await crypto.subtle.digest("SHA-256", buffer));
}

async function signCloudinaryParams(params: Record<string, string>) {
  const apiSecret = requireEnv("CLOUDINARY_API_SECRET");
  const payload = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return sha1Hex(`${payload}${apiSecret}`);
}

export async function createCloudinaryUploadSignature(params: Record<string, string>) {
  return signCloudinaryParams(params);
}

export async function verifyCloudinaryUploadResponseSignature(
  publicId: string,
  version: number,
  signature: string,
) {
  if (!publicId || !Number.isSafeInteger(version) || version <= 0 || !/^[a-f0-9]{40}$/iu.test(signature)) {
    return false;
  }
  const expected = await signCloudinaryParams({
    public_id: publicId,
    version: String(version),
  });
  if (expected.length !== signature.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  }
  return difference === 0;
}

export async function getCloudinaryAuthenticatedImageMetadata(publicId: string) {
  const cloudName = requireEnv("CLOUDINARY_CLOUD_NAME");
  const apiKey = requireEnv("CLOUDINARY_API_KEY");
  const apiSecret = requireEnv("CLOUDINARY_API_SECRET");
  const encodedPublicId = publicId.split("/").map((part) => encodeURIComponent(part)).join("/");
  const response = await fetch(
    `${cloudinaryApiBaseUrl()}/v1_1/${cloudName}/resources/image/authenticated/${encodedPublicId}`,
    {
      headers: { authorization: `Basic ${btoa(`${apiKey}:${apiSecret}`)}` },
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!response.ok) throw new Error(`cloudinary-resource-lookup:${response.status}`);
  return await response.json() as Record<string, unknown>;
}

function cloudinaryAdminAuthorization() {
  return `Basic ${btoa(`${requireEnv("CLOUDINARY_API_KEY")}:${requireEnv("CLOUDINARY_API_SECRET")}`)}`;
}

export async function ensureCloudinaryImageUploadPreset(maxFileSize: number) {
  if (uploadPresetVerifiedUntil > Date.now()) return;
  const cloudName = requireEnv("CLOUDINARY_CLOUD_NAME");
  const preset = new URLSearchParams({
    allowed_formats: "webp",
    max_file_size: String(maxFileSize),
    overwrite: "false",
    transformation: "",
    type: "authenticated",
    unsigned: "false",
  });
  const headers = {
    authorization: cloudinaryAdminAuthorization(),
    "content-type": "application/x-www-form-urlencoded",
  };
  const update = await fetch(
    `${cloudinaryApiBaseUrl()}/v1_1/${cloudName}/upload_presets/${CLOUDINARY_IMAGE_UPLOAD_PRESET}`,
    {
      body: preset,
      headers,
      method: "PUT",
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (update.ok) {
    uploadPresetVerifiedUntil = Date.now() + 60 * 60 * 1000;
    return;
  }
  if (update.status !== 404) {
    throw new Error(`cloudinary-upload-preset-update:${update.status}:${await update.text()}`);
  }

  preset.set("name", CLOUDINARY_IMAGE_UPLOAD_PRESET);
  const create = await fetch(`${cloudinaryApiBaseUrl()}/v1_1/${cloudName}/upload_presets`, {
    body: preset,
    headers,
    method: "POST",
    signal: AbortSignal.timeout(10_000),
  });
  if (!create.ok && create.status !== 409) {
    throw new Error(`cloudinary-upload-preset-create:${create.status}:${await create.text()}`);
  }
  uploadPresetVerifiedUntil = Date.now() + 60 * 60 * 1000;
}

export async function uploadCloudinaryAuthenticatedImage(publicId: string, source: string | Blob) {
  const cloudName = requireEnv("CLOUDINARY_CLOUD_NAME");
  const apiKey = requireEnv("CLOUDINARY_API_KEY");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const params = {
    allowed_formats: "jpg,jpeg,png,webp",
    format: "webp",
    overwrite: "false",
    public_id: publicId,
    timestamp,
    type: "authenticated",
  };
  const body = new FormData();
  body.set("file", source);
  body.set("api_key", apiKey);
  for (const [key, value] of Object.entries(params)) {
    body.set(key, value);
  }
  body.set("signature", await signCloudinaryParams(params));

  const response = await fetch(
    `${cloudinaryApiBaseUrl()}/v1_1/${cloudName}/image/upload`,
    { method: "POST", body, signal: AbortSignal.timeout(20_000) },
  );
  if (!response.ok) {
    throw new Error(`Cloudinary avatar upload failed: ${response.status} ${await response.text()}`);
  }
}

export async function deleteCloudinaryAsset(publicId: string) {
  const cloudName = requireEnv("CLOUDINARY_CLOUD_NAME");
  const apiKey = requireEnv("CLOUDINARY_API_KEY");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const params = {
    invalidate: "true",
    public_id: publicId,
    timestamp,
    type: "authenticated",
  };
  const body = new URLSearchParams({
    ...params,
    api_key: apiKey,
    signature: await signCloudinaryParams(params),
  });
  const response = await fetch(
    `${cloudinaryApiBaseUrl()}/v1_1/${cloudName}/image/destroy`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Cloudinary delete failed: ${response.status} ${await response.text()}`);
  }

  const result = await response.json();
  if (result.result !== "ok" && result.result !== "not found") {
    throw new Error(`Cloudinary delete returned ${String(result.result ?? "unknown")}`);
  }
}
