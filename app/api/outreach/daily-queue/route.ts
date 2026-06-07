import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const businessId = url.searchParams.get("business_id");
  const limit = Number(url.searchParams.get("limit") ?? "10");
  if (!businessId) return NextResponse.json({ error: "business_id required" }, { status: 400 });
  if (!(await canAccessBusiness(businessId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const queue = db.listDailyQueue({ businessId, limit });
  return NextResponse.json(queue);
}
