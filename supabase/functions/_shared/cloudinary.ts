import { requireEnv } from "./env.ts";

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function toUrlSafeBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

async function sha1Hex(value: string) {
  return toHex(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value)));
}

async function sha1UrlSafeBase64(value: string) {
  return toUrlSafeBase64(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value)));
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
    `https://api.cloudinary.com/v1_1/${cloudName}/resources/image/authenticated/${encodedPublicId}`,
    {
      headers: { authorization: `Basic ${btoa(`${apiKey}:${apiSecret}`)}` },
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (!response.ok) throw new Error(`cloudinary-resource-lookup:${response.status}`);
  return await response.json() as Record<string, unknown>;
}

export async function createCloudinaryAuthenticatedImageUrl(publicId: string) {
  const cloudName = requireEnv("CLOUDINARY_CLOUD_NAME");
  const apiSecret = requireEnv("CLOUDINARY_API_SECRET");
  const deliveryPath = `${publicId}.webp`;
  const signature = (await sha1UrlSafeBase64(`${deliveryPath}${apiSecret}`)).slice(0, 8);
  const encodedPublicId = publicId.split("/").map((part) => encodeURIComponent(part)).join("/");
  return `https://res.cloudinary.com/${cloudName}/image/authenticated/s--${signature}--/${encodedPublicId}.webp`;
}

export async function createCloudinaryExpiringImageUrl(publicId: string, expiresAt: Date) {
  const cloudName = requireEnv("CLOUDINARY_CLOUD_NAME");
  const apiKey = requireEnv("CLOUDINARY_API_KEY");
  const params = {
    expires_at: Math.floor(expiresAt.getTime() / 1000).toString(),
    format: "webp",
    public_id: publicId,
    timestamp: Math.floor(Date.now() / 1000).toString(),
    type: "authenticated",
  };
  const query = new URLSearchParams({
    ...params,
    api_key: apiKey,
    signature: await signCloudinaryParams(params),
  });
  return `https://api.cloudinary.com/v1_1/${cloudName}/image/download?${query.toString()}`;
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
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
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
    `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
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
