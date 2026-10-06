import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/server-auth";
import { cleanIou } from "@/lib/ious";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!db.getIou(Number(id))) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if ("status" in body) patch.status = body.status === "settled" ? "settled" : "open";
  const fields = ["direction", "party", "business_id", "amount_cents", "note", "due_date"];
  if (fields.some((f) => f in body)) {
    const clean = cleanIou(body);
    for (const f of fields) if (f in body) patch[f] = (clean as Record<string, unknown>)[f];
    if ("direction" in body && !clean.direction) delete patch.direction;
    if ("party" in body && !clean.party) delete patch.party;
  }
  return NextResponse.json(db.updateIou(Number(id), patch));
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  db.deleteIou(Number(id));
  return NextResponse.json({ ok: true });
}
