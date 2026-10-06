import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/server-auth";
import { cleanIou } from "@/lib/ious";

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(db.listIous());
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const clean = cleanIou(body);
  if (!clean.direction || !clean.party) {
    return NextResponse.json({ error: "direction and party required" }, { status: 400 });
  }
  return NextResponse.json(db.createIou({ ...clean, direction: clean.direction }));
}
