import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server-auth";
import { FLAIR_OS_BUSINESS_ID, flairOsEnabled, flairOsWriteEnabled } from "@/lib/flair-os/config";
import { flairOsStore } from "@/lib/flair-os/store";
import { addLeadToFlairOs, compareLeadWithDeal, mergeLeadIntoDeal, type MergeChoices } from "@/lib/flair-os/merge";

export const dynamic = "force-dynamic";

/**
 * Owner only: decisions on Sam's own FLAIR leads (the "Needs my decision" view).
 *   { action: "compare", leadId, dealId }            side by side, read only
 *   { action: "merge", leadId, dealId, choices }     write Sam's facts into the FLAIR OS deal, then link
 *   { action: "add", leadId, forceCreate?, opportunityName?, stageSlug? }
 *                                                   create the deal in FLAIR OS from the lead, then link
 *   { action: "link", leadId, dealId }               link only, nothing written (when writes are off)
 *   { action: "separate", leadId }                   not a FLAIR deal; stop suggesting
 *   { action: "reset", leadId }                      forget a separate decision
 * merge and add answer 409 writes_off when FLAIR_OS_WRITE_ENABLED is not on.
 */
export async function POST(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!flairOsEnabled(FLAIR_OS_BUSINESS_ID)) {
    return NextResponse.json({ error: "FLAIR OS is not configured" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    leadId?: unknown;
    dealId?: unknown;
    choices?: MergeChoices;
    forceCreate?: unknown;
    opportunityName?: unknown;
    stageSlug?: unknown;
  };
  const leadId = Number(body.leadId);
  if (!Number.isInteger(leadId) || leadId <= 0) {
    return NextResponse.json({ error: "leadId is required" }, { status: 400 });
  }
  const dealId = typeof body.dealId === "string" ? body.dealId : "";
  const log = (action: string, extra: { flair_os_id?: string | null; changes?: { field: string; from: unknown; to: unknown }[]; message?: string | null; result?: string }) =>
    flairOsStore.appendLog({ direction: "pull", trigger: "manual", record_kind: "link", local_id: leadId, action, result: extra.result ?? "ok", flair_os_id: extra.flair_os_id ?? null, changes: extra.changes ?? null, message: extra.message ?? null });
  const status = (code: string) => (code === "writes_off" ? 409 : code === "not_found" ? 404 : code === "invalid" ? 400 : 502);

  if (body.action === "compare") {
    if (!dealId) return NextResponse.json({ error: "dealId is required" }, { status: 400 });
    const cmp = compareLeadWithDeal(leadId, dealId);
    if ("error" in cmp) return NextResponse.json({ error: cmp.error }, { status: 404 });
    return NextResponse.json({ ok: true, comparison: cmp, writeEnabled: flairOsWriteEnabled() });
  }
  if (body.action === "merge") {
    if (!dealId) return NextResponse.json({ error: "dealId is required" }, { status: 400 });
    if (!flairOsWriteEnabled()) return NextResponse.json({ error: "Writing to FLAIR OS is off.", code: "writes_off" }, { status: 409 });
    const r = await mergeLeadIntoDeal(leadId, dealId, body.choices ?? {});
    if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: status(r.code) });
    return NextResponse.json({ ok: true, ...r.value, reconciliation: flairOsStore.reconciliation() });
  }
  if (body.action === "add") {
    if (!flairOsWriteEnabled()) return NextResponse.json({ error: "Writing to FLAIR OS is off.", code: "writes_off" }, { status: 409 });
    const r = await addLeadToFlairOs(leadId, {
      forceCreate: body.forceCreate === true,
      opportunityName: typeof body.opportunityName === "string" ? body.opportunityName : null,
      stageSlug: typeof body.stageSlug === "string" ? body.stageSlug : null,
    });
    if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: status(r.code) });
    return NextResponse.json({ ok: true, ...r.value, reconciliation: flairOsStore.reconciliation() });
  }
  if (body.action === "link") {
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
