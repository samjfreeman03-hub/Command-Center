import { NextResponse } from "next/server";
import { db, UPLOADS_DIR } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";
import path from "node:path";
import fs from "node:fs";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const bizId = db.getAttachmentBizId(Number(id));
  if (!bizId || !(await canAccessBusiness(bizId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { stored_name } = db.deleteAttachment(Number(id));
  if (stored_name) {
    const filePath = path.join(UPLOADS_DIR, stored_name);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  return NextResponse.json({ ok: true });
}
