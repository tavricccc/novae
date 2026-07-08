import { requireEnv } from "./env.ts";
import { asRecord, asString } from "./http.ts";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@6.1.3";

export interface FirebaseAuthContext {
  customAttributes: string;
  email: string;
  name: string;
  photoUrl: string | null;
  uid: string;
}

function decodeJwtPayload(token: string) {
  try {
    const payload = token.split(".")[1] ?? "";
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)))) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function requireAuthHeader(request: Request) {
  const header = request.headers.get("Authorization") ?? "";
  const match = /^Bearer\s+(.+)$/iu.exec(header);
  if (!match) throw new Error("unauthenticated");
  return match[1];
}

export async function lookupFirebaseUser(idToken: string) {
  const firebaseApiKey = requireEnv("FIREBASE_WEB_API_KEY");
  const lookupResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${firebaseApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );
  if (!lookupResponse.ok) {
    throw new Error("unauthenticated");
  }

  const lookup = asRecord(await lookupResponse.json());
  const users = Array.isArray(lookup.users) ? lookup.users : [];
  return asRecord(users[0]);
}

export async function requireEligibleFirebaseUser(request: Request): Promise<FirebaseAuthContext> {
  const idToken = requireAuthHeader(request);
  const claims = decodeJwtPayload(idToken);
  const firebaseUser = await lookupFirebaseUser(idToken);
  const uid = asString(firebaseUser.localId, asString(claims.sub));
  if (!uid) throw new Error("unauthenticated");

  const email = asString(firebaseUser.email, asString(claims.email)).toLowerCase();
  const allowedDomain = requireEnv("ALLOWED_DOMAIN").toLowerCase();
  if (firebaseUser.emailVerified !== true || !email.endsWith(`@${allowedDomain}`)) {
    throw new Error("permission-denied");
  }

  return {
    customAttributes: asString(firebaseUser.customAttributes, "{}"),
    email,
    name: asString(firebaseUser.displayName, asString(claims.name, email || "使用者")),
    photoUrl: asString(firebaseUser.photoUrl, asString(claims.picture)) || null,
    uid,
  };
}

const firebaseKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

export async function requireVerifiedFirebaseUser(request: Request): Promise<FirebaseAuthContext> {
  const idToken = requireAuthHeader(request);
  const projectId = requireEnv("FIREBASE_PROJECT_ID");
  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(idToken, firebaseKeys, {
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`,
    });
    payload = verified.payload as Record<string, unknown>;
  } catch {
    throw new Error("unauthenticated");
  }
  const uid = asString(payload.sub);
  const email = asString(payload.email).toLowerCase();
  const allowedDomain = requireEnv("ALLOWED_DOMAIN").toLowerCase();
  if (!uid || payload.email_verified !== true || !email.endsWith(`@${allowedDomain}`)) {
    throw new Error("permission-denied");
  }
  return {
    customAttributes: "{}",
    email,
    name: asString(payload.name, email || "使用者"),
    photoUrl: asString(payload.picture) || null,
    uid,
  };
}
