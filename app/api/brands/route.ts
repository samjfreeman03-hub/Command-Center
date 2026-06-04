import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get("business_id");
  if (!businessId) return NextResponse.json({ error: "business_id required" }, { status: 400 });
  if (!(await canAccessBusiness(businessId))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(db.listBrandContacts(businessId));
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.business_id || !body?.brand_name) {
    return NextResponse.json({ error: "business_id and brand_name required" }, { status: 400 });
  }
  if (!(await canAccessBusiness(body.business_id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const brand = db.createBrandContact({
    business_id: body.business_id,
    brand_name: body.brand_name,
    contact_name: body.contact_name,
    contact_title: body.contact_title,
    email: body.email,
    phone: body.phone,
    website: body.website,
    status: body.status,
    notes: body.notes,
  });
  return NextResponse.json(brand);
}
