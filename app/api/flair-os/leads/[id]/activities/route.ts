import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessBusiness } from "@/lib/server-auth";
import { flairOsStore } from "@/lib/flair-os/store";

export const dynamic = "force-dynamic";

/** The FLAIR OS timeline mirrored for one lead (read-only). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const leadId = Number(id);
  const bizId = db.getLeadBizId(leadId);
  if (!bizId || !(await canAccessBusiness(bizId))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ activities: flairOsStore.listActivitiesForLead(leadId) });
}
