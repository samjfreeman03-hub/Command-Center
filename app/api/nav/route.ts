import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdmin } from "@/lib/server-auth";

/** GET /api/nav: live sidebar data (open todo count per business). Admin only. */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const todoCounts: Record<string, number> = {};
  for (const row of db.todoCounts()) todoCounts[row.business_id] = row.open_count;
  return NextResponse.json({ todoCounts });
}
