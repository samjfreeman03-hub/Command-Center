import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";

/** DELETE /api/lead-categories/[id] — remove a category (un-tags its leads). */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const bizId = db.getLeadCategoryBizId(Number(id));
  if (!bizId || !(await canAccessBusiness(bizId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  db.deleteLeadCategory(Number(id));
  return NextResponse.json({ ok: true });
}
