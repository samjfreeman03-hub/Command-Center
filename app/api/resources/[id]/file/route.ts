import { NextResponse } from "next/server";
import { db, UPLOADS_DIR } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";
import path from "node:path";
import fs from "node:fs";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const bizId = db.getResourceBizId(Number(id));
  if (!bizId || !(await canAccessBusiness(bizId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const resource = db.getResource(Number(id));
  if (!resource || resource.type !== "file" || !resource.stored_name) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const filePath = path.join(UPLOADS_DIR, resource.stored_name);
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }
  const buffer = fs.readFileSync(filePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": resource.mime_type ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${resource.filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
