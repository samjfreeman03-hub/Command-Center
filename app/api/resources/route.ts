import { NextResponse } from "next/server";
import { db, UPLOADS_DIR } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get("business_id");
  if (!businessId) return NextResponse.json({ error: "business_id required" }, { status: 400 });
  if (!(await canAccessBusiness(businessId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(db.listBusinessResources(businessId));
}

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = await req.json();
    if (!body?.business_id || !body?.label || !body?.url) {
      return NextResponse.json({ error: "business_id, label, and url required" }, { status: 400 });
    }
    if (!(await canAccessBusiness(body.business_id))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const resource = db.addBusinessLink(body.business_id, body.label.trim(), body.url.trim());
    return NextResponse.json(resource);
  }

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const businessId = form.get("business_id") as string;
    const label = form.get("label") as string;
    const file = form.get("file");
    if (!businessId || !label || !file || typeof file === "string") {
      return NextResponse.json({ error: "business_id, label, and file required" }, { status: 400 });
    }
    if (!(await canAccessBusiness(businessId))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const MAX_BYTES = 20 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 20 MB)" }, { status: 413 });
    }
    const ext = path.extname(file.name);
    const storedName = `${crypto.randomBytes(16).toString("hex")}${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(path.join(UPLOADS_DIR, storedName), buffer);
    const resource = db.addBusinessFile(businessId, label.trim(), file.name, storedName, file.size, file.type);
    return NextResponse.json(resource);
  }

  return NextResponse.json({ error: "Unsupported content type" }, { status: 415 });
}
