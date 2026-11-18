import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server-auth";
import { FLAIR_OS_BUSINESS_ID, flairOsEnabled, flairOsWriteEnabled } from "@/lib/flair-os/config";
import { addDealNote, addDealTask, type DealPatch, refreshDeal, updateDeal } from "@/lib/flair-os/write";
import { flairOsStore } from "@/lib/flair-os/store";

export const dynamic = "force-dynamic";

const STATUS: Record<string, number> = { writes_off: 409, not_configured: 400, not_found: 404, invalid: 400, flair_os: 502 };
const PATCH_KEYS: (keyof DealPatch)[] = ["stageSlug", "salesStatus", "company", "contactName", "email", "phone", "website", "notes", "dealValue", "opportunityName", "nextCheckInAt", "waitingOn", "assigneeId"];

function gate(): NextResponse | null {
  if (!flairOsEnabled(FLAIR_OS_BUSINESS_ID)) return NextResponse.json({ error: "FLAIR OS is not configured" }, { status: 400 });
  if (!flairOsWriteEnabled()) return NextResponse.json({ error: "Writing to FLAIR OS is off.", code: "writes_off" }, { status: 409 });
  return null;
}

/** Owner only. Edit a FLAIR OS deal; the mirror row comes back as the lead. */
export async function PATCH(req: Request, ctx: { params: Promise<{ dealId: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = gate();
  if (blocked) return blocked;
  const { dealId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { patch?: Record<string, unknown> } | null;
  const raw = body?.patch;
  if (!raw || typeof raw !== "object") return NextResponse.json({ error: "patch is required" }, { status: 400 });
  const patch: DealPatch = {};
  for (const k of PATCH_KEYS) {
    if (!(k in raw)) continue;
    const v = raw[k];
    if (k === "dealValue") {
      if (v === null || v === "") (patch as Record<string, unknown>)[k] = null;
      else if (typeof v === "number" && Number.isFinite(v)) (patch as Record<string, unknown>)[k] = v;
      else return NextResponse.json({ error: "dealValue must be a number" }, { status: 400 });
      continue;
    }
    if (v === null || typeof v === "string") (patch as Record<string, unknown>)[k] = v;
    else return NextResponse.json({ error: `${k} must be text` }, { status: 400 });
  }
  const leadId = flairOsStore.leadIdForDeal(dealId);
  const r = await updateDeal(dealId, patch, { trigger: "edit", leadId });
  if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: STATUS[r.code] ?? 502 });
  return NextResponse.json({ ok: true, lead: r.value.lead, changes: r.value.changes });
}

/**
 * Owner only. Add to a deal's timeline or next steps:
 *   { kind: "note", body, touchContact? }   add_pipeline_activity
 *   { kind: "task", title, dueAt, notes? }   create_pipeline_task (mirrored as a todo)
 */
export async function POST(req: Request, ctx: { params: Promise<{ dealId: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const blocked = gate();
  if (blocked) return blocked;
  const { dealId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Body is required" }, { status: 400 });
  const leadId = flairOsStore.leadIdForDeal(dealId);
  if (body.kind === "note") {
    if (typeof body.body !== "string") return NextResponse.json({ error: "body is required" }, { status: 400 });
    const r = await addDealNote(dealId, body.body, { trigger: "note", leadId, kind: body.noteKind === "call" || body.noteKind === "email" ? body.noteKind : "note", touchContact: body.touchContact === true });
    if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: STATUS[r.code] ?? 502 });
    const activities = leadId ? flairOsStore.listActivitiesForLead(leadId) : [];
    return NextResponse.json({ ok: true, activityId: r.value.activityId, activities }, { status: 201 });
  }
  if (body.kind === "task") {
    if (typeof body.title !== "string" || typeof body.dueAt !== "string") return NextResponse.json({ error: "title and dueAt are required" }, { status: 400 });
    const r = await addDealTask(dealId, { title: body.title, dueAt: body.dueAt, notes: typeof body.notes === "string" ? body.notes : null }, { trigger: "task", leadId });
    if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: STATUS[r.code] ?? 502 });
    return NextResponse.json({ ok: true, todoId: r.value.todoId, taskId: r.value.taskId }, { status: 201 });
  }
  if (body.kind === "refresh") {
    const r = await refreshDeal(dealId, { trigger: "refresh", leadId });
    if (!r.ok) return NextResponse.json({ error: r.error, code: r.code }, { status: STATUS[r.code] ?? 502 });
    return NextResponse.json({ ok: true, lead: r.value.lead });
  }
  return NextResponse.json({ error: "kind must be note, task or refresh" }, { status: 400 });
}
