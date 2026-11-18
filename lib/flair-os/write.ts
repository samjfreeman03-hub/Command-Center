import { db } from "@/lib/db";
import type { Lead, Todo } from "@/lib/types";
import { flairOsClientFromEnv, FlairOsClient, FlairOsError } from "./client";
import { FLAIR_OS_AGENT, flairOsConfigured, flairOsWriteEnabled } from "./config";
import { rollupStage, type StageFlags } from "./stage-map";
import { flairOsStore, type FieldChange } from "./store";
import { arrayFrom, normalizeDeal, normalizeTask, type FlairOsDeal, type FlairOsTask } from "./types";

/**
 * Command Center to FLAIR OS: the write-through path of the two-way design
 * (docs/integrations/FLAIR_OS_TWO_WAY_PLAN.md, section 3).
 *
 * Every function here calls the FLAIR OS write tool first and only then
 * touches the mirror, by re-reading the record with `get_pipeline_deal` (the
 * one write response shape we do not have to guess). A failed write changes
 * nothing locally. Each success is logged with direction "push", the field
 * changes the mirror saw, and `agent: "CommandCenter"` goes on the wire so
 * Tyler's source chip says where it came from.
 *
 * Nothing runs unless FLAIR_OS_WRITE_ENABLED=1 and dry run is off; the client
 * refuses write tools otherwise, and the API routes check first so the error
 * is a plain sentence rather than a failed call.
 */

export type WriteCode = "writes_off" | "not_configured" | "not_found" | "invalid" | "flair_os";
export type WriteResult<T> = { ok: true; value: T } | { ok: false; error: string; code: WriteCode };

export type DealPatch = {
  stageSlug?: string;
  salesStatus?: "active" | "nurture" | "won" | "lost";
  company?: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  notes?: string | null;
  dealValue?: number | null;
  opportunityName?: string | null;
  nextCheckInAt?: string | null;
  waitingOn?: string | null;
  assigneeId?: string | null;
};

export type NewDeal = {
  company: string;
  stageSlug?: string;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  notes?: string | null;
  dealValue?: number | null;
  opportunityName?: string | null;
  nextCheckInAt?: string | null;
  /** FLAIR OS dedupes by email or company unless this is set. */
  forceCreate?: boolean;
};

type Ctx = { trigger: string; leadId?: number | null };

const DEAL_PATCH_KEYS: (keyof DealPatch)[] = ["stageSlug", "salesStatus", "company", "contactName", "email", "phone", "website", "notes", "dealValue", "opportunityName", "nextCheckInAt", "waitingOn", "assigneeId"];

function fail<T>(code: WriteCode, error: string): WriteResult<T> {
  return { ok: false, code, error };
}

function fromError<T>(e: unknown): WriteResult<T> {
  if (e instanceof FlairOsError) {
    if (e.code === "writes_off") return fail("writes_off", "Writing to FLAIR OS is off.");
    if (/not found|no pipeline deal|unknown deal|does not exist|no task/i.test(e.message)) return fail("not_found", e.message);
    return fail("flair_os", e.message);
  }
  return fail("flair_os", (e as Error).message || "FLAIR OS did not answer");
}

type Gate = { client: FlairOsClient; error?: undefined } | { client?: undefined; error: { ok: false; error: string; code: WriteCode } };

function client(): Gate {
  if (!flairOsConfigured()) return { error: { ok: false, code: "not_configured", error: "FLAIR OS is not configured." } };
  if (!flairOsWriteEnabled()) return { error: { ok: false, code: "writes_off", error: "Writing to FLAIR OS is off. Turn it on in Railway with FLAIR_OS_WRITE_ENABLED=1 once the key allows it." } };
  const c = flairOsClientFromEnv();
  if (!c) return { error: { ok: false, code: "not_configured", error: "FLAIR OS is not configured." } };
  return { client: c };
}

/** Write-enabled means configured, the switch is on, and dry run is off. */
export function canWriteToFlairOs(): boolean {
  return flairOsConfigured() && flairOsWriteEnabled();
}

