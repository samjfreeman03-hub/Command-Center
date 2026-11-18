import { db } from "@/lib/db";
import type { Lead } from "@/lib/types";
import { stripMarkup } from "@/lib/markup";
import { todayLA } from "@/lib/dates";
import { CC_TO_FLAIR_OS_STAGE, FLAIR_OS_WRITABLE_STAGES } from "./stage-map";
import { flairOsStore, type FieldChange } from "./store";
import { addDealNote, addDealTask, createDeal, type DealPatch, updateDeal, type WriteResult } from "./write";

/**
 * Merging one of Sam's Command Center leads into a FLAIR OS deal, the two-way
 * way (docs/integrations/FLAIR_OS_TWO_WAY_PLAN.md, section 3.4): everything
 * Sam knows that FLAIR OS lacks goes INTO FLAIR OS first, then the lead
 * becomes the mirror row. Nothing is kept on this side only, apart from
 * attachments and categories, which FLAIR OS has no field for.
 */

export type FieldState = "same" | "gap" | "conflict" | "os_only" | "empty";

export type CompareField = {
  /** Command Center column name. */
  key: "company" | "contact_name" | "contact_email" | "contact_phone" | "value_cents" | "next_action" | "next_action_date";
  label: string;
  /** FLAIR OS argument the value is written to. */
  osArg: keyof DealPatch;
  cc: string | null;
  os: string | null;
  state: FieldState;
};

export type StageCompare = {
  ccStage: Lead["stage"];
  /** FLAIR OS slug the Command Center stage maps to. */
  ccAsSlug: string;
  osSlug: string | null;
  osLabel: string | null;
  /** True when Sam's stage is further along than FLAIR OS's; the sheet offers the move. */
  ccAhead: boolean;
};

export type Comparison = {
  leadId: number;
  dealId: string;
  lead: { name: string; company: string | null; stage: Lead["stage"] };
  deal: { company: string | null; contactName: string | null; stage: string | null; owner: string | null };
  fields: CompareField[];
  stage: StageCompare;
  /** Sam's notes, markup stripped, as they would be posted on the FLAIR OS timeline. */
  notePreview: string | null;
  /** Next action worth creating as a dated FLAIR OS task. */
  taskCandidate: { title: string; dueAt: string } | null;
  attachments: number;
  categories: string[];
};

export type MergeChoices = {
  /** Per conflicting field: whose value FLAIR OS should hold. Missing means FLAIR OS keeps its own. */
  fields?: Record<string, "cc" | "os">;
  pushNote?: boolean;
  pushTask?: boolean;
  moveStage?: boolean;
};

export type MergeOutcome = {
  leadId: number;
  dealId: string;
  lead: Lead;
  written: string[];
  notePosted: boolean;
  taskCreated: boolean;
  stageMoved: boolean;
  folded: number | null;
  changes: FieldChange[];
};

/** Progression rank of FLAIR OS stages; higher means further along. Lost and paused are off the scale. */
const STAGE_RANK: Record<string, number> = {
  outreach: 0,
  "ambassador-sourcing": 0,
  engaged: 1,
  "first-call": 1,
  meeting: 1,
  "proposal-owed": 2,
  proposal: 3,
  contract: 4,
  invoice: 5,
  signed: 6,
  campaign: 7,
  accounting: 8,
  closed: 9,
};

export const CC_TO_OS_STAGE = CC_TO_FLAIR_OS_STAGE;
export const WRITABLE_STAGE_SLUGS = FLAIR_OS_WRITABLE_STAGES;

