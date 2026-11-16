import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server-auth";
import { FLAIR_OS_BUSINESS_ID, flairOsEnabled } from "@/lib/flair-os/config";
import { flairOsStore } from "@/lib/flair-os/store";

export const dynamic = "force-dynamic";

/**
 * Owner only: decisions in the "In Command Center only" lane.
 *   { action: "link", leadId, dealId }   the lead becomes the mirror row for that deal
 *   { action: "separate", leadId }       stop suggesting a match for this lead
 *   { action: "reset", leadId }          forget a keep-separate decision
 * Nothing here calls FLAIR OS and nothing of Sam's is deleted.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!flairOsEnabled(FLAIR_OS_BUSINESS_ID)) {
    return NextResponse.json({ error: "FLAIR OS is not configured" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as { action?: string; leadId?: unknown; dealId?: unknown };
  const leadId = Number(body.leadId);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return NextResponse.json({ error: "leadId is required" }, { status: 400 });
  }
  const log = (action: string, extra: { flair_os_id?: string | null; changes?: { field: string; from: unknown; to: unknown }[]; message?: string | null; result?: string }) =>
    flairOsStore.appendLog({ direction: "pull", trigger: "manual", record_kind: "link", local_id: leadId, action, result: extra.result ?? "ok", flair_os_id: extra.flair_os_id ?? null, changes: extra.changes ?? null, message: extra.message ?? null });

  if (body.action === "link") {
    const dealId = typeof body.dealId === "string" ? body.dealId : "";
    if (!dealId) return NextResponse.json({ error: "dealId is required" }, { status: 400 });
    const r = flairOsStore.linkLead(leadId, dealId);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
    log("link", { flair_os_id: dealId, changes: r.changes, message: r.folded ? `Folded mirror row ${r.folded} into lead ${leadId}` : null });
    return NextResponse.json({ ok: true, leadId, dealId, folded: r.folded, reconciliation: flairOsStore.reconciliation() });
  }
  if (body.action === "separate") {
    if (!flairOsStore.keepSeparate(leadId)) return NextResponse.json({ error: "Lead not found or already linked" }, { status: 409 });
    log("keep_separate", {});
    return NextResponse.json({ ok: true, leadId, reconciliation: flairOsStore.reconciliation() });
  }
  if (body.action === "reset") {
    flairOsStore.resetDecision(leadId);
    log("reset_decision", {});
    return NextResponse.json({ ok: true, leadId, reconciliation: flairOsStore.reconciliation() });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