function stageFlags(): Map<string, StageFlags> {
  return new Map(flairOsStore.listStages().map((s) => [s.slug.toLowerCase(), { isWon: s.is_won, isLost: s.is_lost, isLifecycle: s.is_lifecycle }]));
}

/** Put one FLAIR OS deal into the mirror (never dry run: this is the result of a write we made). */
function mirrorDeal(deal: FlairOsDeal): { leadId: number; action: "created" | "updated" | "unchanged"; changes: FieldChange[] } {
  flairOsStore.rememberProfile(deal.ownerId, deal.ownerName);
  const flags = stageFlags().get(deal.stage?.toLowerCase() ?? "");
  const rollup = rollupStage(deal.stage, deal.salesStatus, deal.lastContactedMs !== null, flags);
  const r = flairOsStore.upsertMirroredLead(deal, rollup, { dryRun: false });
  return { leadId: r.localId as number, action: r.action, changes: r.changes };
}

function pushLog(entry: { kind: string; flairOsId: string | null; localId: number | null; action: string; changes?: FieldChange[] | null; message?: string | null; trigger: string; result?: string }) {
  flairOsStore.appendLog({
    direction: "push",
    trigger: entry.trigger,
    record_kind: entry.kind,
    flair_os_id: entry.flairOsId,
    local_id: entry.localId,
    action: entry.action,
    changes: entry.changes ?? null,
    result: entry.result ?? "ok",
    message: entry.message ?? null,
  });
}

function cleanPatch(patch: DealPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of DEAL_PATCH_KEYS) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (typeof v === "string") {
      const t = v.trim();
      out[k] = t === "" ? null : t;
    } else {
      out[k] = v ?? null;
    }
  }
  return out;
}

/** Re-read one deal from FLAIR OS and refresh its mirror row. The truth after any write. */
export async function refreshDeal(dealId: string, ctx: Ctx = { trigger: "refresh" }): Promise<WriteResult<{ leadId: number; lead: Lead; deal: FlairOsDeal; changes: FieldChange[] }>> {
  const c = client();
  if (c.error) return c.error;
  try {
    const raw = await c.client.call<unknown>("get_pipeline_deal", { dealId });
    const deal = normalizeDeal((raw as { deal?: unknown })?.deal ?? raw);
    if (!deal) return fail("flair_os", "FLAIR OS returned a deal without an id.");
    const m = mirrorDeal(deal);
    return { ok: true, value: { leadId: m.leadId, lead: db.getLead(m.leadId), deal, changes: m.changes } };
  } catch (e) {
    return fromError(e);
  }
}

/** Change fields on a FLAIR OS deal, then mirror what FLAIR OS now holds. */
export async function updateDeal(dealId: string, patch: DealPatch, ctx: Ctx): Promise<WriteResult<{ leadId: number; lead: Lead; changes: FieldChange[] }>> {
  const c = client();
  if (c.error) return c.error;
  const args = cleanPatch(patch);
  if (!Object.keys(args).length) return fail("invalid", "Nothing to change.");
  try {
    await c.client.call<unknown>("update_pipeline_deal", { dealId, ...args, agent: FLAIR_OS_AGENT });
  } catch (e) {
    const r = fromError<never>(e);
    pushLog({ kind: "deal", flairOsId: dealId, localId: ctx.leadId ?? flairOsStore.leadIdForDeal(dealId), action: "update", trigger: ctx.trigger, result: "error", message: r.ok ? null : r.error });
    return r;
  }
  const refreshed = await refreshDeal(dealId, ctx);
  if (!refreshed.ok) {
    // The write landed but the re-read did not; the next pull will catch up. Say so.
    pushLog({ kind: "deal", flairOsId: dealId, localId: ctx.leadId ?? null, action: "update", trigger: ctx.trigger, result: "ok", message: `Written; re-read failed: ${refreshed.error}` });
    return fail("flair_os", `Saved in FLAIR OS, but reading it back failed: ${refreshed.error}`);
  }
  pushLog({ kind: "deal", flairOsId: dealId, localId: refreshed.value.leadId, action: "update", trigger: ctx.trigger, changes: refreshed.value.changes, message: Object.keys(args).join(", ") });
  return { ok: true, value: { leadId: refreshed.value.leadId, lead: refreshed.value.lead, changes: refreshed.value.changes } };
}