function text(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function money(cents: unknown): string | null {
  if (typeof cents !== "number" || !Number.isFinite(cents) || cents <= 0) return null;
  return String(Math.round(cents) / 100);
}

function state(cc: string | null, os: string | null, loose = false): FieldState {
  if (cc === null && os === null) return "empty";
  if (cc === null) return "os_only";
  if (os === null) return "gap";
  const a = loose ? cc.toLowerCase().replace(/\s+/g, " ") : cc;
  const b = loose ? os.toLowerCase().replace(/\s+/g, " ") : os;
  return a === b ? "same" : "conflict";
}

function shellFor(dealId: string): Record<string, unknown> | null {
  const leadId = flairOsStore.leadIdForDeal(dealId);
  if (!leadId) return null;
  return db.getLead(leadId) as unknown as Record<string, unknown>;
}

/** Side by side: what Sam's lead holds against what FLAIR OS holds for the deal. Read only. */
export function compareLeadWithDeal(leadId: number, dealId: string): Comparison | { error: string } {
  let lead: Lead;
  try {
    lead = db.getLead(leadId);
  } catch {
    return { error: "Lead not found" };
  }
  if (!lead || lead.business_id !== "flair") return { error: "Lead not found" };
  if (lead.flair_os_id) return { error: "That lead is already linked to FLAIR OS" };
  const shell = shellFor(dealId);
  if (!shell) return { error: "That FLAIR OS deal is not mirrored here yet" };

  const row = lead as unknown as Record<string, unknown>;
  const spec: { key: CompareField["key"]; label: string; osArg: keyof DealPatch; fmt?: (v: unknown) => string | null; loose?: boolean }[] = [
    { key: "company", label: "Company", osArg: "company", loose: true },
    { key: "contact_name", label: "Contact", osArg: "contactName", loose: true },
    { key: "contact_email", label: "Email", osArg: "email", loose: true },
    { key: "contact_phone", label: "Phone", osArg: "phone" },
    { key: "value_cents", label: "Deal value", osArg: "dealValue", fmt: money },
    { key: "next_action", label: "Waiting on", osArg: "waitingOn" },
    { key: "next_action_date", label: "Next check-in", osArg: "nextCheckInAt" },
  ];
  const fields: CompareField[] = spec.map((f) => {
    const fmt = f.fmt ?? text;
    const cc = fmt(row[f.key]);
    const os = fmt(shell[f.key]);
    return { key: f.key, label: f.label, osArg: f.osArg, cc, os, state: state(cc, os, f.loose) };
  });

  const osSlug = text(shell.flair_os_stage)?.toLowerCase() ?? null;
  const ccAsSlug = CC_TO_OS_STAGE[lead.stage] ?? "outreach";
  const osRank = osSlug !== null && osSlug in STAGE_RANK ? STAGE_RANK[osSlug] : null;
  const ccRank = STAGE_RANK[ccAsSlug] ?? 0;
  const ccAhead = osRank !== null && ccRank > osRank && lead.stage !== "lost" && lead.stage !== "parked" && lead.stage !== "nurture";
  const stageMeta = flairOsStore.listStages().find((s) => s.slug.toLowerCase() === osSlug);

  const note = lead.notes ? stripMarkup(lead.notes).trim() : "";
  const nextAction = text(lead.next_action);
  const nextDate = text(lead.next_action_date);
  const taskCandidate = nextAction && nextDate && /^\d{4}-\d{2}-\d{2}/.test(nextDate) ? { title: nextAction, dueAt: nextDate.slice(0, 10) } : null;

  return {
    leadId,
    dealId,
    lead: { name: lead.name, company: lead.company, stage: lead.stage },
    deal: { company: text(shell.company), contactName: text(shell.contact_name), stage: osSlug, owner: text(shell.flair_os_owner) },
    fields,
    stage: { ccStage: lead.stage, ccAsSlug, osSlug, osLabel: stageMeta?.label ?? null, ccAhead },
    notePreview: note || null,
    taskCandidate,
    attachments: typeof lead.attachment_count === "number" ? lead.attachment_count : db.listLeadAttachments(leadId).length,
    categories: lead.categories ?? [],
  };
}

function noteHeader(): string {
  return `From Command Center (Sam), ${todayLA()}:`;
}

/**
 * Merge for real: push Sam's facts into FLAIR OS, re-read, then make the lead
 * the mirror row. If the FLAIR OS write fails nothing changes on this side.
 */
export async function mergeLeadIntoDeal(leadId: number, dealId: string, choices: MergeChoices = {}): Promise<WriteResult<MergeOutcome>> {
  const cmp = compareLeadWithDeal(leadId, dealId);
  if ("error" in cmp) return { ok: false, code: "not_found", error: cmp.error };
  const ctx = { trigger: "merge", leadId };

  const patch: DealPatch = {};
  const written: string[] = [];
  for (const f of cmp.fields) {
    const takeCc = f.state === "gap" || (f.state === "conflict" && choices.fields?.[f.key] === "cc");
    if (!takeCc || f.cc === null) continue;
    if (f.osArg === "dealValue") (patch as Record<string, unknown>)[f.osArg] = Number(f.cc);
    else (patch as Record<string, unknown>)[f.osArg] = f.cc;
    written.push(f.label);
  }
  let stageMoved = false;
  if (choices.moveStage && cmp.stage.ccAhead && (WRITABLE_STAGE_SLUGS as readonly string[]).includes(cmp.stage.ccAsSlug)) {
    patch.stageSlug = cmp.stage.ccAsSlug;
    written.push("Stage");
    stageMoved = true;
  }

  if (Object.keys(patch).length) {
    const r = await updateDeal(dealId, patch, ctx);
    if (!r.ok) return r;
  }
  let notePosted = false;
  if (choices.pushNote && cmp.notePreview) {
    const r = await addDealNote(dealId, `${noteHeader()}\n${cmp.notePreview}`, { ...ctx, kind: "note" });
    if (!r.ok) return r;
    notePosted = true;
  }
  let taskCreated = false;
  if (choices.pushTask && cmp.taskCandidate) {
    const r = await addDealTask(dealId, { title: cmp.taskCandidate.title, dueAt: cmp.taskCandidate.dueAt }, ctx);
    if (!r.ok) return r;
    taskCreated = true;
  }

  const link = flairOsStore.linkLead(leadId, dealId);
  if (!link.ok) return { ok: false, code: "flair_os", error: `Saved in FLAIR OS, but linking the lead failed: ${link.error}` };
  flairOsStore.appendLog({
    direction: "push",
    trigger: "merge",
    record_kind: "link",
    flair_os_id: dealId,
    local_id: leadId,
    action: "merge",
    changes: link.changes,
    result: "ok",
    message: [written.length ? `Wrote ${written.join(", ")}` : "Nothing to write", notePosted ? "note posted" : null, taskCreated ? "task created" : null, link.folded ? `folded ${link.folded}` : null].filter(Boolean).join("; "),
  });
  return { ok: true, value: { leadId, dealId, lead: db.getLead(leadId), written, notePosted, taskCreated, stageMoved, folded: link.folded, changes: link.changes } };
}

/**
 * A FLAIR lead that has no FLAIR OS deal yet: create the deal there from the
 * lead's fields, then make the lead its mirror row. FLAIR OS dedupes by email
 * or company unless `forceCreate`; a deduped result links to that deal instead
 * and is reported so the UI can say so.
 */
export async function addLeadToFlairOs(leadId: number, opts: { forceCreate?: boolean; opportunityName?: string | null; stageSlug?: string | null } = {}): Promise<WriteResult<MergeOutcome & { deduped: boolean }>> {
  let lead: Lead;
  try {
    lead = db.getLead(leadId);
  } catch {
    return { ok: false, code: "not_found", error: "Lead not found" };
  }
  if (!lead || lead.business_id !== "flair") return { ok: false, code: "not_found", error: "Lead not found" };
  if (lead.flair_os_id) return { ok: false, code: "invalid", error: "That lead is already in FLAIR OS" };
  const company = text(lead.company) ?? text(lead.name);
  if (!company) return { ok: false, code: "invalid", error: "The lead needs a company name first." };
  const wanted = opts.stageSlug && (WRITABLE_STAGE_SLUGS as readonly string[]).includes(opts.stageSlug) ? opts.stageSlug : CC_TO_OS_STAGE[lead.stage] ?? "outreach";
  const stageSlug = (WRITABLE_STAGE_SLUGS as readonly string[]).includes(wanted) ? wanted : "outreach";
  const notes = lead.notes ? stripMarkup(lead.notes).trim() : "";
  const shortNotes = notes.length <= 400 ? notes : null;
  const ctx = { trigger: "add", leadId };

  const created = await createDeal(
    {
      company,
      stageSlug,
      contactName: text(lead.contact_name) ?? (text(lead.name) !== company ? text(lead.name) : null),
      email: text(lead.contact_email),
      phone: text(lead.contact_phone),
      notes: shortNotes || null,
      dealValue: typeof lead.value_cents === "number" && lead.value_cents > 0 ? Math.round(lead.value_cents) / 100 : null,
      opportunityName: text(opts.opportunityName),
      nextCheckInAt: text(lead.next_action_date),
      forceCreate: opts.forceCreate === true,
    },
    ctx
  );
  if (!created.ok) return created;
  const dealId = created.value.dealId;
  const written: string[] = ["Company"];
  if (lead.contact_name) written.push("Contact");
  if (lead.contact_email) written.push("Email");
  if (lead.contact_phone) written.push("Phone");
  if (lead.value_cents) written.push("Deal value");

  let notePosted = false;
  if (notes && !shortNotes) {
    const r = await addDealNote(dealId, `${noteHeader()}\n${notes}`, { ...ctx, kind: "note" });
    if (r.ok) notePosted = true;
  } else if (shortNotes) {
    written.push("Notes");
  }
  if (text(lead.next_action)) {
    const r = await updateDeal(dealId, { waitingOn: lead.next_action }, ctx);
    if (r.ok) written.push("Waiting on");
  }
  let taskCreated = false;
  if (text(lead.next_action) && text(lead.next_action_date) && /^\d{4}-\d{2}-\d{2}/.test(lead.next_action_date as string)) {
    const r = await addDealTask(dealId, { title: lead.next_action as string, dueAt: (lead.next_action_date as string).slice(0, 10) }, ctx);
    if (r.ok) taskCreated = true;
  }

  // The create mirrored a shell row for the new deal; fold it into Sam's lead.
  const link = flairOsStore.linkLead(leadId, dealId);
  if (!link.ok) return { ok: false, code: "flair_os", error: `Created in FLAIR OS, but linking the lead failed: ${link.error}` };
  flairOsStore.appendLog({
    direction: "push",
    trigger: "add",
    record_kind: "link",
    flair_os_id: dealId,
    local_id: leadId,
    action: created.value.deduped ? "add_deduped" : "add",
    changes: link.changes,
    result: "ok",
    message: created.value.deduped ? `FLAIR OS already had ${company}; linked to it` : `Created ${company} in FLAIR OS`,
  });
  return { ok: true, value: { leadId, dealId, lead: db.getLead(leadId), written, notePosted, taskCreated, stageMoved: false, folded: link.folded, changes: link.changes, deduped: created.value.deduped } };
}
