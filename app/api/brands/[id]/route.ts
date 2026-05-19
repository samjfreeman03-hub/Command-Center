import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const bizId = db.getBrandBizId(Number(id));
  if (!bizId || !(await canAccessBusiness(bizId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();
  const brand = db.updateBrandContact(Number(id), body);
  return NextResponse.json(brand);
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const bizId = db.getBrandBizId(Number(id));
  if (!bizId || !(await canAccessBusiness(bizId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  db.deleteBrandContact(Number(id));
  return NextResponse.json({ ok: true });
}
