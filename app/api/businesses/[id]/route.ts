import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/server-auth";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const { tagline } = await req.json();
  if (typeof tagline !== "string" || !tagline.trim()) {
    return NextResponse.json({ error: "tagline required" }, { status: 400 });
  }
  db.updateBusinessTagline(id, tagline);
  return NextResponse.json({ ok: true });
}
