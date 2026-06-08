import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server-auth";
import { db } from "@/lib/db";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const email = db.getEmail(Number(id));
  if (!email) return NextResponse.json({ error: "Not found" }, { status: 404 });
  db.markEmailRead(Number(id));
  return NextResponse.json({ ...email, is_read: true });
}
