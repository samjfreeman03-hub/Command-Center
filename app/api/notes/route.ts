import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";

export async function POST(req: Request) {
  const body = await req.json();
  if (!body?.business_id || !body?.title) {
    return NextResponse.json({ error: "business_id and title required" }, { status: 400 });
  }
  if (!(await canAccessBusiness(body.business_id))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const note = db.createNote({
    business_id: body.business_id,
    title: body.title,
    content: body.content ?? "",
  });
  return NextResponse.json(note);
}
