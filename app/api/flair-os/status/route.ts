import { NextResponse } from "next/server";
import { canAccessBusiness, isAdmin } from "@/lib/server-auth";
import { FLAIR_OS_BUSINESS_ID, flairOsEnabled, flairOsDryRunDefault, flairOsSelfName, flairOsWriteEnabled } from "@/lib/flair-os/config";
import { todayLA } from "@/lib/dates";
import { flairOsStore } from "@/lib/flair-os/store";
import { schedulerInfo } from "@/lib/flair-os/scheduler";
import { mirrorInFlight } from "@/lib/flair-os/sync";

export const dynamic = "force-dynamic";

/**
 * Mirror status for the FLAIR page: state, FLAIR OS stage metadata, the
 * reconciliation list, the "Your side" numbers, drift and the recent log. Team share links may read it.
 */
export async function GET() {
  if (!(await canAccessBusiness(FLAIR_OS_BUSINESS_ID))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!flairOsEnabled(FLAIR_OS_BUSINESS_ID)) {
    return NextResponse.json({ enabled: false });
  }
  const state = flairOsStore.getSyncState();
  return NextResponse.json({
    enabled: true,
    canSync: await isAdmin(),
    dryRunDefault: flairOsDryRunDefault(),
    writeEnabled: flairOsWriteEnabled(),
    inFlight: mirrorInFlight(),
    scheduler: schedulerInfo(),
    state,
    stages: flairOsStore.listStages(),
    reconciliation: flairOsStore.reconciliation(),
    your_side: flairOsStore.yourSide(flairOsSelfName(), todayLA()),
    drift: flairOsStore.driftReport(),
    log: flairOsStore.listLog(25),
  });
}
