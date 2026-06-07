import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";
import type { OutreachStatus } from "@/lib/types";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const businessId = url.searchParams.get("business_id");
  const status = url.searchParams.get("status") as OutreachStatus | null;
  if (!businessId) return NextResponse.json({ error: "business_id required" }, { status: 400 });
  if (!(await canAccessBusiness(businessId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const targets = db.listOutreach({ businessId, status: status ?? undefined });
  return NextResponse.json(targets);
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.business_id || !body?.brand_name || !body?.person_name) {
    return NextResponse.json({ error: "business_id, brand_name, person_name required" }, { status: 400 });
  }
  if (!(await canAccessBusiness(body.business_id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const target = db.createOutreach({
    business_id: body.business_id,
    brand_name: body.brand_name,
    person_name: body.person_name,
    brand_category: body.brand_category,
    brand_size: body.brand_size,
    person_title: body.person_title,
    linkedin_url: body.linkedin_url,
    source: body.source,
    notes: body.notes,
  });
  return NextResponse.json(target);
}
