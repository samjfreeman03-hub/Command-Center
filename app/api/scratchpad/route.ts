import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/server-auth";

const KEY = "scratchpad";
const MAX_LEN = 100_000; // ~100KB of text is far beyond any real scratchpad

/** GET /api/scratchpad — current scratchpad text. Admin only (dashboard feature). */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ value: db.getAppState(KEY) ?? "" });
}

/** PUT /api/scratchpad { value } — replace the scratchpad text. */
export async function PUT(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (typeof body?.value !== "string") {
    return NextResponse.json({ error: "value (string) required" }, { status: 400 });
  }
  if (body.value.length > MAX_LEN) {
    return NextResponse.json({ error: "Scratchpad too large" }, { status: 413 });
  }
  db.setAppState(KEY, body.value);
  return NextResponse.json({ ok: true });
}
