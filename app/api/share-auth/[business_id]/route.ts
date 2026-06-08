import { NextResponse } from "next/server";
import { BUSINESSES } from "@/lib/businesses";
import {
  expectedSharePassword,
  computeShareAuthCookie,
  sharePasswordCookieName,
} from "@/lib/server-auth";

/**
 * POST /api/share-auth/[business_id]
 * Body: { password: string }
 *
 * Validates the team password for a business's share link.
 * On success: sets a 30-day cookie that the /s/[token] page reads to skip the gate.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ business_id: string }> }
) {
  const { business_id } = await ctx.params;
  const biz = BUSINESSES.find((b) => b.id === business_id);
  if (!biz) {
    return NextResponse.json({ error: "Unknown business" }, { status: 404 });
  }

  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const submitted = (body.password ?? "").trim();
  const expected = expectedSharePassword(biz.name);
  if (submitted !== expected) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(sharePasswordCookieName(business_id), computeShareAuthCookie(business_id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });
  return res;
}

/** DELETE for completeness — sign out of a share link. */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ business_id: string }> }
) {
  const { business_id } = await ctx.params;
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(sharePasswordCookieName(business_id));
  return res;
}
