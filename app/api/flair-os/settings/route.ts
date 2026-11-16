import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server-auth";
import { FLAIR_OS_BUSINESS_ID, flairOsEnabled } from "@/lib/flair-os/config";
import { flairOsStore } from "@/lib/flair-os/store";

export const dynamic = "force-dynamic";

/** Owner only: pause or resume the pull direction. */
export async function PATCH(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!flairOsEnabled(FLAIR_OS_BUSINESS_ID)) {
    return NextResponse.json({ error: "FLAIR OS is not configured" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const patch: { pull_paused?: boolean } = {};
  if (typeof body?.pull_paused === "boolean") patch.pull_paused = body.pull_paused;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }
  flairOsStore.patchSyncState(patch);
  flairOsStore.appendLog({
    direction: "pull",
    trigger: "manual",
    record_kind: "settings",
    action: patch.pull_paused ? "pause" : "resume",
    result: "ok",
  });
  return NextResponse.json(flairOsStore.getSyncState());
}
