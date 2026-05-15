import { NextResponse } from "next/server";
import { db, UPLOADS_DIR } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const bizId = db.getLeadBizId(Number(id));
  if (!bizId || !(await canAccessBusiness(bizId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(db.listLeadAttachments(Number(id)));
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const bizId = db.getLeadBizId(Number(id));
  if (!bizId || !(await canAccessBusiness(bizId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await req.json();
    if (!body?.url) return NextResponse.json({ error: "url required" }, { status: 400 });
    const attachment = db.addLeadLink(Number(id), body.url, body.label ?? null);
    return NextResponse.json(attachment);
  }

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "file required" }, { status: 400 });
    }
    const MAX_BYTES = 20 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 20 MB)" }, { status: 413 });
    }
    const ext = path.extname(file.name);
    const storedName = `${crypto.randomBytes(16).toString("hex")}${ext}`;
    const destPath = path.join(UPLOADS_DIR, storedName);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
    const attachment = db.addLeadFile(Number(id), file.name, storedName, file.size, file.type);
    return NextResponse.json(attachment);
  }

  return NextResponse.json({ error: "Unsupported content type" }, { status: 415 });
}
