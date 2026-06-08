import { createHash } from "crypto";
import { cookies, headers } from "next/headers";
import { db } from "./db";

export function computeSessionToken(): string {
  return createHash("sha256")
    .update((process.env.ADMIN_PASSWORD ?? "") + "cc_session_v1")
    .digest("hex");
}

export async function isAdmin(): Promise<boolean> {
  const c = await cookies();
  return c.get("cc_session")?.value === computeSessionToken();
}

export async function hasShareAccess(businessId: string): Promise<boolean> {
  const h = await headers();
  const token = h.get("x-share-token");
  if (!token) return false;
  return db.verifyShareToken(token, businessId);
}

export async function canAccessBusiness(businessId: string): Promise<boolean> {
  return (await isAdmin()) || (await hasShareAccess(businessId));
}

// ─── Share-link password gate ────────────────────────────────────────────────
// Each business's share link is protected by a per-business team password:
//   `${business.name with no whitespace}team123!`
// e.g. "FLAIRteam123!", "MTRNMteam123!", "StealthLabsteam123!"
//
// On success the server sets a cookie `share_pw_${businessId}` whose value is
// sha256(ADMIN_PASSWORD + "share_pw_v1_" + businessId). Anyone with the cookie
// can render the shared view without re-entering the password (30-day expiry).

export function expectedSharePassword(businessName: string): string {
  return businessName.replace(/\s+/g, "") + "team123!";
}

export function computeShareAuthCookie(businessId: string): string {
  return createHash("sha256")
    .update((process.env.ADMIN_PASSWORD ?? "") + "share_pw_v1_" + businessId)
    .digest("hex");
}

export function sharePasswordCookieName(businessId: string): string {
  return `share_pw_${businessId}`;
}

export async function hasSharePasswordAuth(businessId: string): Promise<boolean> {
  const c = await cookies();
  const got = c.get(sharePasswordCookieName(businessId))?.value;
  if (!got) return false;
  return got === computeShareAuthCookie(businessId);
}
