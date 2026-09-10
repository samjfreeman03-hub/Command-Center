import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";

/** GET /api/initiatives?business_id= — list a business's initiatives. */
export async function GET(req: Request) {
  const businessId = new URL(req.url).searchParams.get("business_id");
  if (!businessId) return NextResponse.json({ error: "business_id required" }, { status: 400 });
  if (!(await canAccessBusiness(businessId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(db.listInitiatives(businessId));
}

/** POST /api/initiatives — create an initiative. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (!body?.business_id || !body?.title?.trim()) {
    return NextResponse.json({ error: "business_id and title required" }, { status: 400 });
  }
  if (!(await canAccessBusiness(body.business_id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const initiative = db.createInitiative({
    business_id: body.business_id,
    title: body.title,
    kind: body.kind,
    horizon: body.horizon,
    status: body.status,
    next_step: body.next_step || null,
    target_date: body.target_date || null,
    notes: body.notes || null,
  });
  return NextResponse.json(initiative);
}
