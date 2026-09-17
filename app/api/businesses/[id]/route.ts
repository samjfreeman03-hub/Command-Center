import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getBusiness } from "@/lib/businesses";
import { isAdmin } from "@/lib/server-auth";

/** PATCH { tagline?: string, hidden?: boolean } — admin only. */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!getBusiness(id)) {
    return NextResponse.json({ error: "Unknown business" }, { status: 404 });
  }
  const body = await req.json().catch(() => ({}));
  const hasTagline = typeof body?.tagline === "string" && body.tagline.trim();
  const hasHidden = typeof body?.hidden === "boolean";
  if (!hasTagline && !hasHidden) {
    return NextResponse.json({ error: "tagline or hidden required" }, { status: 400 });
  }
  if (hasTagline) db.updateBusinessTagline(id, body.tagline);
  if (hasHidden) db.setBusinessHidden(id, body.hidden);
  return NextResponse.json({ ok: true });
}
