import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server-auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const account = searchParams.get("account") ?? undefined;
  const emails = db.listEmails(account, 200);
  return NextResponse.json(emails);
}
