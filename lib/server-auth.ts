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
