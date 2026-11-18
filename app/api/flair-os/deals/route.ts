import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server-auth";
import { FLAIR_OS_BUSINESS_ID, flairOsEnabled, flairOsWriteEnabled } from "@/lib/flair-os/config";
import { createDeal, type NewDeal } from "@/lib/flair-os/write";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { writes_off: 409, not_configured: 400, not_found: 404, invalid: 400, flair_os: 502 };

/**
 * Owner only. Create a deal in FLAIR OS and return its mirror row as a Lead.
 * This is what "New lead" on the FLAIR Pipeline does in two-way mode: the
 * record is born in FLAIR OS, never only here.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!flairOsEnabled(FLAIR_OS_BUSINESS_ID)) return NextResponse.json({ error: "FLAIR OS is not configured" }, { status: 400 });
  if (!flairOsWriteEnabled()) return NextResponse.json({ error: "Writing to FLAIR OS is off.", code: "writes_off" }, { status: 409 });
  const body = (await req.json().catch(() => null)) as Partial<NewDeal> | null;
  if (!body || typeof body.company !== "string" || !body.company.trim()) {
    return NextResponse.json({ error: "company is required" }, { status: 400 });
  }
  const r = await createDeal(
    {
      company: body.company,
      stageSlug: typeof body.stageSlug === "string" ? body.stageSlug : undefined,
      contactName: typeof body.contactName === "string" ? body.contactName : null,
      email: typeof body.email === "string" ? body.email : null,
      phone: typeof body.phone === "string" ? body.phone : null,
      website: typeof body.website === "string" ? body.website : null,
      notes: typeof body.notes === "string" ? body.notes : null,
      dealValue: typeof body.dealValue === "number" ? body.dealValue : null,
      opportunityName: typeof body.opportunityName === "string" ? body.opportunityName : null,
      nextCheckInAt: typeof body.nextCheckInAt === "string" ? body.nextCheckInAt : null,
      forceCreate: body.forceCreate === true,
    },
    { trigger: "new_lead" }
  );
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: STATUS[r.code] ?? 502 });
  return NextResponse.json({ ok: true, lead: r.value.lead, dealId: r.value.dealId, deduped: r.value.deduped }, { status: r.value.deduped ? 200 : 201 });
}
