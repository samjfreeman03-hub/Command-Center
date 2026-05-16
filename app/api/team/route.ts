import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const businessId = searchParams.get("business_id");
  if (!businessId) return NextResponse.json({ error: "business_id required" }, { status: 400 });
  if (!(await canAccessBusiness(businessId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(db.listTeamMembers(businessId));
}

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.business_id || !body?.name) {
    return NextResponse.json({ error: "business_id and name required" }, { status: 400 });
  }
  if (!(await canAccessBusiness(body.business_id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const member = db.createTeamMember({
    business_id: body.business_id,
    name: body.name,
    title: body.title,
  });
  return NextResponse.json(member);
}
