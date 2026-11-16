import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server-auth";
import { FLAIR_OS_BUSINESS_ID, flairOsEnabled } from "@/lib/flair-os/config";
import { runMirrorCycle } from "@/lib/flair-os/sync";

export const dynamic = "force-dynamic";

/** Owner only: run one pull now. `{ dryRun: true }` reports without writing. */
export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!flairOsEnabled(FLAIR_OS_BUSINESS_ID)) {
    return NextResponse.json({ error: "FLAIR OS is not configured" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const summary = await runMirrorCycle({ trigger: "manual", dryRun: body?.dryRun === true });
  return NextResponse.json(summary, { status: summary.ok ? 200 : 502 });
}
