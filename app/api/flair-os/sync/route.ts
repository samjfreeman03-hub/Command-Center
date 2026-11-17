import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server-auth";
import { FLAIR_OS_BUSINESS_ID, flairOsEnabled } from "@/lib/flair-os/config";
import { runMirrorCycle } from "@/lib/flair-os/sync";

export const dynamic = "force-dynamic";

/**
 * Owner only: run one pull now. Dry run is the FLAIR_OS_SYNC_DRY_RUN env
 * switch, not a request option (the page explains the state instead). A
 * request body `{ dryRun: true }` can force a dry run for scripts; nothing in
 * a request can turn dry run off while the env switch is on (a Refresh from
 * the page used to do exactly that, fixed 2026-11-17).
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!flairOsEnabled(FLAIR_OS_BUSINESS_ID)) {
    return NextResponse.json({ error: "FLAIR OS is not configured" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const summary = await runMirrorCycle({ trigger: "manual", dryRun: body?.dryRun === true ? true : undefined });
  return NextResponse.json(summary, { status: summary.ok ? 200 : 502 });
}
