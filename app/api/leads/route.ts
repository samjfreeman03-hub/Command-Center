import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.business_id || !body?.name) {
    return NextResponse.json({ error: "business_id and name required" }, { status: 400 });
  }
  if (!(await canAccessBusiness(body.business_id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const lead = db.createLead({
    business_id: body.business_id,
    name: body.name,
    company: body.company,
    contact_email: body.contact_email,
    stage: body.stage,
    value_cents: body.value_cents,
    next_action: body.next_action,
    next_action_date: body.next_action_date,
    notes: body.notes,
    category: body.category,
  });
  return NextResponse.json(lead);
}
