import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const bizId = db.getLeadBizId(Number(id));
  if (!bizId || !(await canAccessBusiness(bizId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (db.leadIsMirrored(Number(id))) {
    return NextResponse.json(
      { error: "Managed in FLAIR OS. Changes arrive with write-back (phase 2).", code: "flair_os_managed" },
      { status: 409 }
    );
  }
  const patch = await req.json();
  const lead = db.updateLead(Number(id), patch);
  return NextResponse.json(lead);
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const bizId = db.getLeadBizId(Number(id));
  if (!bizId || !(await canAccessBusiness(bizId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (db.leadIsMirrored(Number(id))) {
    return NextResponse.json(
      { error: "Managed in FLAIR OS. Changes arrive with write-back (phase 2).", code: "flair_os_managed" },
      { status: 409 }
    );
  }
  db.deleteLead(Number(id));
  return NextResponse.json({ ok: true });
}