/** Append a timeline entry on a deal (FLAIR OS prefers this over editing deal.notes). Kept locally too, since FLAIR OS has no activity read. */
export async function addDealNote(dealId: string, body: string, opts: Ctx & { kind?: "note" | "email" | "call"; touchContact?: boolean }): Promise<WriteResult<{ activityId: string; leadId: number | null }>> {
  const c = client();
  if (c.error) return c.error;
  const text = body.trim();
  if (!text) return fail("invalid", "The note is empty.");
  const kind = opts.kind ?? "note";
  let raw: unknown;
  try {
    raw = await c.client.call<unknown>("add_pipeline_activity", { dealId, body: text, kind, agent: FLAIR_OS_AGENT, touchContact: opts.touchContact === true });
  } catch (e) {
    const r = fromError<never>(e);
    pushLog({ kind: "activity", flairOsId: dealId, localId: opts.leadId ?? null, action: "create", trigger: opts.trigger, result: "error", message: r.ok ? null : r.error });
    return r;
  }
  const act = (raw as { activity?: Record<string, unknown> })?.activity ?? (raw as Record<string, unknown>) ?? {};
  const activityId = typeof act.id === "string" && act.id ? act.id : `cc:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
  const leadId = opts.leadId ?? flairOsStore.leadIdForDeal(dealId);
  flairOsStore.upsertActivities(dealId, leadId, [{ id: activityId, dealId, kind, body: text, actor: "Sam (Command Center)", occurredMs: Date.now() }], { dryRun: false });
  pushLog({ kind: "activity", flairOsId: dealId, localId: leadId, action: "create", trigger: opts.trigger, message: text.slice(0, 120) });
  if (opts.touchContact) await refreshDeal(dealId, opts);
  return { ok: true, value: { activityId, leadId } };
}

/** Create a dated next action on a deal, then mirror it as a todo. */
export async function addDealTask(dealId: string, task: { title: string; dueAt: string; notes?: string | null; actionType?: string }, ctx: Ctx): Promise<WriteResult<{ todoId: number | null; taskId: string | null }>> {
  const c = client();
  if (c.error) return c.error;
  const title = task.title.trim();
  if (!title) return fail("invalid", "The task needs a title.");
  if (!/^\d{4}-\d{2}-\d{2}/.test(task.dueAt)) return fail("invalid", "The task needs a date.");
  let raw: unknown;
  try {
    raw = await c.client.call<unknown>("create_pipeline_task", { dealId, title, dueAt: task.dueAt, actionType: task.actionType ?? "follow_up", notes: task.notes?.trim() || null, agent: FLAIR_OS_AGENT });
  } catch (e) {
    const r = fromError<never>(e);
    pushLog({ kind: "task", flairOsId: dealId, localId: ctx.leadId ?? null, action: "create", trigger: ctx.trigger, result: "error", message: r.ok ? null : r.error });
    return r;
  }
  const t: FlairOsTask | null = normalizeTask((raw as { task?: unknown })?.task ?? raw) ?? null;
  let todoId: number | null = null;
  if (t) {
    const leadId = ctx.leadId ?? flairOsStore.leadIdForDeal(dealId);
    const r = flairOsStore.upsertMirroredTodo({ ...t, dealId: t.dealId ?? dealId }, leadId, { dryRun: false });
    todoId = r.localId;
  }
  pushLog({ kind: "task", flairOsId: t?.id ?? dealId, localId: todoId, action: "create", trigger: ctx.trigger, message: title });
  return { ok: true, value: { todoId, taskId: t?.id ?? null } };
}

/** Tick a FLAIR OS task from the Command Center: FLAIR OS first, then the mirrored todo. */
export async function completeDealTask(todoId: number, ctx: Ctx): Promise<WriteResult<{ todo: Todo }>> {
  const c = client();
  if (c.error) return c.error;
  const row = db.getTodo(todoId);
  if (!row || !row.flair_os_id) return fail("not_found", "That task is not mirrored from FLAIR OS.");
  if (row.status === "done") return { ok: true, value: { todo: row } };
  try {
    await c.client.call<unknown>("complete_pipeline_task", { taskId: row.flair_os_id, agent: FLAIR_OS_AGENT });
  } catch (e) {
    const r = fromError<never>(e);
    pushLog({ kind: "task", flairOsId: row.flair_os_id, localId: todoId, action: "complete", trigger: ctx.trigger, result: "error", message: r.ok ? null : r.error });
    return r;
  }
  const todo = db.markTodoDone(todoId);
  pushLog({ kind: "task", flairOsId: row.flair_os_id, localId: todoId, action: "complete", trigger: ctx.trigger, message: row.title });
  return { ok: true, value: { todo } };
}

function idFrom(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const direct = [r.id, r.dealId, r.deal_id].find((v) => typeof v === "string" && v);
  if (direct) return direct as string;
  for (const k of ["deal", "data", "result"]) {
    const nested = r[k];
    if (nested && typeof nested === "object") {
      const n = idFrom(nested);
      if (n) return n;
    }
  }
  return null;
}

/**
 * Create a deal in FLAIR OS and mirror it. FLAIR OS dedupes by email or
 * company unless `forceCreate`; when it hands back an existing deal, the
 * result says so (`deduped`) and that deal is what gets mirrored.
 */
export async function createDeal(input: NewDeal, ctx: Ctx): Promise<WriteResult<{ dealId: string; leadId: number; lead: Lead; deduped: boolean }>> {
  const c = client();
  if (c.error) return c.error;
  const company = input.company.trim();
  if (!company) return fail("invalid", "A company is required.");
  const args: Record<string, unknown> = {
    company,
    stageSlug: input.stageSlug || "outreach",
    contactName: input.contactName?.trim() || null,
    email: input.email?.trim().toLowerCase() || null,
    phone: input.phone?.trim() || null,
    website: input.website?.trim() || null,
    notes: input.notes?.trim() || null,
    dealValue: input.dealValue ?? null,
    opportunityName: input.opportunityName?.trim() || null,
    nextCheckInAt: input.nextCheckInAt || null,
    source: "command_center",
    agent: FLAIR_OS_AGENT,
    forceCreate: input.forceCreate === true,
  };
  const mirroredBefore = new Set(flairOsStore.mirroredCandidates().map((m) => m.id));
  let raw: unknown;
  try {
    raw = await c.client.call<unknown>("create_pipeline_deal", args);
  } catch (e) {
    const r = fromError<never>(e);
    pushLog({ kind: "deal", flairOsId: null, localId: ctx.leadId ?? null, action: "create", trigger: ctx.trigger, result: "error", message: `${company}: ${r.ok ? "" : r.error}` });
    return r;
  }
  let dealId = idFrom(raw);
  if (!dealId) {
    // Shape unknown: find the deal FLAIR OS now has for this company (newest, email match first).
    try {
      const found = arrayFrom(await c.client.call<unknown>("search_pipeline", { query: company, limit: 20 }), ["deals"]).map(normalizeDeal).filter((d): d is FlairOsDeal => !!d);
      const email = (args.email as string | null) ?? null;
      const pick = (email && found.find((d) => d.email === email)) || [...found].sort((a, b) => (b.createdMs ?? 0) - (a.createdMs ?? 0))[0];
      dealId = pick?.id ?? null;
    } catch {
      /* fall through */
    }
  }
  if (!dealId) return fail("flair_os", "FLAIR OS created the deal but did not say which one; it will appear on the next pull.");
  const refreshed = await refreshDeal(dealId, ctx);
  if (!refreshed.ok) return fail("flair_os", `Created in FLAIR OS, but reading it back failed: ${refreshed.error}`);
  const deduped = mirroredBefore.has(dealId);
  pushLog({ kind: "deal", flairOsId: dealId, localId: refreshed.value.leadId, action: deduped ? "create_deduped" : "create", trigger: ctx.trigger, changes: refreshed.value.changes, message: company });
  return { ok: true, value: { dealId, leadId: refreshed.value.leadId, lead: refreshed.value.lead, deduped } };
}
