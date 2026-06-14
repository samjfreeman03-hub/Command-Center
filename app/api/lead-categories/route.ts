import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";
import { leadCategoriesEnabled } from "@/lib/pipeline-config";

/** GET /api/lead-categories?business_id= — list a business's custom lead categories. */
export async function GET(req: Request) {
  const businessId = new URL(req.url).searchParams.get("business_id");
  if (!businessId) {
    return NextResponse.json({ error: "business_id required" }, { status: 400 });
  }
  if (!(await canAccessBusiness(businessId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!leadCategoriesEnabled(businessId)) {
    return NextResponse.json({ error: "Lead categories are not enabled for this business" }, { status: 400 });
  }
  return NextResponse.json(db.listLeadCategories(businessId));
}

/** POST /api/lead-categories { business_id, name, color_index? } — create a category. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const businessId: string | undefined = body?.business_id;
  const name: string = (body?.name ?? "").trim();
  if (!businessId || !name) {
    return NextResponse.json({ error: "business_id and name required" }, { status: 400 });
  }
  if (!(await canAccessBusiness(businessId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!leadCategoriesEnabled(businessId)) {
    return NextResponse.json({ error: "Lead categories are not enabled for this business" }, { status: 400 });
  }
  try {
    const created = db.createLeadCategory(businessId, name, Number(body?.color_index) || 0);
    return NextResponse.json(created);
  } catch {
    // UNIQUE(business_id, name) violation → category already exists
    return NextResponse.json({ error: "A category with that name already exists" }, { status: 409 });
  }
}
